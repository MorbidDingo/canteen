"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Shield,
  Loader2,
  Save,
  X,
  Search,
  Clock,
  Sparkles,
} from "lucide-react";
import {
  MENU_CATEGORY_LABELS,
  type MenuCategory,
  BOOK_CATEGORIES,
  BOOK_CATEGORY_LABELS,
  type BookCategory,
} from "@/lib/constants";
import { AnomalyInsights } from "@/components/recommendations/anomaly-insights";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import Link from "next/link";

type LibraryBook = {
  id: string;
  title: string;
  author: string;
  category: string;
};

type ChildControl = {
  childId: string;
  childName: string;
  dailySpendLimit: number | null;
  perOrderLimit: number | null;
  blockedCategories: string[];
  blockedItemIds: string[];
  blockedBookCategories: string[];
  blockedBookAuthors: string[];
  blockedBookIds: string[];
  blockedBooks?: LibraryBook[];
  preIssueBookId: string | null;
  preIssueExpiresAt: string | null;
  preIssueDeclinedUntil: string | null;
  preIssueBook?: LibraryBook | null;
};

const ALL_CATEGORIES: MenuCategory[] = [
  "SNACKS",
  "MEALS",
  "DRINKS",
  "PACKED_FOOD",
];

const ALL_BOOK_CATEGORIES: BookCategory[] = [
  BOOK_CATEGORIES.FICTION,
  BOOK_CATEGORIES.NON_FICTION,
  BOOK_CATEGORIES.TEXTBOOK,
  BOOK_CATEGORIES.REFERENCE,
  BOOK_CATEGORIES.PERIODICAL,
  BOOK_CATEGORIES.GENERAL,
];

type ControlMode = "canteen" | "library";

