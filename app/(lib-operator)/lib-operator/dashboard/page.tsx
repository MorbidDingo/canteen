"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  BookOpen,
  BookUp,
  RotateCcw,
  CreditCard,
  User,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  ScanBarcode,
} from "lucide-react";
import { useSSE } from "@/lib/events";

// ─── Types ───────────────────────────────────────────────

type ChildInfo = {
  id: string;
  name: string;
  className: string | null;
  section: string | null;
  grNumber: string | null;
};

type IssuanceResult = {
  id: string;
  bookTitle: string;
  bookAuthor: string;
  accessionNumber: string;
  issuedAt: string;
  dueDate: string;
  childName: string;
  className: string | null;
};

type ReturnResult = {
  bookTitle: string;
  bookAuthor: string;
  accessionNumber: string;
  childName: string;
  className: string | null;
  fineAmount: number;
  fineDeducted: boolean;
  wasOverdue: boolean;
  fineModeApplied?: "NONE" | "DAY" | "WEEK";
};

type PendingReturn = {
  id: string;
  issuedAt: string;
  dueDate: string;
  updatedAt: string;
  fineAmount: number;
  accessionNumber: string;
  bookTitle: string;
  bookAuthor: string;
  childName: string;
  childClassName: string | null;
  childSection: string | null;
};

type OperatorMode = "issue" | "return";
type ActiveTab = "issue-return" | "pending-returns";

// ─── Main Page ───────────────────────────────────────────

