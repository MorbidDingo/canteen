"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { useSSE } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion, BottomSheet } from "@/components/ui/motion";
import { Search, Loader2, BookOpen, X, Heart, Bot, MapPin, Sparkles, Clock3, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BOOK_CATEGORY_LABELS,
  type BookCategory,
} from "@/lib/constants";
import { usePersistedSelection } from "@/lib/use-persisted-selection";
import { triggerHapticFeedback } from "@/lib/haptics";

// ─── Markdown Renderer ──────────────────────────────────────────────────────

function renderSummaryMarkdown(text: string): React.ReactNode[] {
  const lines = text.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const h1 = trimmed.match(/^#\s+(.+)/);
    if (h1) {
      nodes.push(
        <p key={index} className="mt-2 text-[13px] font-bold text-foreground leading-snug">{h1[1]}</p>,
      );
      return;
    }

    const h2 = trimmed.match(/^##\s+(.+)/);
    if (h2) {
      nodes.push(
        <p key={index} className="mt-2 text-[12px] font-semibold text-primary uppercase tracking-wide">{h2[1]}</p>,
      );
      return;
    }

    const h3 = trimmed.match(/^###\s+(.+)/);
    if (h3) {
      nodes.push(
        <p key={index} className="mt-1.5 text-[12px] font-semibold text-foreground/80">{h3[1]}</p>,
      );
      return;
    }

    const bold = trimmed.match(/\*\*(.+)\*\*/);
    if (bold) {
      nodes.push(
        <p key={index} className="mt-1.5 text-[12px] font-semibold text-foreground/90">{bold[1]}</p>,
      );
      return;
    }

    nodes.push(
      <p key={index} className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{trimmed}</p>,
    );
  });

  return nodes;
}


interface ChildOption {
  id: string;
  name: string;
  className: string | null;
  section: string | null;
}

interface ShelfBook {
  id: string;
  libraryId?: string | null;
  libraryName?: string | null;
  libraryLocation?: string | null;
  title: string;
  author: string;
  category: string;
  coverImageUrl: string | null;
  description?: string | null;
  availableCopies?: number;
  requestId?: string | null;
  requestExpiresAt?: string | null;
  mlReasons?: string[];
  metaLabel?: string | null;
  canRequest: boolean;
  isFavourited?: boolean;
  favouriteCount?: number;
  isIssued?: boolean;
}

interface CategoryRail {
  category: string;
  books: ShelfBook[];
}

interface AuthorRail {
  author: string;
  books: ShelfBook[];
}

interface PendingIssueRequest {
  requestId: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  childId: string;
  childName: string | null;
  bookId: string;
  title: string;
  author: string;
  category: string;
  coverImageUrl: string | null;
  libraryId?: string | null;
  libraryName?: string | null;
  libraryLocation?: string | null;
}

interface ShowcaseData {
  children: ChildOption[];
  selectedChildId: string | null;
  filters: {
    query: string;
    category: string;
  };
  selectedLibraryId?: string | null;
  libraries?: Array<{ id: string; name: string; location: string | null }>;
  issueLimit?: {
    maxBooks: number;
    activeCount: number;
    pendingCount: number;
    limitReached: boolean;
  };
  catalog: ShelfBook[];
  pendingRequests: PendingIssueRequest[];
  rails: {
    hotThisWeek: ShelfBook[];
    newcomers: ShelfBook[];
    goats: ShelfBook[];
    mustReads: ShelfBook[];
    personalized?: ShelfBook[];
    categories: CategoryRail[];
    authors?: AuthorRail[];
  };
}

function getCategoryLabel(category: string) {
  return BOOK_CATEGORY_LABELS[category as BookCategory] ?? category;
}

function parseApiError(payload: unknown) {
  if (typeof payload === "object" && payload !== null) {
    const maybeMessage = (payload as { error?: unknown; reason?: unknown }).error;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
    const maybeReason = (payload as { reason?: unknown }).reason;
    if (typeof maybeReason === "string" && maybeReason.trim()) return maybeReason;
  }
  return "Something went wrong";
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TitleCard({
  book,
  onClick,
  onFavouriteToggle,
  favouriteLoading,
}: {
  book: ShelfBook;
  onClick: (book: ShelfBook) => void;
  onFavouriteToggle?: (book: ShelfBook, e: React.MouseEvent) => void;
  favouriteLoading?: boolean;
}) {
  const isPending = Boolean(book.requestId);
  const isUnavailable = !book.canRequest && !isPending;

  return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          triggerHapticFeedback();
          onClick(book);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            triggerHapticFeedback();
            onClick(book);
          }
        }}
        className="group w-[120px] shrink-0 cursor-pointer text-left"
        title={`${book.title} by ${book.author}`}
      >
      <div className={cn(
        "relative aspect-[2/3] w-full overflow-hidden rounded-xl transition-all duration-300",
        "shadow-[0_1px_3px_rgba(0,0,0,0.04)] group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
        "group-hover:scale-[1.03] group-active:scale-[0.97]",
        isUnavailable && "opacity-50",
      )}>
        {book.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.coverImageUrl}
            alt={book.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground/40">
            <BookOpen className="h-8 w-8" />
          </div>
        )}

        {/* Unavailable overlay */}
        {isUnavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="text-[11px] font-medium uppercase tracking-wide text-white">Unavailable</span>
          </div>
        )}

        {/* Status dots — top-left */}
        <div className="absolute left-1.5 top-1.5 flex flex-col gap-1">
          {book.isIssued && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 shadow-sm">
              <CheckCircle2 className="h-3.5 w-3.5 text-white" />
            </span>
          )}
          {isPending && !book.isIssued && <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-sm" />}
          {!isPending && !isUnavailable && !book.isIssued && typeof book.availableCopies === "number" && book.availableCopies > 0 && (
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-sm" />
          )}
        </div>

        {/* Favourite heart — top-right, visible on hover/long-press */}
        {onFavouriteToggle && (
          <button
            type="button"
            aria-label={book.isFavourited ? "Remove from favourites" : "Add to favourites"}
            disabled={favouriteLoading}
            onClick={(e) => { e.stopPropagation(); onFavouriteToggle(book, e); }}
            className={cn(
              "absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full transition-all",
              "opacity-0 group-hover:opacity-100",
              book.isFavourited
                ? "bg-rose-500/90 text-white opacity-100"
                : "bg-black/30 text-white/80 hover:bg-black/50",
            )}
          >
            <Heart className={cn("h-3.5 w-3.5", book.isFavourited && "fill-current")} />
          </button>
        )}
      </div>
    </div>
  );
}

