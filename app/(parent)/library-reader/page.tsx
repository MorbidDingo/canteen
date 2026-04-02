"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "@/components/ui/motion";
import { MotionPage, spring } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Loader2, Sparkles, X, Play, Lock,
  TrendingUp, Search, ChevronLeft, ChevronRight,
  BookMarked,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { READER_MAX_ACTIVE_BOOKS } from "@/lib/constants";
import { Input } from "@/components/ui/input";

const BOOKS_PER_PAGE = 10;

interface ReaderBook {
  id: string;
  bookId: string | null;
  title: string;
  author: string;
  category: string;
  description: string | null;
  coverImageUrl: string | null;
  language: string;
  totalPages: number;
  totalChapters: number;
  isAudioEnabled: boolean;
  isActive: boolean;
  isPublicDomain?: boolean;
  contentType?: string;
  gutenbergId?: string;
}

interface ReadingSessionInfo {
  id: string;
  readableBookId: string;
  currentChapter: number;
  currentPage: number;
  readingMode: string;
  fontSize: number;
  startedAt: string;
  lastReadAt: string;
  bookTitle: string;
  bookAuthor: string;
  bookCover: string | null;
  totalPages: number;
  totalChapters: number;
  isAudioEnabled: boolean;
}

interface ReaderStats {
  mostRead: Array<{ bookId: string; title: string; author: string; coverImageUrl: string | null; isPublicDomain: boolean; readerCount: number }>;
  trending: Array<{ bookId: string; title: string; author: string; coverImageUrl: string | null; isPublicDomain: boolean; recentReaders: number }>;
  popularHighlights: Array<{ highlightedText: string; chapterNumber: number; page: number; bookId: string; bookTitle: string; bookAuthor: string; highlightCount: number }>;
  personal: { activeBooks: number; totalHighlights: number; totalBookmarks: number };
  orgStats: { totalReaders: number; totalBooks: number };
}

