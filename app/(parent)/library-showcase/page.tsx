"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useSSE } from "@/lib/events";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AnimatePresence, motion } from "@/components/ui/motion";
import { Search, Loader2, BookOpen, X, Sparkles, Clock3, TrendingUp, Star, Zap, Heart, Library, Bot, MapPin, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BOOK_CATEGORY_LABELS,
  type BookCategory,
} from "@/lib/constants";
import { LibrarySelector } from "@/components/library-selector";
import { usePersistedSelection } from "@/lib/use-persisted-selection";
import { LibraryRecommendations } from "@/components/recommendations/library-recs";
import { LibraryInsightsWidget } from "@/components/recommendations/library-insights";

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
        <p key={index} className="mt-2 text-[13px] font-bold text-white leading-snug">{h1[1]}</p>,
      );
      return;
    }

    const h2 = trimmed.match(/^##\s+(.+)/);
    if (h2) {
      nodes.push(
        <p key={index} className="mt-2 text-[12px] font-semibold text-indigo-300 uppercase tracking-wide">{h2[1]}</p>,
      );
      return;
    }

    const h3 = trimmed.match(/^###\s+(.+)/);
    if (h3) {
      nodes.push(
        <p key={index} className="mt-1.5 text-[12px] font-semibold text-white/80">{h3[1]}</p>,
      );
      return;
    }

    const bold = trimmed.match(/\*\*(.+)\*\*/);
    if (bold) {
      nodes.push(
        <p key={index} className="mt-1.5 text-[12px] font-semibold text-white/90">{bold[1]}</p>,
      );
      return;
    }

    nodes.push(
      <p key={index} className="mt-1 text-[13px] leading-relaxed text-white/80">{trimmed}</p>,
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
      onClick={() => onClick(book)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(book); } }}
      className="group w-[42vw] min-w-[130px] max-w-[160px] shrink-0 cursor-pointer text-left sm:w-[148px]"
      title={`${book.title} by ${book.author}`}
    >
      <div className={cn(
        "relative h-[220px] overflow-hidden rounded-2xl border bg-muted transition-all duration-300",
        "shadow-[0_8px_20px_-10px_rgba(15,23,42,0.5)] group-hover:shadow-[0_14px_30px_-10px_rgba(15,23,42,0.65)]",
        "group-hover:scale-[1.025] group-active:scale-[0.98]",
        isPending
          ? "border-amber-500/40 ring-1 ring-amber-500/25"
          : "border-white/10 group-hover:border-white/20",
        isUnavailable && "opacity-60",
      )}>
        {book.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.coverImageUrl}
            alt={book.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-white/50">
            <BookOpen className="h-8 w-8" />
          </div>
        )}

        {/* gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

        {/* status badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {isPending && (
            <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              Pending
            </span>
          )}
          {isUnavailable && (
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
              Unavailable
            </span>
          )}
          {typeof book.availableCopies === "number" && book.availableCopies > 0 && !isPending && (
            <span className="rounded-full bg-emerald-500/80 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              {book.availableCopies}
            </span>
          )}
        </div>

        {/* Favourite button */}
        {onFavouriteToggle && (
          <button
            type="button"
            aria-label={book.isFavourited ? "Remove from favourites" : "Add to favourites"}
            disabled={favouriteLoading}
            onClick={(e) => { e.stopPropagation(); onFavouriteToggle(book, e); }}
            className={cn(
              "absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm transition-all",
              book.isFavourited
                ? "bg-rose-500/90 text-white shadow-md shadow-rose-500/30"
                : "bg-black/40 text-white/70 hover:bg-black/60 hover:text-white",
            )}
          >
            <Heart
              className={cn(
                "h-3.5 w-3.5 transition-all",
                book.isFavourited && "fill-current",
              )}
            />
          </button>
        )}

        {/* title */}
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="line-clamp-2 text-xs font-semibold leading-tight text-white drop-shadow">{book.title}</p>
          <p className="mt-0.5 truncate text-[10px] text-white/65">{book.author}</p>
          {book.libraryName ? (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-white/75">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              {book.libraryName}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Rail({
  title,
  icon,
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
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon && (
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
        )}
        <h2 className="text-sm font-bold tracking-tight text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">({books.length})</span>
      </div>
      <div className="relative">
        <div
          className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
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
        {/* Right-edge fade to indicate more content */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
      </div>
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

  const rails = useMemo<Array<{ title: string; icon: React.ReactNode; books: ShelfBook[] }>>(() => {
    if (!data) return [];

    const base = [
      { title: "Trending Now", icon: <TrendingUp className="h-3.5 w-3.5" />, books: data.rails.hotThisWeek },
      { title: "Must Read", icon: <Heart className="h-3.5 w-3.5" />, books: data.rails.mustReads },
      { title: "Newcomers", icon: <Zap className="h-3.5 w-3.5" />, books: data.rails.newcomers },
      { title: "GOATs", icon: <Star className="h-3.5 w-3.5" />, books: data.rails.goats },
      { title: "For You", icon: <Sparkles className="h-3.5 w-3.5" />, books: data.rails.personalized ?? [] },
    ];

    const categoryRails = data.rails.categories.map((rail) => ({
      title: getCategoryLabel(rail.category),
      icon: <Library className="h-3.5 w-3.5" />,
      books: rail.books,
    }));

    const authorRails = (data.rails.authors ?? []).map((rail) => ({
      title: `By ${rail.author}`,
      icon: <User className="h-3.5 w-3.5" />,
      books: rail.books,
    }));

    return [...base, ...categoryRails, ...authorRails].filter((item) => item.books.length > 0);
  }, [data]);

  const hasActiveFilters = query.length > 0 || category !== "ALL";
  const filteredCatalog = data?.catalog ?? [];
  const pendingRequests = data?.pendingRequests ?? [];

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
          No children found.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-shell space-y-5 pb-28">

        <section className="flex justify-start">
          <LibrarySelector
            value={selectedLibrary}
            onChange={setSelectedLibrary}
            showAll
            compact
          />
        </section>

        {/* Search & filter bar */}
        <section className="rounded-2xl border border-border/60 bg-card/70 p-3 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="h-10 rounded-xl pl-9 text-sm"
                placeholder="Search title or author…"
              />
            </div>

            <div className="flex gap-2">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-10 flex-1 rounded-xl text-sm sm:w-[160px] sm:flex-none">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All categories</SelectItem>
                  {Object.keys(BOOK_CATEGORY_LABELS).map((item) => (
                    <SelectItem key={item} value={item}>
                      {BOOK_CATEGORY_LABELS[item as BookCategory]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedChildId || data.selectedChildId || data.children[0]!.id} onValueChange={setSelectedChildId}>
                <SelectTrigger className="h-10 flex-1 rounded-xl text-sm sm:w-[160px] sm:flex-none">
                  <SelectValue placeholder="Child" />
                </SelectTrigger>
                <SelectContent>
                  {data.children.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* ML insights and AI book recommendations */}
        {!hasActiveFilters && (
          <>
            <LibraryInsightsWidget />
            <LibraryRecommendations childId={selectedChildId || data.selectedChildId || data.children[0]?.id} />
          </>
        )}

        {/* Suggested for You — personalized recommendation banner */}
        {!hasActiveFilters && (data.rails.personalized ?? []).length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/6 via-background to-primary/4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-primary/15 px-4 py-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-foreground">Suggested for You</h2>
                <p className="text-xs text-muted-foreground">Based on your reading history & preferences</p>
              </div>
              <Badge variant="outline" className="shrink-0 border-primary/25 bg-primary/8 text-primary text-[10px]">
                Personalized
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-px divide-y divide-primary/8 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {(data.rails.personalized ?? []).slice(0, 3).map((book) => (
                <button
                  key={`suggested-${book.id}`}
                  type="button"
                  onClick={() => setActiveBook(book)}
                  className="flex items-center gap-3 p-3 text-left transition-colors hover:bg-primary/4 active:bg-primary/8"
                >
                  <div className="h-16 w-12 shrink-0 overflow-hidden rounded-xl border border-border/50 bg-muted shadow-sm">
                    {book.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={book.coverImageUrl}
                        alt={book.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
                        <BookOpen className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-foreground">
                      {book.title}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{book.author}</p>
                    {book.mlReasons?.[0] ? (
                      <p className="mt-1 line-clamp-1 text-[10px] text-primary/80">
                        {book.mlReasons[0]}
                      </p>
                    ) : (
                      <Badge variant="outline" className="mt-1 border-primary/20 bg-primary/5 px-1.5 py-0 text-[9px] font-medium text-primary">
                        {getCategoryLabel(book.category)}
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Pending requests */}
        {pendingRequests.length > 0 ? (
          <section className="overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/8 to-amber-600/5 shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-amber-500/20 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/15">
                  <Clock3 className="h-3.5 w-3.5 text-amber-600" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-foreground">Pending Issue Request</h2>
                  <p className="text-xs text-muted-foreground">Delete before creating another</p>
                </div>
              </div>
              <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-700">
                {pendingRequests.length} active
              </Badge>
            </div>

            <div className="divide-y divide-amber-500/10">
              {pendingRequests.map((requestItem) => (
                <div
                  key={requestItem.requestId}
                  className="flex items-center gap-3 p-3"
                >
                  <div className="h-14 w-10 shrink-0 overflow-hidden rounded-lg border border-amber-500/20 bg-muted shadow-sm">
                    {requestItem.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={requestItem.coverImageUrl}
                        alt={requestItem.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <BookOpen className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="line-clamp-1 text-sm font-semibold text-foreground">{requestItem.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{requestItem.author}</p>
                    {requestItem.libraryName ? (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {requestItem.libraryName}
                        {requestItem.libraryLocation ? ` · ${requestItem.libraryLocation}` : ""}
                      </p>
                    ) : null}
                    <p className="flex items-center gap-1 text-xs font-medium text-amber-700">
                      <Clock3 className="h-3 w-3 shrink-0" />
                      Expires {formatDateTime(requestItem.expiresAt)}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 rounded-xl border-amber-500/30 text-xs hover:border-destructive/40 hover:text-destructive"
                    disabled={cancellingRequestId === requestItem.requestId}
                    onClick={() => void cancelIssueRequest(requestItem.requestId)}
                  >
                    {cancellingRequestId === requestItem.requestId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    <span className="hidden sm:inline">Delete</span>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Book rails / search results */}
        <section className="space-y-6">
          {hasActiveFilters ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold tracking-tight text-foreground">
                  {query ? `Results for "${query}"` : `${getCategoryLabel(category)} Titles`}
                </h2>
                <span className="text-xs text-muted-foreground">{filteredCatalog.length} books</span>
              </div>

              {filteredCatalog.length === 0 ? (
                <div className="rounded-2xl border p-10 text-center">
                  <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No books found for your filters.</p>
                </div>
              ) : (
                <div className="-mx-4 flex flex-wrap gap-3 px-4 pb-1 sm:-mx-6 sm:px-6">
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
            <div className="rounded-2xl border p-10 text-center">
              <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No books found.</p>
            </div>
          ) : (
            rails.map((rail) => (
              <Rail
                key={rail.title}
                title={rail.title}
                icon={rail.icon}
                books={rail.books}
                onBookClick={(selectedBook) => setActiveBook(selectedBook)}
                onFavouriteToggle={(selectedBook, e) => void toggleFavourite(selectedBook, e)}
                favouriteLoadingId={favouriteLoadingId}
              />
            ))
          )}
        </section>
      </div>

      {/* Book detail modal */}
      <AnimatePresence>
        {activeBook ? (
          <>
            {/* Backdrop */}
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
              onClick={() => setActiveBook(null)}
              aria-label="Close book detail"
            />

            {/* Sheet / modal */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 32 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-white/15 bg-background shadow-[0_-16px_60px_-10px_rgba(0,0,0,0.6)] sm:inset-x-4 sm:bottom-auto sm:top-[5vh] sm:mx-auto sm:max-w-3xl sm:rounded-3xl sm:border sm:shadow-[0_32px_80px_-20px_rgba(0,0,0,0.7)]"
              onClick={(event) => event.stopPropagation()}
            >
              {/* Drag handle (mobile) */}
              <div className="flex justify-center pb-1 pt-2.5 sm:hidden">
                <div className="h-1 w-10 rounded-full bg-muted-foreground/25" />
              </div>

              {/* Close button */}
              <button
                type="button"
                onClick={() => setActiveBook(null)}
                className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/95 shadow-sm transition hover:bg-muted sm:right-4 sm:top-4"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Scrollable content */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="grid sm:grid-cols-[220px_1fr] md:grid-cols-[260px_1fr]">

                  {/* Cover */}
                  <div className="relative h-[200px] shrink-0 bg-muted sm:h-full sm:min-h-[320px]">
                    {activeBook.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeBook.coverImageUrl}
                        alt={activeBook.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-white/60">
                        <BookOpen className="h-10 w-10" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background/70 to-transparent sm:hidden" />
                  </div>

                  {/* Info */}
                  <div className="space-y-4 p-4 pb-5 sm:p-6">
                    <div className="pr-8 sm:pr-10">
                      <h3 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{activeBook.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{activeBook.author}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{getCategoryLabel(activeBook.category)}</Badge>
                      {activeBook.libraryName ? (
                        <Badge variant="outline" className="gap-1">
                          <MapPin className="h-3 w-3" />
                          {activeBook.libraryName}
                        </Badge>
                      ) : null}
                      {activeBook.metaLabel ? <Badge variant="vibrant">{activeBook.metaLabel}</Badge> : null}
                      {typeof activeBook.availableCopies === "number" ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            activeBook.availableCopies > 0
                              ? "border-emerald-500/30 bg-emerald-500/8 text-emerald-700"
                              : "border-destructive/30 text-destructive",
                          )}
                        >
                          {activeBook.availableCopies > 0
                            ? `${activeBook.availableCopies} available`
                            : "No copies"}
                        </Badge>
                      ) : null}
                    </div>

                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {activeBook.description ?? "A curated library title from your school collection."}
                    </p>

                    {activeBook.mlReasons && activeBook.mlReasons.length > 0 ? (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
                          <Sparkles className="h-3.5 w-3.5" />
                          Why this appears in your shelf
                        </p>
                        <p className="text-xs leading-relaxed text-primary/80">{activeBook.mlReasons[0]}</p>
                      </div>
                    ) : null}

                    {summaryText ? (
                      <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 shadow-[0_0_0_1px_rgba(99,102,241,0.15),0_8px_32px_-8px_rgba(99,102,241,0.25)]">
                        {/* Header strip */}
                        <div className="flex items-center gap-2 border-b border-white/[0.07] bg-white/[0.04] px-4 py-2.5">
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/20">
                            <Bot className="h-3.5 w-3.5 text-indigo-400" />
                          </span>
                          <span className="text-xs font-semibold tracking-wide text-indigo-300">AI Summary</span>
                          <span className="ml-auto rounded-full border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-400">
                            Powered by Claude
                          </span>
                        </div>
                        {/* Body */}
                        <div className="px-4 py-3">{renderSummaryMarkdown(summaryText)}</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Action bar — always visible, above bottom nav */}
              <div className="shrink-0 border-t border-border/60 bg-background/98 backdrop-blur-sm">
                <div className="flex flex-col gap-2.5 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Confirm at library kiosk after requesting.</p>
                    {summaryUsage ? (
                      <p className="text-xs text-muted-foreground">
                        AI summaries today: {summaryUsage.used}/{summaryUsage.limit} used
                      </p>
                    ) : null}
                    {activeBook.requestId ? (
                      <p className="flex items-center gap-1 text-xs font-medium text-amber-700">
                        <Clock3 className="h-3 w-3" />
                        Pending until {formatDateTime(activeBook.requestExpiresAt)}
                      </p>
                    ) : null}
                    {typeof activeBook.favouriteCount === "number" && activeBook.favouriteCount > 0 ? (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Heart className="h-3 w-3 fill-current text-rose-400" />
                        {activeBook.favouriteCount} {activeBook.favouriteCount === 1 ? "person" : "people"} favourited
                      </p>
                    ) : null}
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    {/* Favourite toggle */}
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-11 w-full rounded-xl px-5 text-sm font-semibold sm:w-auto",
                        activeBook.isFavourited && "border-rose-500/40 bg-rose-500/8 text-rose-600 hover:bg-rose-500/15",
                      )}
                      disabled={favouriteLoadingId === activeBook.id}
                      onClick={(e) => void toggleFavourite(activeBook, e)}
                    >
                      {favouriteLoadingId === activeBook.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Heart className={cn("h-4 w-4", activeBook.isFavourited && "fill-current text-rose-500")} />
                      )}
                      {activeBook.isFavourited ? "Favourited" : "Favourite"}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full rounded-xl px-6 text-sm font-semibold sm:w-auto"
                      disabled={summaryLoading}
                      onClick={() => void requestBookSummary(activeBook)}
                    >
                      {summaryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {summaryLoading ? "Summarizing..." : "AI Summary"}
                    </Button>

                    <Button
                      className={cn(
                        "h-11 w-full rounded-xl px-6 text-sm font-semibold sm:w-auto",
                        !activeBook.requestId && activeBook.canRequest && "shadow-md shadow-primary/20",
                      )}
                      variant={!activeBook.requestId && activeBook.canRequest ? "premium" : "outline"}
                      disabled={!activeBook.canRequest || issuingBookId === activeBook.id || Boolean(activeBook.requestId)}
                      onClick={() => void requestIssue(activeBook.id)}
                    >
                      {issuingBookId === activeBook.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {activeBook.requestId ? "Already Pending" : activeBook.canRequest ? "Request Issue" : "Unavailable"}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