function Rail({
  title,
  books,
  onBookClick,
  onFavouriteToggle,
  favouriteLoadingId,
}: {
  title: string;
  icon?: React.ReactNode;
  books: ShelfBook[];
  onBookClick: (book: ShelfBook) => void;
  onFavouriteToggle?: (book: ShelfBook, e: React.MouseEvent) => void;
  favouriteLoadingId?: string | null;
}) {
  if (books.length === 0) return null;

  return (
    <section className="space-y-2">
      <div
        className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {books.map((book) => (
          <TitleCard
            key={`${title}-${book.id}`}
            book={book}
            onClick={onBookClick}
            onFavouriteToggle={onFavouriteToggle}
            favouriteLoading={favouriteLoadingId === book.id}
          />
        ))}
      </div>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
    </section>
  );
}

export default function LibraryShowcasePage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<ShowcaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuingBookId, setIssuingBookId] = useState<string | null>(null);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
  const [activeBook, setActiveBook] = useState<ShelfBook | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryUsage, setSummaryUsage] = useState<{ used: number; remaining: number; limit: number } | null>(null);
  const [favouriteLoadingId, setFavouriteLoadingId] = useState<string | null>(null);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const {
    value: selectedLibrary,
    setValue: setSelectedLibrary,
    hydrated: libraryScopeHydrated,
  } = usePersistedSelection("certe:selected-library-id");

  const initializedFilters = useRef(false);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(searchInput.trim()), 250);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const fetchShowcase = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedChildId) params.set("childId", selectedChildId);
      if (selectedLibrary) params.set("libraryId", selectedLibrary);
      if (query) params.set("q", query);
      if (category !== "ALL") params.set("category", category);

      const res = await fetch(`/api/library/showcase?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json: ShowcaseData = await res.json();

      setData(json);

      if (!selectedLibrary && json.selectedLibraryId) {
        setSelectedLibrary(json.selectedLibraryId);
      }

      if (!selectedChildId && json.selectedChildId) {
        setSelectedChildId(json.selectedChildId);
      }

      if (!initializedFilters.current) {
        setSearchInput(json.filters.query || "");
        setQuery(json.filters.query || "");
        setCategory(json.filters.category || "ALL");
        initializedFilters.current = true;
      }
    } catch {
      toast.error("Failed to load library showcase");
    } finally {
      setLoading(false);
    }
  }, [selectedChildId, selectedLibrary, query, category, setSelectedLibrary]);

  useSSE("library-updated", () => {
    void fetchShowcase();
  });

  useEffect(() => {
    if (!libraryScopeHydrated) return;
    void fetchShowcase();
  }, [fetchShowcase, libraryScopeHydrated]);

  // Auto-open book detail when ?bookId= query param is present
  useEffect(() => {
    const bookId = searchParams.get("bookId");
    if (!bookId || !data) return;
    const found =
      data.catalog.find((b) => b.id === bookId) ??
      data.rails.hotThisWeek.find((b) => b.id === bookId) ??
      data.rails.newcomers.find((b) => b.id === bookId) ??
      data.rails.goats.find((b) => b.id === bookId) ??
      data.rails.mustReads.find((b) => b.id === bookId) ??
      data.rails.personalized?.find((b) => b.id === bookId);
    if (found && !activeBook) setActiveBook(found);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, searchParams]);

  const requestIssue = useCallback(async (bookId: string) => {
    if (!selectedChildId) {
      toast.error("Select a child first");
      return;
    }

    setIssuingBookId(bookId);
    try {
      const res = await fetch("/api/library/app-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: selectedChildId, bookId }),
      });

      const payload = (await res.json()) as unknown;
      if (!res.ok) {
        toast.error(parseApiError(payload));
        return;
      }

      const alreadyPending =
        typeof payload === "object" &&
        payload !== null &&
        "alreadyPending" in payload &&
        (payload as { alreadyPending?: boolean }).alreadyPending;

      if (alreadyPending) {
        toast.message("This title is already pending for kiosk confirmation.");
      } else {
        toast.success("Issue request queued. Confirm at library kiosk.");
      }
      setActiveBook(null);
      void fetchShowcase();
    } catch {
      toast.error("Failed to queue issue request");
    } finally {
      setIssuingBookId(null);
    }
  }, [selectedChildId, fetchShowcase]);

  const cancelIssueRequest = useCallback(async (requestId: string) => {
    setCancellingRequestId(requestId);
    try {
      const res = await fetch(`/api/library/app-issue?requestId=${encodeURIComponent(requestId)}`, {
        method: "DELETE",
      });

      const payload = (await res.json()) as unknown;
      if (!res.ok) {
        toast.error(parseApiError(payload));
        return;
      }

      toast.success("Issue request deleted");
      void fetchShowcase();
    } catch {
      toast.error("Failed to delete issue request");
    } finally {
      setCancellingRequestId(null);
    }
  }, [fetchShowcase]);

  const toggleFavourite = useCallback(async (target: ShelfBook, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavouriteLoadingId(target.id);

    // Optimistic update across all data
    const applyOptimistic = (prev: ShowcaseData | null): ShowcaseData | null => {
      if (!prev) return prev;
      const patch = (books: ShelfBook[]): ShelfBook[] =>
        books.map((b) =>
          b.id === target.id
            ? {
                ...b,
                isFavourited: !b.isFavourited,
                favouriteCount: Math.max(0, (b.favouriteCount ?? 0) + (b.isFavourited ? -1 : 1)),
              }
            : b,
        );
      return {
        ...prev,
        catalog: patch(prev.catalog),
        rails: {
          ...prev.rails,
          hotThisWeek: patch(prev.rails.hotThisWeek),
          newcomers: patch(prev.rails.newcomers),
          goats: patch(prev.rails.goats),
          mustReads: patch(prev.rails.mustReads),
          personalized: prev.rails.personalized ? patch(prev.rails.personalized) : undefined,
          categories: prev.rails.categories.map((rail) => ({
            ...rail,
            books: patch(rail.books),
          })),
          authors: prev.rails.authors?.map((rail) => ({
            ...rail,
            books: patch(rail.books),
          })),
        },
      };
    };

    setData(applyOptimistic);
    if (activeBook?.id === target.id) {
      setActiveBook((prev) =>
        prev
          ? {
              ...prev,
              isFavourited: !prev.isFavourited,
              favouriteCount: Math.max(0, (prev.favouriteCount ?? 0) + (prev.isFavourited ? -1 : 1)),
            }
          : prev,
      );
    }

    try {
      const res = await fetch("/api/library/favourite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: target.id }),
      });
      if (!res.ok) {
        // Revert optimistic on failure
        setData(applyOptimistic); // toggle back
        toast.error("Failed to update favourite");
      }
    } catch {
      setData(applyOptimistic);
      toast.error("Failed to update favourite");
    } finally {
      setFavouriteLoadingId(null);
    }
  }, [activeBook?.id]);

  const requestBookSummary = useCallback(async (target: ShelfBook) => {
    setSummaryLoading(true);
    setSummaryText(null);
    try {
      const res = await fetch("/api/library/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summaryRequest: true,
          book: {
            id: target.id,
            title: target.title,
            author: target.author,
            description: target.description ?? null,
          },
          messages: [
            {
              role: "user",
              content: `Give me a concise summary for \"${target.title}\" by ${target.author}.`,
            },
          ],
        }),
      });

      const payload = (await res.json()) as {
        reply?: string;
        error?: string;
        usage?: { used: number; remaining: number; limit: number };
      };

      if (!res.ok) {
        toast.error(payload.error || "Failed to generate summary");
        if (payload.usage) {
          setSummaryUsage(payload.usage);
        }
        return;
      }

      setSummaryText(payload.reply || "No summary generated.");
      if (payload.usage) {
        setSummaryUsage(payload.usage);
      }
    } catch {
      toast.error("Failed to generate summary");
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    setSummaryText(null);
    setSummaryLoading(false);
    setSummaryUsage(null);
  }, [activeBook?.id]);

  const rails = useMemo<Array<{ title: string; books: ShelfBook[] }>>(() => {
    if (!data) return [];

    const base = [
      { title: "For You", books: data.rails.personalized ?? [] },
      { title: "Trending", books: data.rails.hotThisWeek },
      { title: "Must Read", books: data.rails.mustReads },
      { title: "New Arrivals", books: data.rails.newcomers },
      { title: "All-Time Greats", books: data.rails.goats },
    ];

    const categoryRails = data.rails.categories.map((rail) => ({
      title: getCategoryLabel(rail.category),
      books: rail.books,
    }));

    const authorRails = (data.rails.authors ?? []).map((rail) => ({
      title: `By ${rail.author}`,
      books: rail.books,
    }));

    return [...base, ...categoryRails, ...authorRails].filter((item) => item.books.length > 0);
  }, [data]);

  const hasActiveFilters = query.length > 0 || category !== "ALL";
  const filteredCatalog = data?.catalog ?? [];
  const pendingRequests = data?.pendingRequests ?? [];
  const issueLimit = data?.issueLimit;

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.children.length === 0) {
    return (
      <div className="app-shell pb-24">
        <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
          No members found.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8 px-5 pb-28 sm:px-8">

        {/* Search bar — rounded-full, muted bg */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="h-11 w-full rounded-full bg-muted/40 pl-11 pr-10 text-[15px] text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:bg-muted/60"
            placeholder="Search books..."
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback();
                setSearchInput("");
                setQuery("");
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Category pills — horizontal scroll */}
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          <Link
            href="/library-history"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-4 text-[13px] font-medium text-primary transition-colors hover:bg-primary/20"
          >
            <BookOpen className="h-3.5 w-3.5" />
            My Books
          </Link>
          <Link
            href="/library-reader"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-muted/50 px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/80 border border-border/40"
          >
            Public
          </Link>
            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback();
                setCategory("ALL");
              }}
              className={cn(
              "h-9 shrink-0 rounded-full px-4 text-[13px] font-medium transition-colors",
              category === "ALL"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-foreground hover:bg-muted/80",
            )}
          >
            All
          </button>
          {Object.entries(BOOK_CATEGORY_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  triggerHapticFeedback();
                  setCategory(key);
                }}
                className={cn(
                "h-9 shrink-0 rounded-full px-4 text-[13px] font-medium transition-colors",
                category === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-foreground hover:bg-muted/80",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Child selector — only when multiple children */}
        {data.children.length > 1 && (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
            {data.children.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  triggerHapticFeedback();
                  setSelectedChildId(c.id);
                }}
                className={cn(
                  "h-8 shrink-0 rounded-full px-3 text-[12px] font-medium transition-colors",
                  (selectedChildId || data.selectedChildId || data.children[0]?.id) === c.id
                    ? "bg-foreground text-background"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted/60",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Pending requests — show requested books with cover and name */}
        {pendingRequests.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-primary" />
              <p className="text-[13px] font-semibold text-foreground">
                {pendingRequests.length} pending {pendingRequests.length === 1 ? "request" : "requests"}
              </p>
              <p className="text-[12px] text-muted-foreground">· Confirm at library kiosk</p>
            </div>
            {pendingRequests.map((req) => (
              <div key={req.requestId} className="flex items-center gap-3 rounded-2xl bg-primary/5 p-3">
                <div className="h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-muted shadow-sm">
                  {req.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={req.coverImageUrl} alt={req.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                      <BookOpen className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground">{req.title}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{req.author}</p>
                  <p className="text-[11px] text-primary">Hold expires {formatDateTime(req.expiresAt)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-xs text-destructive hover:text-destructive"
                  disabled={cancellingRequestId === req.requestId}
                  onClick={() => void cancelIssueRequest(req.requestId)}
                >
                  {cancellingRequestId === req.requestId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : "Cancel"}
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Issue limit info — only shown when no pending requests, since the pending requests
           section above already conveys that the user cannot request more books */}
        {issueLimit && issueLimit.limitReached && pendingRequests.length === 0 && (
          <div className="flex items-center gap-3 rounded-2xl bg-muted/40 p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground">
                Issue limit reached
              </p>
              <p className="text-[12px] text-muted-foreground">
                {issueLimit.activeCount}/{issueLimit.maxBooks} books issued. Return a book to request more.
              </p>
            </div>
          </div>
        )}

        {/* Book rails / search results */}
        <section className="space-y-10">
          {hasActiveFilters ? (
            <section className="space-y-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {query ? `Results for "${query}"` : getCategoryLabel(category)}
              </p>

              {filteredCatalog.length === 0 ? (
                <div className="py-16 text-center">
                  <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20" />
                  <p className="text-[15px] text-muted-foreground">No books found</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                  {filteredCatalog.map((book) => (
                    <TitleCard
                      key={`search-${book.id}`}
                      book={book}
                      onClick={(selectedBook) => setActiveBook(selectedBook)}
                      onFavouriteToggle={(selectedBook, e) => void toggleFavourite(selectedBook, e)}
                      favouriteLoading={favouriteLoadingId === book.id}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : rails.length === 0 ? (
            <div className="py-16 text-center">
              <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20" />
              <p className="text-[15px] text-muted-foreground">No books found</p>
            </div>
          ) : (
            rails.map((rail) => (
              <Rail
                key={rail.title}
                title={rail.title}
                books={rail.books}
                onBookClick={(selectedBook) => setActiveBook(selectedBook)}
                onFavouriteToggle={(selectedBook, e) => void toggleFavourite(selectedBook, e)}
                favouriteLoadingId={favouriteLoadingId}
              />
            ))
          )}
        </section>
      </div>

      {/* Book detail — BottomSheet */}
      <BottomSheet
        open={Boolean(activeBook)}
        onClose={() => setActiveBook(null)}
        snapPoints={[65, 90]}
      >
        {activeBook && (
          <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            {/* Cover + info row */}
            <div className="flex gap-4 pt-2">
              <div className="h-[140px] w-[95px] shrink-0 overflow-hidden rounded-xl bg-muted shadow-sm">
                {activeBook.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeBook.coverImageUrl}
                    alt={activeBook.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                    <BookOpen className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5 py-1">
                <h3 className="text-[20px] font-bold leading-tight tracking-tight text-foreground" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  {activeBook.title}
                </h3>
                <p className="text-[14px] text-muted-foreground">{activeBook.author}</p>
                <p className="text-[12px] text-muted-foreground">
                  {getCategoryLabel(activeBook.category)}
                  {activeBook.libraryName && ` · ${activeBook.libraryName}`}
                </p>
                {typeof activeBook.availableCopies === "number" && (
                  <p className={cn(
                    "text-[12px] font-medium",
                    activeBook.availableCopies > 0 ? "text-emerald-600" : "text-destructive",
                  )}>
                    {activeBook.availableCopies > 0
                      ? `${activeBook.availableCopies} available`
                      : "No copies available"}
                  </p>
                )}
              </div>
            </div>

            {/* Request button */}
            <div className="mt-5">
              <Button
                className={cn(
                  "h-12 w-full rounded-xl text-[15px] font-semibold",
                  !activeBook.requestId && activeBook.canRequest && "shadow-md shadow-primary/20",
                )}
                variant={!activeBook.requestId && activeBook.canRequest ? "default" : "outline"}
                disabled={!activeBook.canRequest || issuingBookId === activeBook.id || Boolean(activeBook.requestId)}
                onClick={() => void requestIssue(activeBook.id)}
              >
                {issuingBookId === activeBook.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {activeBook.requestId
                  ? "Already Pending"
                  : activeBook.canRequest
                    ? `Request for ${data.children.find((c) => c.id === (selectedChildId || data.selectedChildId || data.children[0]?.id))?.name ?? "member"}`
                    : issueLimit?.limitReached
                      ? "Issue Limit Reached"
                      : pendingRequests.length > 0
                        ? "Cancel pending request first"
                        : "Unavailable"}
              </Button>
              {!activeBook.canRequest && !activeBook.requestId && issueLimit && (
                <p className="mt-2 text-center text-[12px] text-muted-foreground">
                  {issueLimit.limitReached
                    ? `${issueLimit.activeCount}/${issueLimit.maxBooks} books issued`
                    : pendingRequests.length > 0
                      ? "Only one active request allowed at a time"
                      : (activeBook.availableCopies ?? 0) <= 0
                        ? "No copies are currently available"
                        : ""}
                </p>
              )}
            </div>

            {/* Action row — favourite + AI summary */}
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-10 flex-1 rounded-xl text-[13px]",
                  activeBook.isFavourited && "text-rose-600",
                )}
                disabled={favouriteLoadingId === activeBook.id}
                onClick={(e) => void toggleFavourite(activeBook, e)}
              >
                {favouriteLoadingId === activeBook.id ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Heart className={cn("mr-1.5 h-4 w-4", activeBook.isFavourited && "fill-current")} />
                )}
                {activeBook.isFavourited ? "Favourited" : "Favourite"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="h-10 flex-1 rounded-xl text-[13px]"
                disabled={summaryLoading}
                onClick={() => void requestBookSummary(activeBook)}
              >
                {summaryLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                {summaryLoading ? "Summarizing..." : "AI Summary"}
              </Button>
            </div>

            {/* About section */}
            {activeBook.description && (
              <div className="mt-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">About this book</p>
                <p className="mt-2 text-[15px] leading-relaxed text-foreground/80">
                  {activeBook.description}
                </p>
              </div>
            )}

            {/* ML reasons */}
            {activeBook.mlReasons && activeBook.mlReasons.length > 0 && (
              <div className="mt-4 rounded-xl bg-primary/5 p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  Why this appears for you
                </p>
                <p className="mt-1 text-[12px] text-primary/70">{activeBook.mlReasons[0]}</p>
              </div>
            )}

            {/* AI Summary */}
            {summaryText && (
              <div className="mt-4 overflow-hidden rounded-2xl border bg-card">
                <div className="flex items-center gap-2 border-b px-4 py-2.5">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="text-[12px] font-semibold text-foreground">AI Summary</span>
                </div>
                <div className="px-4 py-3">{renderSummaryMarkdown(summaryText)}</div>
              </div>
            )}

            {/* Favourite count + usage info */}
            <div className="mt-4 space-y-1">
              {typeof activeBook.favouriteCount === "number" && activeBook.favouriteCount > 0 && (
                <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
                  <Heart className="h-3 w-3 fill-current text-rose-400" />
                  {activeBook.favouriteCount} {activeBook.favouriteCount === 1 ? "person" : "people"} favourited
                </p>
              )}
              {summaryUsage && (
                <p className="text-[12px] text-muted-foreground">
                  AI summaries today: {summaryUsage.used}/{summaryUsage.limit}
                </p>
              )}
              {activeBook.requestId && (
                <p className="flex items-center gap-1 text-[12px] font-medium text-primary">
                  <Clock3 className="h-3 w-3" />
                  Pending until {formatDateTime(activeBook.requestExpiresAt)}
                </p>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