export default function ControlsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const certePlusActive = useCertePlusStore((s) => s.status?.active === true);
  const certePlusResolved = useCertePlusStore((s) => s.status !== null);
  const ensureCertePlusFresh = useCertePlusStore((s) => s.ensureFresh);
  const [children, setChildren] = useState<ChildControl[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [controlMode, setControlMode] = useState<ControlMode>("canteen");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void ensureCertePlusFresh(45_000);
  }, [ensureCertePlusFresh]);

  // Canteen controls
  const [dailyLimit, setDailyLimit] = useState("");
  const [orderLimit, setOrderLimit] = useState("");
  const [blockedCategories, setBlockedCategories] = useState<string[]>([]);

  // Library controls
  const [blockedBookCategories, setBlockedBookCategories] = useState<string[]>([]);
  const [blockedBookAuthors, setBlockedBookAuthors] = useState<string[]>([]);
  const [authorInput, setAuthorInput] = useState("");
  const [blockedBooks, setBlockedBooks] = useState<LibraryBook[]>([]);
  const [bookSearchQuery, setBookSearchQuery] = useState("");
  const [bookSearchResults, setBookSearchResults] = useState<LibraryBook[]>([]);
  const [bookSearchLoading, setBookSearchLoading] = useState(false);

  const [preIssueBook, setPreIssueBook] = useState<LibraryBook | null>(null);
  const [preIssueSearchQuery, setPreIssueSearchQuery] = useState("");
  const [preIssueResults, setPreIssueResults] = useState<LibraryBook[]>([]);
  const [preIssueSearchLoading, setPreIssueSearchLoading] = useState(false);
  const [preIssueExpiresAt, setPreIssueExpiresAt] = useState<string | null>(null);
  const [preIssueDeclinedUntil, setPreIssueDeclinedUntil] = useState<string | null>(null);

  useEffect(() => {
    const requestedMode = searchParams.get("mode");
    if (requestedMode === "canteen" || requestedMode === "library") {
      setControlMode(requestedMode);
    }
  }, [searchParams]);

  const fetchControls = useCallback(async () => {
    try {
      const res = await fetch("/api/controls");
      if (!res.ok) throw new Error();
      const data: ChildControl[] = await res.json();
      setChildren(data);
      if (data.length > 0 && !selectedChildId) {
        setSelectedChildId(data[0].childId);
        populateForm(data[0]);
      }
    } catch {
      toast.error("Failed to load controls");
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  const populateForm = (ctrl: ChildControl) => {
    setDailyLimit(ctrl.dailySpendLimit?.toString() || "");
    setOrderLimit(ctrl.perOrderLimit?.toString() || "");
    setBlockedCategories(ctrl.blockedCategories || []);

    setBlockedBookCategories(ctrl.blockedBookCategories || []);
    setBlockedBookAuthors(ctrl.blockedBookAuthors || []);
    setBlockedBooks(ctrl.blockedBooks || []);
    setPreIssueBook(ctrl.preIssueBook || null);
    setPreIssueExpiresAt(ctrl.preIssueExpiresAt || null);
    setPreIssueDeclinedUntil(ctrl.preIssueDeclinedUntil || null);

    setAuthorInput("");
    setBookSearchQuery("");
    setBookSearchResults([]);
    setPreIssueSearchQuery("");
    setPreIssueResults([]);
  };

  const searchBooks = useCallback(async (query: string, setLoadingState: (v: boolean) => void) => {
    if (query.trim().length < 2) return [];
    setLoadingState(true);
    try {
      const res = await fetch(`/api/library/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!data.success) return [];
      return (data.books || []) as LibraryBook[];
    } catch {
      return [];
    } finally {
      setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    fetchControls();
  }, [fetchControls]);

  useEffect(() => {
    const ctrl = children.find((c) => c.childId === selectedChildId);
    if (ctrl) populateForm(ctrl);
  }, [selectedChildId, children]);

  useEffect(() => {
    if (controlMode !== "library") return;
    const t = setTimeout(async () => {
      if (bookSearchQuery.trim().length < 2) {
        setBookSearchResults([]);
        return;
      }
      const books = await searchBooks(bookSearchQuery, setBookSearchLoading);
      setBookSearchResults(books);
    }, 250);
    return () => clearTimeout(t);
  }, [bookSearchQuery, controlMode, searchBooks]);

  useEffect(() => {
    if (controlMode !== "library") return;
    const t = setTimeout(async () => {
      if (preIssueSearchQuery.trim().length < 2) {
        setPreIssueResults([]);
        return;
      }
      const books = await searchBooks(preIssueSearchQuery, setPreIssueSearchLoading);
      setPreIssueResults(books);
    }, 250);
    return () => clearTimeout(t);
  }, [preIssueSearchQuery, controlMode, searchBooks]);

  const switchControlMode = useCallback(
    (mode: ControlMode) => {
      setControlMode(mode);
      if (searchParams.get("mode") !== mode) {
        router.replace(`/controls?mode=${mode}`, { scroll: false });
      }
    },
    [router, searchParams],
  );

  const toggleCategory = (cat: string) => {
    setBlockedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const toggleBookCategory = (cat: string) => {
    setBlockedBookCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const addAuthor = () => {
    const author = authorInput.trim();
    if (!author) return;
    const exists = blockedBookAuthors.some((a) => a.toLowerCase() === author.toLowerCase());
    if (!exists) {
      setBlockedBookAuthors((prev) => [...prev, author]);
    }
    setAuthorInput("");
  };

  const removeAuthor = (author: string) => {
    setBlockedBookAuthors((prev) => prev.filter((a) => a !== author));
  };

  const addBlockedBook = (selected: LibraryBook) => {
    setBlockedBooks((prev) => {
      if (prev.some((b) => b.id === selected.id)) return prev;
      return [...prev, selected];
    });
  };

  const removeBlockedBook = (bookId: string) => {
    setBlockedBooks((prev) => prev.filter((b) => b.id !== bookId));
  };

  const handleSave = async () => {
    if (!selectedChildId) {
      toast.error("Select a child first");
      return;
    }

    setSaving(true);
    try {
      const payload =
        controlMode === "library"
          ? {
              childId: selectedChildId,
              blockedBookCategories,
              blockedBookAuthors,
              blockedBookIds: blockedBooks.map((b) => b.id),
              preIssueBookId: preIssueBook?.id ?? null,
            }
          : {
              childId: selectedChildId,
              dailySpendLimit: dailyLimit ? parseFloat(dailyLimit) : null,
              perOrderLimit: orderLimit ? parseFloat(orderLimit) : null,
              blockedCategories,
            };

      const res = await fetch("/api/controls", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed to save");
        return;
      }

      toast.success(
        controlMode === "library" ? "Library controls saved!" : "Canteen controls saved!",
      );
      setLoading(true);
      await fetchControls();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!certePlusResolved || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!certePlusActive) {
    const parentMode = searchParams.get("mode") === "library" ? "library" : "canteen";
    return (
      <div className="app-shell-compact space-y-4">
        <Card className="overflow-hidden rounded-2xl border-2 border-amber-200/50">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Shield className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Controls require Certe+</h2>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Set spend limits, block items and manage library restrictions with a Certe+ subscription.
              </p>
            </div>
            <Link href={`/settings?mode=${parentMode}`}>
              <Button variant="premium" size="lg" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Upgrade to Certe+
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="app-shell-compact space-y-4">
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No children found. Add a child first to set controls.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-5 space-y-6 pt-2">
      {/* AI Anomaly Insights */}
      <AnomalyInsights />

      {/* Mode pills */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => switchControlMode("canteen")}
          className={cn(
            "h-9 rounded-full px-5 text-[13px] font-medium transition-colors",
            controlMode === "canteen"
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-foreground hover:bg-muted",
          )}
        >
          Canteen
        </button>
        <button
          type="button"
          onClick={() => switchControlMode("library")}
          className={cn(
            "h-9 rounded-full px-5 text-[13px] font-medium transition-colors",
            controlMode === "library"
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-foreground hover:bg-muted",
          )}
        >
          Library
        </button>
      </div>

      {children.length > 1 && (
        <Select value={selectedChildId} onValueChange={setSelectedChildId}>
          <SelectTrigger>
            <SelectValue placeholder="Select child" />
          </SelectTrigger>
          <SelectContent>
            {children.map((c) => (
              <SelectItem key={c.childId} value={c.childId}>
                {c.childName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {controlMode === "canteen" ? (
        <>
          {/* Spending Limits */}
          <div className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Spending Limits</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="dailyLimit" className="text-[13px]">Daily Spend Limit (₹)</Label>
                <Input
                  id="dailyLimit"
                  type="number"
                  min="0"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  placeholder="No limit"
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orderLimit" className="text-[13px]">Per-Order Limit (₹)</Label>
                <Input
                  id="orderLimit"
                  type="number"
                  min="0"
                  value={orderLimit}
                  onChange={(e) => setOrderLimit(e.target.value)}
                  placeholder="No limit"
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Blocked Categories — toggle rows */}
          <div className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Blocked Categories</p>
            <div className="space-y-0">
              {ALL_CATEGORIES.map((cat) => {
                const isBlocked = blockedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className="flex w-full items-center justify-between py-3 border-b border-border/30 last:border-0"
                  >
                    <span className="text-[14px]">{MENU_CATEGORY_LABELS[cat]}</span>
                    <div className={cn(
                      "h-6 w-11 rounded-full transition-colors relative",
                      isBlocked ? "bg-destructive" : "bg-muted/60",
                    )}>
                      <div className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                        isBlocked ? "translate-x-5" : "translate-x-0.5",
                      )} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <>
          {preIssueDeclinedUntil && new Date(preIssueDeclinedUntil) > new Date() && (
            <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-900 dark:text-amber-200">
              Member declined pre-issue. Next request available after{" "}
              <span className="font-semibold">
                {new Date(preIssueDeclinedUntil).toLocaleString("en-IN")}
              </span>
            </div>
          )}

          {/* Blocked Book Categories — toggle rows */}
          <div className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Blocked Book Categories</p>
            <div className="space-y-0">
              {ALL_BOOK_CATEGORIES.map((cat) => {
                const isBlocked = blockedBookCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleBookCategory(cat)}
                    className="flex w-full items-center justify-between py-3 border-b border-border/30 last:border-0"
                  >
                    <span className="text-[14px]">{BOOK_CATEGORY_LABELS[cat]}</span>
                    <div className={cn(
                      "h-6 w-11 rounded-full transition-colors relative",
                      isBlocked ? "bg-destructive" : "bg-muted/60",
                    )}>
                      <div className={cn(
                        "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                        isBlocked ? "translate-x-5" : "translate-x-0.5",
                      )} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Blocked Authors */}
          <div className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Blocked Authors</p>
            <div className="flex gap-2">
              <Input
                value={authorInput}
                onChange={(e) => setAuthorInput(e.target.value)}
                placeholder="Type author name"
                className="h-10 rounded-xl"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAuthor();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addAuthor} className="rounded-xl shrink-0">
                Add
              </Button>
            </div>
            {blockedBookAuthors.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {blockedBookAuthors.map((author) => (
                  <Badge key={author} variant="secondary" className="gap-1 rounded-full">
                    {author}
                    <button type="button" className="ml-1" onClick={() => removeAuthor(author)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Blocked Books (Search) */}
          <div className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Blocked Books</p>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={bookSearchQuery}
                onChange={(e) => setBookSearchQuery(e.target.value)}
                placeholder="Search books to block"
                className="pl-9 h-10 rounded-xl"
              />
            </div>
            {bookSearchLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching...
              </div>
            ) : bookSearchQuery.length >= 2 && (
              <div className="space-y-1 max-h-52 overflow-auto">
                {bookSearchResults.map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    className="w-full rounded-xl px-3 py-2 text-left hover:bg-muted/40"
                    onClick={() => addBlockedBook(b)}
                  >
                    <p className="text-sm font-medium">{b.title}</p>
                    <p className="text-xs text-muted-foreground">{b.author}</p>
                  </button>
                ))}
                {bookSearchResults.length === 0 && (
                  <p className="text-xs text-muted-foreground">No books found</p>
                )}
              </div>
            )}
            {blockedBooks.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-border/30">
                {blockedBooks.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{b.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{b.author}</p>
                    </div>
                    <button type="button" onClick={() => removeBlockedBook(b.id)} className="shrink-0 p-1.5 rounded-lg hover:bg-muted">
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pre-Issue Request */}
          <div className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Pre-Issue Request</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">Request one book in advance (12h window)</p>
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={preIssueSearchQuery}
                onChange={(e) => setPreIssueSearchQuery(e.target.value)}
                placeholder="Search book for pre-issue"
                className="pl-9 h-10 rounded-xl"
              />
            </div>
            {preIssueSearchLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching...
              </div>
            ) : preIssueSearchQuery.length >= 2 && (
              <div className="space-y-1 max-h-44 overflow-auto">
                {preIssueResults.map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    className="w-full rounded-xl px-3 py-2 text-left hover:bg-muted/40"
                    onClick={() => setPreIssueBook(b)}
                  >
                    <p className="text-sm font-medium">{b.title}</p>
                    <p className="text-xs text-muted-foreground">{b.author}</p>
                  </button>
                ))}
                {preIssueResults.length === 0 && (
                  <p className="text-xs text-muted-foreground">No books found</p>
                )}
              </div>
            )}
            {preIssueBook ? (
              <div className="rounded-xl bg-muted/30 p-3 space-y-1">
                <p className="text-sm font-medium">{preIssueBook.title}</p>
                <p className="text-xs text-muted-foreground">{preIssueBook.author}</p>
                {preIssueExpiresAt && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Expires {new Date(preIssueExpiresAt).toLocaleString("en-IN")}
                  </p>
                )}
                <button type="button" onClick={() => setPreIssueBook(null)} className="text-[12px] font-medium text-primary mt-1">
                  Clear request
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No pre-issue request selected</p>
            )}
          </div>
        </>
      )}

      <Button onClick={handleSave} disabled={saving} className="w-full h-12 rounded-xl text-[15px] font-semibold" variant="premium">
        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        <Save className="h-4 w-4 mr-2" />
        Save {controlMode === "library" ? "Library" : "Canteen"} Controls
      </Button>
    </div>
  );
}
