"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Search, Loader2, BookOpen, X, Sparkles, Clock3 } from "lucide-react";
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
  return (
    <button
      type="button"
      onClick={() => onClick(book)}
      className="group w-[42vw] min-w-[130px] max-w-[170px] shrink-0 text-left sm:w-[150px]"
      title={`${book.title} by ${book.author}`}
    >
      <div className="relative h-[224px] overflow-hidden rounded-xl border border-white/10 bg-muted shadow-[0_10px_24px_-14px_rgba(15,23,42,0.6)]">
        {book.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.coverImageUrl}
            alt={book.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-900 text-white/70">
            <BookOpen className="h-6 w-6" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-2.5">
          <p className="line-clamp-2 text-xs font-medium text-white">{book.title}</p>
        </div>
      </div>
    </button>
  );
}

function Rail({
  title,
  books,
  onBookClick,
}: {
  title: string;
  books: ShelfBook[];
  onBookClick: (book: ShelfBook) => void;
}) {
  if (books.length === 0) return null;

  return (
    <section className="space-y-2.5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
        {books.map((book) => (
          <TitleCard key={`${title}-${book.id}`} book={book} onClick={onBookClick} />
        ))}
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

  const rails = useMemo<Array<{ title: string; books: ShelfBook[] }>>(() => {
    if (!data) return [];

    const base = [
      { title: "Trending Now", books: data.rails.hotThisWeek },
      { title: "Must Read", books: data.rails.mustReads },
      { title: "Newcomers", books: data.rails.newcomers },
      { title: "GOATs", books: data.rails.goats },
      { title: "For You", books: data.rails.personalized ?? [] },
    ];

    const categoryRails = data.rails.categories.map((rail) => ({
      title: getCategoryLabel(rail.category),
      books: rail.books,
    }));

    return [...base, ...categoryRails].filter((item) => item.books.length > 0);
  }, [data]);

  const hasActiveFilters = query.length > 0 || category !== "ALL";
  const filteredCatalog = data?.catalog ?? [];
  const pendingRequests = data?.pendingRequests ?? [];
  const currentSelectedChild = data?.children.find(
    (childOption) => childOption.id === (selectedChildId || data?.selectedChildId),
  );

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
      <div className="app-shell space-y-5 pb-24">

        <section className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur">
          <div className="grid gap-2 sm:grid-cols-[1fr_180px_190px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="h-11 rounded-xl pl-9"
              placeholder="Search title or author"
            />
          </div>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-11 rounded-xl">
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

          <Select value={selectedChildId || data.selectedChildId || data.children[0]?.id} onValueChange={setSelectedChildId}>
            <SelectTrigger className="h-11 rounded-xl">
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
        </section>

        {pendingRequests.length > 0 ? (
          <section className="space-y-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Pending Issue Request</h2>
                <p className="text-xs text-muted-foreground">
                  Delete this request before creating another one.
                </p>
              </div>
              <Badge variant="outline" className="border-amber-500/30 text-amber-700">
                {pendingRequests.length} active
              </Badge>
            </div>

            <div className="space-y-2.5">
              {pendingRequests.map((requestItem) => (
                <div
                  key={requestItem.requestId}
                  className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-16 w-12 overflow-hidden rounded-md border border-border/60 bg-muted">
                      {requestItem.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={requestItem.coverImageUrl}
                          alt={requestItem.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <BookOpen className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="line-clamp-2 text-sm font-medium text-foreground">{requestItem.title}</p>
                      <p className="text-xs text-muted-foreground">{requestItem.author}</p>
                      <p className="text-xs text-muted-foreground">
                        {requestItem.childId === (selectedChildId || data.selectedChildId)
                          ? currentSelectedChild?.name ?? "Selected child"
                          : requestItem.childName ?? "Linked child"}
                      </p>
                      <p className="flex items-center gap-1.5 text-xs text-amber-700">
                        <Clock3 className="h-3.5 w-3.5" />
                        Expires {formatDateTime(requestItem.expiresAt)}
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-xl sm:w-auto"
                    disabled={cancellingRequestId === requestItem.requestId}
                    onClick={() => void cancelIssueRequest(requestItem.requestId)}
                  >
                    {cancellingRequestId === requestItem.requestId ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Delete request
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-5">
          {hasActiveFilters ? (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {query ? `Results for "${query}"` : `${getCategoryLabel(category)} Titles`}
                </h2>
                <p className="text-xs text-muted-foreground">{filteredCatalog.length} books</p>
              </div>

              {filteredCatalog.length === 0 ? (
                <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
                  No books found for your filters.
                </div>
              ) : (
                <div className="-mx-1 flex flex-wrap gap-2.5 px-1 pb-1">
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
            <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
              No books found.
            </div>
          ) : (
            rails.map((rail) => (
              <Rail
                key={rail.title}
                title={rail.title}
                books={rail.books}
                onBookClick={(selectedBook) => setActiveBook(selectedBook)}
              />
            ))
          )}
        </section>
      </div>

      <AnimatePresence>
        {activeBook ? (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
              onClick={() => setActiveBook(null)}
            />

            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="fixed inset-x-0 bottom-0 z-50 w-full overflow-hidden rounded-t-3xl border border-white/20 bg-background shadow-[0_28px_80px_-30px_rgba(0,0,0,0.75)] sm:inset-x-4 sm:bottom-auto sm:top-[6vh] sm:mx-auto sm:max-w-3xl sm:rounded-3xl"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setActiveBook(null)}
                className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/90 transition hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="max-h-[92dvh] overflow-y-auto sm:max-h-[82dvh]">
                <div className="grid gap-0 sm:grid-cols-[220px_1fr] md:grid-cols-[280px_1fr]">
                  <div className="relative h-[250px] bg-muted sm:h-full">
                    {activeBook.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeBook.coverImageUrl}
                        alt={activeBook.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-900 text-white/75">
                        <BookOpen className="h-8 w-8" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent sm:hidden" />
                  </div>

                  <div className="space-y-4 p-4 pb-6 sm:p-6">
                    <div className="pr-10">
                      <h3 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{activeBook.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{activeBook.author}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{getCategoryLabel(activeBook.category)}</Badge>
                      {activeBook.metaLabel ? <Badge variant="vibrant">{activeBook.metaLabel}</Badge> : null}
                      {typeof activeBook.availableCopies === "number" ? (
                        <Badge variant="outline">{activeBook.availableCopies} available</Badge>
                      ) : null}
                    </div>

                    {activeBook.description ? (
                      <p className="text-sm leading-relaxed text-muted-foreground">{activeBook.description}</p>
                    ) : (
                      <p className="text-sm leading-relaxed text-muted-foreground">A curated library title from your school collection.</p>
                    )}

                    {activeBook.mlReasons && activeBook.mlReasons.length > 0 ? (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
                        <p className="mb-1 flex items-center gap-1.5 font-medium">
                          <Sparkles className="h-3.5 w-3.5" />
                          Why this appears in your shelf
                        </p>
                        <p>{activeBook.mlReasons[0]}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-border/60 bg-background/95 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Issue request will be confirmed at library kiosk.</p>
                  {activeBook.requestId ? (
                    <p className="text-xs text-amber-700">
                      Request pending until {formatDateTime(activeBook.requestExpiresAt)}.
                    </p>
                  ) : null}
                </div>

                <Button
                  className="h-11 w-full rounded-xl px-5 sm:w-auto"
                  disabled={!activeBook.canRequest || issuingBookId === activeBook.id || Boolean(activeBook.requestId)}
                  onClick={() => void requestIssue(activeBook.id)}
                >
                  {issuingBookId === activeBook.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {activeBook.requestId ? "Pending" : activeBook.canRequest ? "Issue" : "Unavailable"}
                </Button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
