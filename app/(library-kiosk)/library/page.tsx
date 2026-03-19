"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  BookOpen,
  Search,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  CreditCard,
  RotateCcw,
  BookUp,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { BOOK_CATEGORY_LABELS, type BookCategory } from "@/lib/constants";
import { enqueueOfflineAction } from "@/lib/store/offline-db";

// ─── Types ───────────────────────────────────────────────

type IssuedBook = {
  issuanceId: string;
  issuedAt: string;
  dueDate: string;
  status: string;
  reissueCount: number;
  fineAmount: number;
  accessionNumber: string;
  bookId: string;
  title: string;
  author: string;
  category: string;
  coverImageUrl: string | null;
  isOverdue: boolean;
};

type ChildInfo = {
  id: string;
  name: string;
  className: string | null;
  section: string | null;
  image: string | null;
};

type SearchBook = {
  id: string;
  isbn: string | null;
  title: string;
  author: string;
  publisher: string | null;
  edition: string | null;
  category: string;
  description: string | null;
  coverImageUrl: string | null;
  totalCopies: number;
  availableCopies: number;
};

type PreIssueBook = {
  id: string;
  title: string;
  author: string;
  category: string;
  expiresAt: string;
};

type TerminalPhase =
  | "idle"
  | "identified"
  | "preissue"
  | "search"
  | "result";

type ActionResult = {
  success: boolean;
  message: string;
  details?: Record<string, string>;
};

type OrgContextDevice = {
  id: string;
  deviceType: "GATE" | "KIOSK" | "LIBRARY";
  deviceName: string;
  deviceCode: string;
  status: "ACTIVE" | "DISABLED";
};

// ─── Library Terminal Page ────────────────────────────────