// Shuffle books for discovery on each page load
function shuffleForDiscovery<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function LibraryReaderPage() {
  const router = useRouter();
  const [books, setBooks] = useState<ReaderBook[]>([]);
  const [sessions, setSessions] = useState<ReadingSessionInfo[]>([]);
  const [stats, setStats] = useState<ReaderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [certePlusRequired, setCertePlusRequired] = useState(false);
  const [startingBookId, setStartingBookId] = useState<string | null>(null);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);
  const [seedingPublicBooks, setSeedingPublicBooks] = useState(false);
  const seedingRef = useRef(false);

  // Pagination
  const [booksPage, setBooksPage] = useState(0);

  // Shuffled books for discovery (shuffled once on load)
  const [shuffledPublicBooks, setShuffledPublicBooks] = useState<ReaderBook[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{
    id: string;
    gutenbergId: number;
    title: string;
    authors: string;
    category: string;
    coverImageUrl: string | null;
    downloadCount: number;
  }>>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const warmReaderContent = useCallback((book: ReaderBook | null | undefined) => {
    if (!book?.isPublicDomain || book.totalChapters > 0) return;
    fetch("/api/library/reader/public-books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readableBookId: book.id }),
    }).catch(() => {});
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/library/gutenberg/search?q=${encodeURIComponent(query.trim())}&limit=12`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.hits || []);
        }
      } catch {
        // Silently fail
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const openSearchResult = useCallback(async (gutenbergId: number) => {
    const match = books.find((b) => b.isPublicDomain && b.gutenbergId === String(gutenbergId));
    if (match) {
      setSearchQuery("");
      setSearchResults([]);
      if (match.isActive) {
        warmReaderContent(match);
        router.push(`/library-reader/${match.id}`);
      } else {
        setStartingBookId(match.id);
        try {
          const res = await fetch("/api/library/reader/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ readableBookId: match.id }),
          });
          if (res.status === 409 || res.ok) {
            warmReaderContent(match);
            router.push(`/library-reader/${match.id}`);
          } else if (res.status === 429) {
            toast.error(`Maximum ${READER_MAX_ACTIVE_BOOKS} books at a time.`);
          }
        } catch {
          toast.error("Failed to start reading");
        } finally {
          setStartingBookId(null);
        }
      }
      return;
    }

    toast.info("Adding book to your library…");
    try {
      await fetch("/api/library/reader/public-books");
      const refreshRes = await fetch("/api/library/reader/books");
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        const refreshedBooks: ReaderBook[] = refreshData.books || [];
        setBooks(refreshedBooks);
        setShuffledPublicBooks(shuffleForDiscovery(refreshedBooks.filter((b) => b.isPublicDomain)));
        const found = refreshedBooks.find((b) => b.isPublicDomain && b.gutenbergId === String(gutenbergId));
        if (found) {
          setStartingBookId(found.id);
          try {
            const res = await fetch("/api/library/reader/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ readableBookId: found.id }),
            });
            if (res.status === 409 || res.ok) {
              warmReaderContent(found);
              router.push(`/library-reader/${found.id}`);
            } else if (res.status === 429) {
              toast.error(`Maximum ${READER_MAX_ACTIVE_BOOKS} books at a time.`);
            } else {
              toast.error("Failed to start reading");
            }
          } catch {
            toast.error("Failed to start reading");
          } finally {
            setStartingBookId(null);
          }
        } else {
          toast.error("Book not available yet. Try again.");
        }
      }
    } catch {
      toast.error("Failed to add book");
    }
    setSearchQuery("");
    setSearchResults([]);
  }, [books, router, warmReaderContent]);

  const fetchData = useCallback(async () => {
    try {
      const [booksRes, sessionsRes, statsRes] = await Promise.all([
        fetch("/api/library/reader/books"),
        fetch("/api/library/reader/sessions"),
        fetch("/api/library/reader/stats"),
      ]);

      if (booksRes.status === 403) {
        setCertePlusRequired(true);
        setLoading(false);
        return;
      }

      if (booksRes.ok) {
        const booksData = await booksRes.json();
        const allBooks: ReaderBook[] = booksData.books || [];
        setBooks(allBooks);

        // Shuffle public domain books for discovery
        const pubBooks = allBooks.filter((b) => b.isPublicDomain);
        setShuffledPublicBooks(shuffleForDiscovery(pubBooks));

        // Auto-seed public domain books if none exist
        const hasPublicBooks = pubBooks.length > 0;
        if (!hasPublicBooks && !seedingRef.current) {
          seedingRef.current = true;
          setSeedingPublicBooks(true);
          try {
            const seedRes = await fetch("/api/library/reader/public-books");
            if (seedRes.ok) {
              const refreshRes = await fetch("/api/library/reader/books");
              if (refreshRes.ok) {
                const refreshData = await refreshRes.json();
                const refreshedBooks: ReaderBook[] = refreshData.books || [];
                setBooks(refreshedBooks);
                setShuffledPublicBooks(shuffleForDiscovery(refreshedBooks.filter((b) => b.isPublicDomain)));
              }
            }
          } catch {
            // Silently fail — public books are supplementary
          } finally {
            seedingRef.current = false;
            setSeedingPublicBooks(false);
          }
        }
      }

      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setSessions(sessionsData.sessions || []);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch {
      toast.error("Failed to load reader data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const startReading = useCallback(async (readableBookId: string) => {
    setStartingBookId(readableBookId);
    const targetBook = books.find((book) => book.id === readableBookId);

    try {
      const res = await fetch("/api/library/reader/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readableBookId }),
      });

      if (res.status === 409) {
        warmReaderContent(targetBook);
        router.push(`/library-reader/${readableBookId}`);
        return;
      }

      if (res.status === 429) {
        toast.error(`Maximum ${READER_MAX_ACTIVE_BOOKS} books at a time. Close a book first.`);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to start reading");
        return;
      }

      warmReaderContent(targetBook);
      router.push(`/library-reader/${readableBookId}`);
    } catch {
      toast.error("Failed to start reading");
    } finally {
      setStartingBookId(null);
    }
  }, [books, router, warmReaderContent]);

  const closeBook = useCallback(async (sessionId: string) => {
    setClosingSessionId(sessionId);
    try {
      const res = await fetch(`/api/library/reader/sessions?sessionId=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Book closed");
        fetchData();
      }
    } catch {
      toast.error("Failed to close book");
    } finally {
      setClosingSessionId(null);
    }
  }, [fetchData]);

  // Paginated books
  const visibleBooks = useMemo(() => {
    const start = booksPage * BOOKS_PER_PAGE;
    return shuffledPublicBooks.slice(start, start + BOOKS_PER_PAGE);
  }, [shuffledPublicBooks, booksPage]);

  const totalBookPages = Math.ceil(shuffledPublicBooks.length / BOOKS_PER_PAGE);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (certePlusRequired) {
    return (
      <MotionPage>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
          <div className="rounded-full bg-amber-500/10 p-4">
            <Lock className="h-10 w-10 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-center">Certe+ Required</h2>
          <p className="text-muted-foreground text-center max-w-sm">
            The Book Reader is available exclusively for Certe+ subscribers.
            Upgrade to start reading digital books with bookmarks, highlights, and more.
          </p>
          <Button onClick={() => router.push("/certe-plus")} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Upgrade to Certe+
          </Button>
        </div>
      </MotionPage>
    );
  }

  const orgBooks = books.filter((b) => !b.isPublicDomain);

  return (
    <MotionPage>
      <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto space-y-7">

        {/* ── Search ── */}
        <section className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search books by title, author, genre…"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 pr-10 rounded-xl h-11 bg-card"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          <AnimatePresence>
            {(searchResults.length > 0 || searching) && searchQuery.trim().length >= 2 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={spring.snappy}
                className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl bg-card border border-border shadow-lg overflow-hidden max-h-[60vh] overflow-y-auto"
              >
                {searching && searchResults.length === 0 ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No books found for &ldquo;{searchQuery}&rdquo;
                  </div>
                ) : (
                  searchResults.map((hit) => {
                    const existsInLib = books.some((b) => b.gutenbergId === String(hit.gutenbergId));
                    return (
                      <button
                        key={hit.id}
                        onClick={() => openSearchResult(hit.gutenbergId)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b border-border last:border-b-0"
                      >
                        <div className="w-10 h-14 rounded-md bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex-shrink-0 flex items-center justify-center overflow-hidden">
                          {hit.coverImageUrl ? (
                            <img src={hit.coverImageUrl} alt="" className="w-full h-full object-cover rounded-md" />
                          ) : (
                            <BookOpen className="h-4 w-4 text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{hit.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{hit.authors}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full">{hit.category}</span>
                            {existsInLib && (
                              <span className="text-[9px] text-emerald-600 font-medium">In Library</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ── Currently Reading ── */}
        {sessions.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <BookMarked className="h-4 w-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-foreground">Continue Reading</h2>
              <span className="ml-auto text-[10px] text-muted-foreground">{sessions.length}/{READER_MAX_ACTIVE_BOOKS} active</span>
            </div>
            <div className="space-y-2.5">
              <AnimatePresence mode="popLayout">
                {sessions.map((s) => {
                  const pct = s.totalPages > 0 ? Math.round((s.currentPage / s.totalPages) * 100) : 0;
                  return (
                    <motion.div
                      key={s.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={spring.snappy}
                      className="flex gap-3 p-3 rounded-2xl bg-card border border-border shadow-sm"
                    >
                      {/* Cover */}
                      <button
                        className="w-14 h-20 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex-shrink-0 overflow-hidden shadow-md active:scale-95 transition-transform"
                        onClick={() => router.push(`/library-reader/${s.readableBookId}`)}
                      >
                        {s.bookCover ? (
                          <img src={s.bookCover} alt={s.bookTitle} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <BookOpen className="h-5 w-5 text-white/70" />
                          </div>
                        )}
                      </button>

                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <button
                            className="text-sm font-semibold text-left leading-tight truncate w-full hover:text-indigo-500 transition-colors"
                            onClick={() => router.push(`/library-reader/${s.readableBookId}`)}
                          >
                            {s.bookTitle}
                          </button>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.bookAuthor}</p>
                        </div>

                        {/* Progress */}
                        <div className="mt-2">
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                            <span>{pct}% read</span>
                            <span>Pg {s.currentPage}{s.totalPages > 0 ? ` / ${s.totalPages}` : ""}</span>
                          </div>
                          <div className="h-1 bg-muted rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-indigo-500 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={spring.gentle}
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 mt-2.5">
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1 flex-1 rounded-lg"
                            onClick={() => router.push(`/library-reader/${s.readableBookId}`)}
                          >
                            <Play className="h-3 w-3" /> Continue
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground rounded-lg"
                            onClick={() => closeBook(s.id)}
                            disabled={closingSessionId === s.id}
                          >
                            {closingSessionId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* ── Trending ── */}
        {stats && stats.trending.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-rose-500" />
              <h2 className="text-sm font-semibold">Trending</h2>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
              {stats.trending.map((t) => (
                <motion.button
                  key={t.bookId}
                  className="flex-shrink-0 w-24 rounded-2xl bg-card border border-border shadow-sm overflow-hidden text-left"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    const match = books.find((b) => b.id === t.bookId);
                    if (match?.isActive) router.push(`/library-reader/${t.bookId}`);
                    else if (match) startReading(t.bookId);
                  }}
                >
                  <div className="aspect-[2/3] bg-gradient-to-br from-rose-500/20 to-orange-600/20 overflow-hidden">
                    {t.coverImageUrl ? (
                      <img src={t.coverImageUrl} alt={t.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="font-semibold text-[10px] truncate leading-tight">{t.title}</p>
                    <p className="text-[9px] text-rose-500 font-medium mt-0.5">{t.recentReaders} reading</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* ── Discover Library ── */}
        {shuffledPublicBooks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <h2 className="text-sm font-semibold">Discover</h2>
              {totalBookPages > 1 && (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {booksPage + 1} / {totalBookPages}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <AnimatePresence mode="popLayout">
                {visibleBooks.map((b) => (
                  <motion.button
                    key={b.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={spring.snappy}
                    className={cn(
                      "relative rounded-2xl overflow-hidden bg-card border border-border shadow-sm text-left",
                      b.isActive && "ring-2 ring-indigo-500",
                    )}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      if (b.isActive) router.push(`/library-reader/${b.id}`);
                      else startReading(b.id);
                    }}
                  >
                    <div className="aspect-[2/3] bg-gradient-to-br from-indigo-500/15 to-purple-600/15 overflow-hidden">
                      {b.coverImageUrl ? (
                        <img src={b.coverImageUrl} alt={b.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="h-8 w-8 text-muted-foreground/25" />
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="font-semibold text-xs leading-tight line-clamp-2">{b.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{b.author}</p>
                    </div>

                    {b.isActive && (
                      <div className="absolute top-2 right-2 bg-indigo-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                        Reading
                      </div>
                    )}
                    {startingBookId === b.id && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                      </div>
                    )}
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>

            {/* Pagination */}
            {totalBookPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  onClick={() => setBooksPage((p) => Math.max(0, p - 1))}
                  disabled={booksPage === 0}
                  className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-full border border-border bg-card transition-colors",
                    booksPage === 0 ? "opacity-30 pointer-events-none" : "hover:bg-muted",
                  )}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalBookPages, 5) }).map((_, i) => {
                    const pageNum = totalBookPages <= 5
                      ? i
                      : booksPage < 3
                        ? i
                        : booksPage > totalBookPages - 4
                          ? totalBookPages - 5 + i
                          : booksPage - 2 + i;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setBooksPage(pageNum)}
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          pageNum === booksPage
                            ? "w-4 bg-indigo-500"
                            : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50",
                        )}
                      />
                    );
                  })}
                </div>

                <button
                  onClick={() => setBooksPage((p) => Math.min(totalBookPages - 1, p + 1))}
                  disabled={booksPage >= totalBookPages - 1}
                  className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-full border border-border bg-card transition-colors",
                    booksPage >= totalBookPages - 1 ? "opacity-30 pointer-events-none" : "hover:bg-muted",
                  )}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Organisation Books ── */}
        {orgBooks.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold">Library Collection</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {orgBooks.map((b) => (
                <motion.button
                  key={b.id}
                  className={cn(
                    "relative rounded-2xl overflow-hidden bg-card border border-border shadow-sm text-left",
                    b.isActive && "ring-2 ring-indigo-500",
                  )}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    if (b.isActive) router.push(`/library-reader/${b.id}`);
                    else startReading(b.id);
                  }}
                >
                  <div className="aspect-[2/3] bg-gradient-to-br from-amber-500/15 to-orange-600/15 overflow-hidden">
                    {b.coverImageUrl ? (
                      <img src={b.coverImageUrl} alt={b.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="h-8 w-8 text-muted-foreground/25" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="font-semibold text-xs leading-tight line-clamp-2">{b.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{b.author}</p>
                    {b.totalPages > 0 && (
                      <p className="text-[9px] text-muted-foreground/70 mt-0.5">{b.totalPages} pages</p>
                    )}
                  </div>
                  {b.isActive && (
                    <div className="absolute top-2 right-2 bg-indigo-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                      Reading
                    </div>
                  )}
                  {startingBookId === b.id && (
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {shuffledPublicBooks.length === 0 && orgBooks.length === 0 && !seedingPublicBooks && (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No books yet</p>
            <p className="text-xs mt-1 opacity-70">Search above to discover public domain classics.</p>
          </div>
        )}

        {/* Seeding indicator */}
        {seedingPublicBooks && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
            <p className="text-xs text-muted-foreground">Loading public domain books…</p>
          </div>
        )}
      </div>
    </MotionPage>
  );
}