export default function LibOperatorDashboardPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("issue-return");
  const [mode, setMode] = useState<OperatorMode>("issue");

  // Issue state
  const [childInfo, setChildInfo] = useState<ChildInfo | null>(null);
  const [issuedBatch, setIssuedBatch] = useState<IssuanceResult[]>([]);
  const [rfidLoading, setRfidLoading] = useState(false);

  // Return state
  const [returnedBatch, setReturnedBatch] = useState<ReturnResult[]>([]);

  // Scan loading
  const [scanLoading, setScanLoading] = useState(false);

  // Pending returns
  const [pendingReturns, setPendingReturns] = useState<PendingReturn[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const rfidRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // ─── Fetch pending returns ─────────────────────────────

  const fetchPendingReturns = useCallback(async () => {
    setPendingLoading(true);
    try {
      const res = await fetch("/api/lib-operator/pending-returns");
      const data = await res.json();
      if (data.success) {
        setPendingReturns(data.pendingReturns);
      }
    } catch {
      // silent
    } finally {
      setPendingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "pending-returns") {
      fetchPendingReturns();
    }
  }, [activeTab, fetchPendingReturns]);

  // SSE: refresh pending returns on library updates
  useSSE("library-updated", () => {
    if (activeTab === "pending-returns") {
      fetchPendingReturns();
    }
  });

  // ─── Auto-focus ────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== "issue-return") return;
    if (mode === "issue" && !childInfo) {
      rfidRef.current?.focus();
    } else if (mode === "issue" && childInfo) {
      barcodeRef.current?.focus();
    } else if (mode === "return") {
      barcodeRef.current?.focus();
    }
  }, [activeTab, mode, childInfo]);

  // ─── Return handler ─────────────────────────────────────

  const handleReturn = async (scanInput: string) => {
    const res = await fetch("/api/lib-operator/return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scanInput }),
    });
    const data = await res.json();

    if (!data.success) {
      toast.error(data.reason || "Return failed");
      return;
    }

    toast.success(`Returned: ${data.bookTitle}`);
    setReturnedBatch((prev) => [
      {
        bookTitle: data.bookTitle,
        bookAuthor: data.bookAuthor,
        accessionNumber: data.accessionNumber,
        childName: data.childName,
        className: data.className,
        fineAmount: data.fineAmount,
        fineDeducted: data.fineDeducted,
        wasOverdue: data.wasOverdue,
        fineModeApplied: data.fineModeApplied,
      },
      ...prev,
    ]);
  };

  // ─── Pending return actions ────────────────────────────

  const confirmPendingReturn = async (issuanceId: string, accessionNumber: string) => {
    try {
      const res = await fetch("/api/lib-operator/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanInput: accessionNumber }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.reason || "Confirm failed");
        return;
      }

      toast.success("Return confirmed!");
      fetchPendingReturns();
    } catch {
      toast.error("Failed to confirm return");
    }
  };

  const rejectPendingReturn = async (issuanceId: string) => {
    try {
      const res = await fetch("/api/lib-operator/reject-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issuanceId }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.reason || "Reject failed");
        return;
      }

      toast.success("Return rejected — book still issued.");
      fetchPendingReturns();
    } catch {
      toast.error("Failed to reject return");
    }
  };

  // ─── RFID Lookup (Issue mode) ──────────────────────────

  const [lastRfid, setLastRfid] = useState("");

  const handleRfidScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = rfidRef.current?.value?.trim();
    if (!value) return;

    setRfidLoading(true);
    try {
      const res = await fetch("/api/lib-operator/lookup-student", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfidCardId: value }),
      });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.reason || "Student not found");
        if (rfidRef.current) rfidRef.current.value = "";
        return;
      }

      setChildInfo(data.child);
      setLastRfid(value);
      setIssuedBatch([]);
      if (rfidRef.current) rfidRef.current.value = "";
      setTimeout(() => barcodeRef.current?.focus(), 100);
    } catch {
      toast.error("Lookup failed");
    } finally {
      setRfidLoading(false);
    }
  };

  // ─── Issue handler ─────────────────────────────────────

  const handleIssue = async (scanInput: string) => {
    if (!childInfo || !lastRfid) {
      toast.error("Scan student RFID first");
      return;
    }

    const res = await fetch("/api/lib-operator/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfidCardId: lastRfid, scanInput }),
    });
    const data = await res.json();

    if (!data.success) {
      toast.error(data.reason || "Issue failed");
      return;
    }

    toast.success(`Issued: ${data.issuance.bookTitle}`);
    setIssuedBatch((prev) => [...prev, data.issuance]);
  };

  // ─── Barcode Scan (Issue or Return) ────────────────────

  const handleBarcodeScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = barcodeRef.current?.value?.trim();
    if (!value) return;
    if (barcodeRef.current) barcodeRef.current.value = "";

    setScanLoading(true);
    try {
      if (mode === "issue") {
        await handleIssue(value);
      } else {
        await handleReturn(value);
      }
    } finally {
      setScanLoading(false);
      barcodeRef.current?.focus();
    }
  };

  // ─── Reset issue session ───────────────────────────────

  const resetIssueSession = () => {
    setChildInfo(null);
    setIssuedBatch([]);
    setLastRfid("");
    rfidRef.current?.focus();
  };

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="pb-8">
      <div className="container mx-auto max-w-2xl px-4 pt-5">
        <div className="rounded-2xl border border-[#d4891a]/15 bg-white/70 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#d4891a] shadow-sm">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold">Issue & Return Console</p>
              <p className="text-xs text-muted-foreground">
                Scan cards, issue books, and manage pending returns.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              variant={activeTab === "issue-return" ? "default" : "outline"}
              onClick={() => setActiveTab("issue-return")}
              className={activeTab === "issue-return" ? "bg-[#d4891a] hover:bg-[#d4891a]/90" : ""}
            >
              Issue / Return
            </Button>
            <Button
              variant={activeTab === "pending-returns" ? "default" : "outline"}
              onClick={() => setActiveTab("pending-returns")}
              className={`gap-2 ${activeTab === "pending-returns" ? "bg-[#d4891a] hover:bg-[#d4891a]/90" : ""}`}
            >
              Pending Returns
              {pendingReturns.length > 0 && (
                <Badge className="h-5 min-w-5 px-1 text-[10px]">{pendingReturns.length}</Badge>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Tab: Issue / Return ──────────────────────── */}
      {activeTab === "issue-return" && (
        <div className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              size="lg"
              variant={mode === "issue" ? "default" : "outline"}
              className={`flex-1 gap-2 ${mode === "issue" ? "bg-[#d4891a] hover:bg-[#d4891a]/90" : ""}`}
              onClick={() => {
                setMode("issue");
                setReturnedBatch([]);
                resetIssueSession();
              }}
            >
              <BookUp className="h-5 w-5" />
              Issue
            </Button>
            <Button
              size="lg"
              variant={mode === "return" ? "default" : "outline"}
              className={`flex-1 gap-2 ${mode === "return" ? "bg-[#2eab57] hover:bg-[#2eab57]/90" : ""}`}
              onClick={() => {
                setMode("return");
                setChildInfo(null);
                setIssuedBatch([]);
                setLastRfid("");
              }}
            >
              <RotateCcw className="h-5 w-5" />
              Return
            </Button>
          </div>

          {/* === Issue Mode === */}
          {mode === "issue" && (
            <>
              {/* Step 1: RFID Scan */}
              {!childInfo && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-[#d4891a]" />
                      Scan Student Card
                    </CardTitle>
                    <CardDescription>
                      Tap the RFID card on the reader
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleRfidScan}>
                      <Input
                        ref={rfidRef}
                        placeholder="Waiting for card scan..."
                        className="text-center text-lg font-mono tracking-widest"
                        autoFocus
                        disabled={rfidLoading}
                      />
                    </form>
                    {rfidLoading && (
                      <div className="flex items-center justify-center gap-2 mt-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Looking up student...
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Step 2: Student identified — scan books */}
              {childInfo && (
                <>
                  <Card className="border-[#d4891a]/30">
                    <CardHeader className="pb-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <User className="h-5 w-5 text-[#d4891a]" />
                          {childInfo.name}
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            {childInfo.className}
                            {childInfo.section ? ` — ${childInfo.section}` : ""}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetIssueSession}
                          >
                            Change Student
                          </Button>
                        </div>
                      </div>
                      {childInfo.grNumber && (
                        <CardDescription>GR: {childInfo.grNumber}</CardDescription>
                      )}
                    </CardHeader>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2">
                        <ScanBarcode className="h-5 w-5 text-[#d4891a]" />
                        Scan Book Barcode
                      </CardTitle>
                      <CardDescription>
                        Scan the book&apos;s barcode to issue it to {childInfo.name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleBarcodeScan}>
                        <Input
                          ref={barcodeRef}
                          placeholder="Scan barcode or type accession number / ISBN..."
                          className="text-lg"
                          autoFocus
                          disabled={scanLoading}
                        />
                      </form>
                      {scanLoading && (
                        <div className="flex items-center justify-center gap-2 mt-3 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Issuing...
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Issued batch summary */}
                  {issuedBatch.length > 0 && (
                    <Card className="border-green-300">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-green-700">
                          <CheckCircle className="h-5 w-5" />
                          Issued ({issuedBatch.length} books)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {issuedBatch.map((item, idx) => (
                          <div key={idx} className="rounded-lg bg-green-50 p-3 space-y-1">
                            <p className="font-semibold">{item.bookTitle}</p>
                            <p className="text-sm text-muted-foreground">{item.bookAuthor}</p>
                            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                              <span>Accession: {item.accessionNumber}</span>
                              <span>Due: {new Date(item.dueDate).toLocaleDateString()}</span>
                            </div>
                          </div>
                        ))}
                        <Separator />
                        <Button
                          onClick={resetIssueSession}
                          variant="outline"
                          className="w-full"
                        >
                          Done — Scan Next Student
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </>
          )}

          {/* === Return Mode === */}
          {mode === "return" && (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <ScanBarcode className="h-5 w-5 text-[#2eab57]" />
                    Scan Book to Return
                  </CardTitle>
                  <CardDescription>
                    Scan the book barcode — the student is identified automatically
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleBarcodeScan}>
                    <Input
                      ref={barcodeRef}
                      placeholder="Scan barcode or type accession number / ISBN..."
                      className="text-lg"
                      autoFocus
                      disabled={scanLoading}
                    />
                  </form>
                  {scanLoading && (
                    <div className="flex items-center justify-center gap-2 mt-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing return...
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Returned batch */}
              {returnedBatch.length > 0 && (
                <Card className="border-green-300">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="h-5 w-5" />
                      Returned ({returnedBatch.length} books)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {returnedBatch.map((item, idx) => (
                      <div
                        key={idx}
                        className={`rounded-lg p-3 space-y-1 ${
                          item.wasOverdue ? "bg-amber-50" : "bg-green-50"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold">{item.bookTitle}</p>
                            <p className="text-sm text-muted-foreground">{item.bookAuthor}</p>
                          </div>
                          {item.wasOverdue && (
                            <Badge variant="destructive" className="shrink-0">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Overdue
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span>Accession: {item.accessionNumber}</span>
                          <span>Student: {item.childName}</span>
                          {item.fineAmount > 0 && (
                            <span className="text-red-600 font-medium">
                              Fine: ₹{item.fineAmount.toFixed(2)}
                              {item.fineModeApplied === "WEEK" ? " (weekly)" : item.fineModeApplied === "DAY" ? " (daily)" : ""}
                              {item.fineDeducted ? " (deducted)" : " (pending)"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    <Separator />
                    <Button
                      onClick={() => setReturnedBatch([])}
                      variant="outline"
                      className="w-full"
                    >
                      Clear List
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── Tab: Pending Returns ─────────────────────── */}
      {activeTab === "pending-returns" && (
        <div className="container mx-auto max-w-2xl px-4 py-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Pending Returns</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchPendingReturns}
              disabled={pendingLoading}
            >
              {pendingLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
            </Button>
          </div>

          {pendingReturns.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No pending returns.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingReturns.map((pr) => {
                const dueDate = new Date(pr.dueDate);
                const now = new Date();
                const isOverdue = dueDate < now;

                return (
                  <Card key={pr.id} className={isOverdue ? "border-red-300" : "border-amber-300"}>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold">{pr.bookTitle}</h3>
                          <p className="text-sm text-muted-foreground">{pr.bookAuthor}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                            <span>Accession: {pr.accessionNumber}</span>
                            <span>Student: {pr.childName}</span>
                            <span>
                              Class: {pr.childClassName}
                              {pr.childSection ? ` - ${pr.childSection}` : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="h-3 w-3" />
                            <span className={`text-xs ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                              Due: {dueDate.toLocaleDateString()}
                              {isOverdue && " (overdue)"}
                            </span>
                            {pr.fineAmount > 0 && (
                              <span className="text-xs text-red-600 font-medium">
                                Fine: ₹{pr.fineAmount.toFixed(2)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Return requested: {new Date(pr.updatedAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex gap-2 sm:flex-col sm:gap-2">
                          <Button
                            size="sm"
                            className="flex-1 gap-1 bg-[#2eab57] text-white hover:bg-[#259c4c] sm:flex-none"
                            onClick={() => confirmPendingReturn(pr.id, pr.accessionNumber)}
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1 text-destructive sm:flex-none"
                            onClick={() => rejectPendingReturn(pr.id)}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
