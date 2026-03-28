"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
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
import { Search, Loader2, BookOpen, X, Sparkles, Clock3, TrendingUp, Star, Zap, Heart, Library } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BOOK_CATEGORY_LABELS,
  type BookCategory,
} from "@/lib/constants";

interface ChildOption {
  id: string;
  name: string;
  className: string | null;
  section: string | null;
}

interface ShelfBook {
  id: string;
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
}

interface CategoryRail {
  category: string;
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
}

interface ShowcaseData {
  children: ChildOption[];
  selectedChildId: string | null;
  filters: {
    query: string;
    category: string;
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
}: {
  book: ShelfBook;
  onClick: (book: ShelfBook) => void;
}) {
  const isPending = Boolean(book.requestId);
  const isUnavailable = !book.canRequest && !isPending;

  return (
    <button
      type="button"
      onClick={() => onClick(book)}
      className="group w-[42vw] min-w-[130px] max-w-[160px] shrink-0 text-left sm:w-[148px]"
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

        {/* title */}
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="line-clamp-2 text-xs font-semibold leading-tight text-white drop-shadow">{book.title}</p>
          <p className="mt-0.5 truncate text-[10px] text-white/65">{book.author}</p>
        </div>
      </div>
    </button>
  );
}

function Rail({
  title,
  icon,
  books,
  onBookClick,
}: {
  title: string;
  icon?: React.ReactNode;
  books: ShelfBook[];
  onBookClick: (book: ShelfBook) => void;
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
            <TitleCard key={`${title}-${book.id}`} book={book} onClick={onBookClick} />
          ))}
        </div>
        {/* Right-edge fade to indicate more content */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
      </div>
    </section>
  );
}

export default function LibraryShowcasePage() {
  const [data, setData] = useState<ShowcaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuingBookId, setIssuingBookId] = useState<string | null>(null);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
  const [activeBook, setActiveBook] = useState<ShelfBook | null>(null);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");

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
      if (query) params.set("q", query);
      if (category !== "ALL") params.set("category", category);

      const res = await fetch(`/api/library/showcase?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json: ShowcaseData = await res.json();

      setData(json);

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
  }, [selectedChildId, query, category]);

  useSSE("library-updated", () => {
    void fetchShowcase();
  });

  useEffect(() => {
    void fetchShowcase();
  }, [fetchShowcase]);

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

    return [...base, ...categoryRails].filter((item) => item.books.length > 0);
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
                  </div>
                </div>
              </div>

              {/* Action bar — always visible, above bottom nav */}
              <div className="shrink-0 border-t border-border/60 bg-background/98 backdrop-blur-sm">
                <div className="flex flex-col gap-2.5 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Confirm at library kiosk after requesting.</p>
                    {activeBook.requestId ? (
                      <p className="flex items-center gap-1 text-xs font-medium text-amber-700">
                        <Clock3 className="h-3 w-3" />
                        Pending until {formatDateTime(activeBook.requestExpiresAt)}
                      </p>
                    ) : null}
                  </div>

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
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