export default function LibraryTerminalPage() {
  const [phase, setPhase] = useState<TerminalPhase>("idle");
  const [childInfo, setChildInfo] = useState<ChildInfo | null>(null);
  const [issuedBooks, setIssuedBooks] = useState<IssuedBook[]>([]);
  const [searchResults, setSearchResults] = useState<SearchBook[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [countdown, setCountdown] = useState(30);
  const [rfidCardId, setRfidCardId] = useState("");
  const [preIssueBook, setPreIssueBook] = useState<PreIssueBook | null>(null);
  const [issueBlockedUntil, setIssueBlockedUntil] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>("Organization");
  const [deviceLabel, setDeviceLabel] = useState<string>("Library");
  const [selectedDeviceCode, setSelectedDeviceCode] = useState<string>("");

  const rfidInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Reset ─────────────────────────────────────────────

  const resetTerminal = useCallback(() => {
    setPhase("idle");
    setChildInfo(null);
    setIssuedBooks([]);
    setSearchResults([]);
    setSearchQuery("");
    setResult(null);
    setRfidCardId("");
    setPreIssueBook(null);
    setIssueBlockedUntil(null);
  }, []);

  // ─── Inactivity auto-reset (30s) ──────────────────────

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (phase !== "idle") {
      inactivityTimer.current = setTimeout(resetTerminal, 30_000);
    }
  }, [phase, resetTerminal]);

  useEffect(() => {
    resetInactivityTimer();
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [phase, resetInactivityTimer]);

  // ─── Auto-focus RFID input in idle phase ───────────────

  useEffect(() => {
    if (phase === "idle" && rfidInputRef.current) {
      rfidInputRef.current.value = "";
      rfidInputRef.current.focus();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "idle") return;
    const interval = setInterval(() => {
      if (
        rfidInputRef.current &&
        document.activeElement !== rfidInputRef.current
      ) {
        rfidInputRef.current.focus();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [phase]);

  // ─── Auto-reset countdown after result ─────────────────

  useEffect(() => {
    if (phase !== "result") return;
    setCountdown(10);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          resetTerminal();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, resetTerminal]);

  // ─── SSE: refresh on library updates ───────────────────

  useEffect(() => {
    const eventSource = new EventSource("/api/events");
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "library-updated" && rfidCardId && phase === "identified") {
          lookupStudent(rfidCardId);
        }
      } catch { /* ignore */ }
    };
    return () => eventSource.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfidCardId, phase]);

  // ─── Fetch org context on mount ────────────────────────

  useEffect(() => {
    const fetchOrgContext = async () => {
      try {
        const res = await fetch("/api/org/context");
        if (!res.ok) return;
        const data = await res.json();
        setOrgName(data.organization?.name || "Organization");
        const devices = ((data.devices || []) as OrgContextDevice[]).filter(
          (d) => d.deviceType === "LIBRARY" && d.status === "ACTIVE",
        );

        const queryCode = typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("deviceCode")?.trim().toUpperCase() ?? null
          : null;
        const storedCode = typeof window !== "undefined" ? localStorage.getItem("selectedLibraryDeviceCode") : null;
        const selected =
          devices.find((d) => d.deviceCode === queryCode) ||
          devices.find((d) => d.deviceCode === storedCode) ||
          devices[0] ||
          null;
        if (selected) {
          setSelectedDeviceCode(selected.deviceCode);
          setDeviceLabel(selected.deviceName || selected.deviceCode || "Library");
          if (typeof window !== "undefined") {
            localStorage.setItem("selectedLibraryDeviceCode", selected.deviceCode);
          }
        }
      } catch {
        // non-blocking on library terminal
      }
    };

    void fetchOrgContext();
  }, []);

  // ─── RFID Tap → Look up student ───────────────────────

  const lookupStudent = async (cardId: string) => {
    try {
      const res = await fetch("/api/library/student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfidCardId: cardId, deviceCode: selectedDeviceCode || undefined }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.reason || "Lookup failed");
        return;
      }

      setChildInfo(data.child);
      setIssuedBooks(data.issuedBooks);
      setRfidCardId(cardId);
      setPreIssueBook(data.preIssueBook ?? null);
      setIssueBlockedUntil(data.issueBlockedUntil ?? null);

      if (data.preIssueBook) {
        setPhase("preissue");
      } else {
        setPhase("identified");
      }
      resetInactivityTimer();
    } catch {
      toast.error("Failed to look up student");
    }
  };

  const handleRfidSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = rfidInputRef.current?.value?.trim();
    if (!value) return;
    lookupStudent(value);
  };

  // ─── Search books ──────────────────────────────────────

  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ q: query });
      if (rfidCardId) params.set("rfidCardId", rfidCardId);

      const res = await fetch(`/api/library/search?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.books);
        if (data.blocked && data.reason) {
          toast.error(data.reason);
        }
      }
    } catch {
      toast.error("Search failed");
    } finally {
      setSearchLoading(false);
    }
    resetInactivityTimer();
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        handleSearch(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // ─── Issue a book ──────────────────────────────────────

  const handleIssue = async (scanInput: string) => {
    if (!rfidCardId || !scanInput) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/library/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfidCardId, scanInput, deviceCode: selectedDeviceCode || undefined }),
      });
      const data = await res.json();

      if (!data.success) {
        setResult({ success: false, message: data.reason || "Issue failed" });
        setPhase("result");
        return;
      }

      setResult({
        success: true,
        message: "Book issued successfully!",
        details: {
          Title: data.issuance.bookTitle,
          Author: data.issuance.bookAuthor,
          "Accession #": data.issuance.accessionNumber,
          "Due Date": new Date(data.issuance.dueDate).toLocaleDateString(),
          Student: data.issuance.childName,
        },
      });
      setPhase("result");
    } catch {
      const queued = await enqueueOfflineAction({
        type: "LIBRARY_ISSUE",
        payload: { rfidCardId, scanInput, deviceCode: selectedDeviceCode || undefined },
      });

      setResult({
        success: true,
        message: `Saved offline (queue #${queued.id.slice(0, 6).toUpperCase()}). Will sync when network returns.`,
        details: {
          RFID: rfidCardId,
          Scan: scanInput,
          Mode: "Offline queued",
        },
      });
      setPhase("result");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePreIssueResponse = async (accepted: boolean) => {
    if (!rfidCardId) return;
    setActionLoading(true);
    try {
      const responseRes = await fetch("/api/library/pre-issue-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfidCardId, accepted }),
      });

      const responseData = await responseRes.json();
      if (!responseData.success) {
        setResult({
          success: false,
          message: responseData.reason || "Could not process pre-issue response.",
        });
        setPhase("result");
        return;
      }

      if (!accepted) {
        setResult({
          success: true,
          message:
            responseData.message ||
            "Okay, you cannot issue a book right now. Please try again after 12 hours.",
        });
        setPhase("result");
        return;
      }

      const issueRes = await fetch("/api/library/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfidCardId, preIssueAccepted: true, deviceCode: selectedDeviceCode || undefined }),
      });

      const issueData = await issueRes.json();
      if (!issueData.success) {
        setResult({
          success: false,
          message: issueData.reason || "Pre-issue book could not be issued.",
        });
        setPhase("result");
        return;
      }

      setResult({
        success: true,
        message: "Pre-issue book issued successfully!",
        details: {
          Title: issueData.issuance.bookTitle,
          Author: issueData.issuance.bookAuthor,
          "Accession #": issueData.issuance.accessionNumber,
          "Due Date": new Date(issueData.issuance.dueDate).toLocaleDateString(),
          Student: issueData.issuance.childName,
        },
      });
      setPhase("result");
    } catch {
      setResult({ success: false, message: "Failed to process pre-issue action." });
      setPhase("result");
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Return a book ────────────────────────────────────

  const handleReturn = async (scanInput: string) => {
    if (!rfidCardId || !scanInput) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/library/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfidCardId, scanInput }),
      });
      const data = await res.json();

      if (!data.success) {
        setResult({ success: false, message: data.reason || "Return failed" });
        setPhase("result");
        return;
      }

      const details: Record<string, string> = {
        Title: data.bookTitle,
        "Accession #": data.accessionNumber,
        Status: data.status === "RETURN_PENDING" ? "Pending Confirmation" : "Returned",
      };
      if (data.fineAmount > 0) {
        details["Fine"] = `₹${data.fineAmount.toFixed(2)}`;
        if (data.fineModeApplied === "WEEK") {
          details["Fine Policy"] = "Per Week";
        } else if (data.fineModeApplied === "DAY") {
          details["Fine Policy"] = "Per Day";
        }
      }

      setResult({
        success: true,
        message: data.message,
        details,
      });
      setPhase("result");
    } catch {
      const queued = await enqueueOfflineAction({
        type: "LIBRARY_RETURN",
        payload: { rfidCardId, scanInput },
      });

      setResult({
        success: true,
        message: `Return saved offline (queue #${queued.id.slice(0, 6).toUpperCase()}). Will sync when network returns.`,
        details: {
          RFID: rfidCardId,
          Scan: scanInput,
          Mode: "Offline queued",
        },
      });
      setPhase("result");
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Reissue a book ───────────────────────────────────

  const handleReissue = async (issuanceId: string) => {
    if (!rfidCardId) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/library/reissue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfidCardId, issuanceId }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.reason || "Reissue failed");
        return;
      }

      toast.success(`Reissued! New due date: ${new Date(data.newDueDate).toLocaleDateString()}`);
      // Refresh student data
      lookupStudent(rfidCardId);
    } catch {
      toast.error("Failed to reissue book");
    } finally {
      setActionLoading(false);
    }
    resetInactivityTimer();
  };

  // ─── Barcode scan handler (for issue/return on identified screen) ─

  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    const value = barcodeInputRef.current?.value?.trim();
    if (!value) return;
    if (barcodeInputRef.current) barcodeInputRef.current.value = "";
    // Context: if in search mode, issue; if in identified mode with existing books, use as return
    // We'll use a mode state to disambiguate
    if (barcodeAction === "issue") {
      handleIssue(value);
    } else {
      handleReturn(value);
    }
  };

  const [barcodeAction, setBarcodeAction] = useState<"issue" | "return">("issue");

  // ─── Render ────────────────────────────────────────────

  // === IDLE PHASE ===
  if (phase === "idle") {
    return (
      <div className="flex flex-col max-h-screen items-center justify-center min-h-screen p-2 sm:p-8 overflow-x-hidden">
        <div className="text-center space-y-4 sm:space-y-6 max-w-md w-full">
          <BookOpen className="h-14 w-14 sm:h-20 sm:w-20 mx-auto text-[#d4891a] animate-pulse" />
          <h1 className="text-2xl sm:text-4xl font-bold text-[#d4891a]">Library Terminal</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{orgName} • {deviceLabel}</p>
          <p className="text-base sm:text-xl text-muted-foreground">
            Tap your RFID card to get started
          </p>
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <CreditCard className="h-6 w-6 sm:h-8 sm:w-8" />
            <span className="text-sm sm:text-lg">Place your card on the reader</span>
          </div>
          <form onSubmit={handleRfidSubmit}>
            <Input
              ref={rfidInputRef}
              type="text"
              className="opacity-0 absolute -z-10"
              autoFocus
              tabIndex={0}
            />
          </form>
        </div>
      </div>
    );
  }

  // === RESULT PHASE ===
  if (phase === "result" && result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-8">
        <div className="text-center space-y-4 sm:space-y-6 max-w-lg w-full">
          {result.success ? (
            <CheckCircle2 className="h-14 w-14 sm:h-20 sm:w-20 mx-auto text-green-500" />
          ) : (
            <XCircle className="h-14 w-14 sm:h-20 sm:w-20 mx-auto text-red-500" />
          )}
          <h2 className="text-xl sm:text-3xl font-bold">
            {result.success ? "Success!" : "Error"}
          </h2>
          <p className="text-base sm:text-xl text-muted-foreground">{result.message}</p>

          {result.details && (
            <Card className="text-left">
              <CardContent className="p-4 sm:p-6 space-y-2">
                {Object.entries(result.details).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm sm:text-base">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <p className="text-sm text-muted-foreground">
            Returning to home in {countdown}s
          </p>
          <Button onClick={resetTerminal} variant="outline" size="lg">
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "preissue" && childInfo && preIssueBook) {
    return (
      <div className="min-h-screen p-4 sm:p-6 max-w-2xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{childInfo.name}</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Parent requested pre-issue
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={resetTerminal} className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Home</span>
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <p className="text-base sm:text-lg font-semibold">Do you want this book?</p>
            <div className="rounded-lg border p-3 sm:p-4 space-y-1">
              <p className="font-medium">{preIssueBook.title}</p>
              <p className="text-sm text-muted-foreground">{preIssueBook.author}</p>
              <p className="text-xs text-muted-foreground">
                Request expires: {new Date(preIssueBook.expiresAt).toLocaleString("en-IN")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="default"
                onClick={() => handlePreIssueResponse(true)}
                disabled={actionLoading}
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, issue it"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handlePreIssueResponse(false)}
                disabled={actionLoading}
              >
                No, not now
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // === IDENTIFIED PHASE (issued books view) ===
  if (phase === "identified" && childInfo) {
    return (
      <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto space-y-4 sm:space-y-6">
        {/* Student info header */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{childInfo.name}</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {childInfo.className}{childInfo.section ? ` - ${childInfo.section}` : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={resetTerminal} className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Home</span>
          </Button>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 sm:gap-3">
          <Button
            size="lg"
            onClick={() => {
              setPhase("search");
              setBarcodeAction("issue");
            }}
            disabled={Boolean(issueBlockedUntil)}
            className="gap-2 flex-1 bg-[#d4891a] hover:bg-[#d4891a]/90 text-sm sm:text-base"
          >
            <BookUp className="h-4 w-4 sm:h-5 sm:w-5" />
            Issue a Book
          </Button>
        </div>

        {issueBlockedUntil && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-3 sm:p-4 text-sm">
              <p className="font-medium text-amber-800">
                You cannot issue a book right now.
              </p>
              <p className="text-amber-700 mt-1">
                Try again after {new Date(issueBlockedUntil).toLocaleString("en-IN")}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Barcode scanner for returns */}
        {issuedBooks.length > 0 && (
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-sm font-medium mb-2">Scan book barcode to return:</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = barcodeInputRef.current?.value?.trim();
                  if (value) {
                    handleReturn(value);
                    if (barcodeInputRef.current) barcodeInputRef.current.value = "";
                  }
                }}
              >
                <Input
                  ref={barcodeInputRef}
                  placeholder="Scan barcode or enter accession number..."
                  className="text-sm sm:text-lg"
                  autoFocus
                />
              </form>
            </CardContent>
          </Card>
        )}

        {/* Issued books list */}
        <div>
          <h2 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">
            Currently Issued ({issuedBooks.length})
          </h2>
          {issuedBooks.length === 0 ? (
            <Card>
              <CardContent className="p-6 sm:p-8 text-center text-muted-foreground">
                <BookOpen className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 opacity-50" />
                <p>No books currently issued.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2 sm:gap-3">
              {issuedBooks.map((issuedBook) => {
                const dueDate = new Date(issuedBook.dueDate);
                const now = new Date();
                const daysLeft = Math.ceil(
                  (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                );
                const isOverdue = issuedBook.isOverdue;
                const isPending = issuedBook.status === "RETURN_PENDING";

                return (
                  <Card
                    key={issuedBook.issuanceId}
                    className={
                      isOverdue
                        ? "border-red-300 bg-red-50"
                        : isPending
                        ? "border-amber-300 bg-amber-50"
                        : ""
                    }
                  >
                    <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm sm:text-base truncate">{issuedBook.title}</h3>
                          {isOverdue && (
                            <Badge variant="destructive" className="shrink-0 text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Overdue
                            </Badge>
                          )}
                          {isPending && (
                            <Badge className="bg-amber-500 shrink-0 text-xs">
                              <Clock className="h-3 w-3 mr-1" />
                              Return Pending
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground">{issuedBook.author}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Accession: {issuedBook.accessionNumber}
                          {" · "}
                          {BOOK_CATEGORY_LABELS[issuedBook.category as BookCategory] ?? issuedBook.category}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 sm:mt-2 text-xs sm:text-sm">
                          <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          <span
                            className={
                              isOverdue
                                ? "text-red-600 font-medium"
                                : daysLeft <= 2
                                ? "text-amber-600 font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            Due: {dueDate.toLocaleDateString()}
                            {isOverdue
                              ? ` (${Math.abs(daysLeft)} days overdue)`
                              : ` (${daysLeft} days left)`}
                          </span>
                        </div>
                        {issuedBook.fineAmount > 0 && (
                          <p className="text-xs sm:text-sm text-red-600 font-medium mt-1">
                            Fine: ₹{issuedBook.fineAmount.toFixed(2)}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex sm:flex-col gap-2 shrink-0">
                        {!isPending && !isOverdue && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReissue(issuedBook.issuanceId)}
                            disabled={actionLoading}
                            className="text-xs sm:text-sm"
                          >
                            <RotateCcw className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
                            Reissue
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // === SEARCH PHASE (browse & issue) ===
  if (phase === "search") {
    return (
      <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold">Issue a Book</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Search by title, author, or ISBN — then scan the barcode
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPhase("identified")} className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        </div>

        {/* Barcode scan (direct issue) */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-sm font-medium mb-2">Scan book barcode to issue directly:</p>
            <form onSubmit={handleBarcodeScan}>
              <Input
                ref={barcodeInputRef}
                placeholder="Scan barcode or enter accession number / ISBN..."
                className="text-sm sm:text-lg"
                autoFocus
              />
            </form>
          </CardContent>
        </Card>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              resetInactivityTimer();
            }}
            placeholder="Search books by title, author, or ISBN..."
            className="pl-9 sm:pl-10 text-sm sm:text-lg h-10 sm:h-12"
          />
        </div>

        {/* Results */}
        {searchLoading ? (
          <div className="flex justify-center py-8 sm:py-12">
            <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-muted-foreground" />
          </div>
        ) : searchResults.length > 0 ? (
          <div className="grid gap-2 sm:gap-3">
            {searchResults.map((searchBook) => (
              <Card key={searchBook.id} className="hover:border-[#d4891a]/30 transition-colors">
                <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base truncate">{searchBook.title}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">{searchBook.author}</p>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-xs text-muted-foreground">
                      <span>
                        {BOOK_CATEGORY_LABELS[searchBook.category as BookCategory] ?? searchBook.category}
                      </span>
                      {searchBook.isbn && <span>ISBN: {searchBook.isbn}</span>}
                      {searchBook.publisher && <span className="hidden sm:inline">{searchBook.publisher}</span>}
                    </div>
                  </div>
                  <div className="flex items-center sm:flex-col sm:items-end gap-2 shrink-0">
                    <Badge
                      variant={searchBook.availableCopies > 0 ? "default" : "secondary"}
                      className={
                        searchBook.availableCopies > 0
                          ? "bg-green-600 text-xs"
                          : "text-xs"
                      }
                    >
                      {searchBook.availableCopies} / {searchBook.totalCopies} available
                    </Badge>
                    {searchBook.availableCopies > 0 && searchBook.isbn && (
                      <Button
                        size="sm"
                        className="gap-1 text-xs sm:text-sm"
                        onClick={() => handleIssue(searchBook.isbn!)}
                        disabled={actionLoading}
                      >
                        {actionLoading ? (
                          <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin" />
                        ) : (
                          <BookUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        )}
                        Issue
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : searchQuery.length >= 2 ? (
          <div className="text-center py-8 sm:py-12 text-muted-foreground">
            <Search className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm sm:text-base">No books found for &quot;{searchQuery}&quot;</p>
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}
