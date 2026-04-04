"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence, MotionPage, spring } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Loader2, Sparkles, X,
  Search, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { READER_MAX_ACTIVE_BOOKS } from "@/lib/constants";

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

  const orgBooks = books.filter((b) => !b.isPublicDomain);

  return (
    <MotionPage>
      <div className="space-y-8 px-5 pb-28 sm:px-8">

        {/* Search bar */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search public domain books..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-11 w-full rounded-full bg-muted/40 pl-11 pr-10 text-[15px] text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:bg-muted/60"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(""); setSearchResults([]); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* Search Results Dropdown */}
          <AnimatePresence>
            {(searchResults.length > 0 || searching) && searchQuery.trim().length >= 2 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={spring.snappy}
                className="absolute left-0 right-0 top-full z-50 mt-1 rounded-2xl bg-card border border-border/50 shadow-lg overflow-hidden max-h-[60vh] overflow-y-auto"
              >
                {searching && searchResults.length === 0 ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No books found
                  </div>
                ) : (
                  searchResults.map((hit) => (
                    <button
                      key={hit.id}
                      type="button"
                      onClick={() => openSearchResult(hit.gutenbergId)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b border-border/30 last:border-b-0"
                    >
                      <div className="w-10 h-14 rounded-lg bg-muted shrink-0 overflow-hidden">
                        {hit.coverImageUrl ? (
                          <img src={hit.coverImageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                            <BookOpen className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold truncate">{hit.title}</p>
                        <p className="text-[12px] text-muted-foreground truncate">{hit.authors}</p>
                      </div>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Continue Reading */}
        {sessions.length > 0 && (
          <section className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Continue Reading</p>
            <div className="space-y-3">
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
                      className="flex gap-3 rounded-2xl bg-card p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    >
                      {/* Cover */}
                      <button
                        type="button"
                        className="w-14 h-20 rounded-xl bg-muted shrink-0 overflow-hidden active:scale-95 transition-transform"
                        onClick={() => router.push(`/library-reader/${s.readableBookId}`)}
                      >
                        {s.bookCover ? (
                          <img src={s.bookCover} alt={s.bookTitle} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                            <BookOpen className="h-5 w-5" />
                          </div>
                        )}
                      </button>

                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div>
                          <button
                            type="button"
                            className="text-[16px] font-semibold text-left leading-tight truncate w-full"
                            style={{ fontFamily: "'Cormorant Garamond', serif" }}
                            onClick={() => router.push(`/library-reader/${s.readableBookId}`)}
                          >
                            {s.bookTitle}
                          </button>
                          <p className="text-[13px] text-muted-foreground mt-0.5 truncate">{s.bookAuthor}</p>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-2">
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <motion.div
                              className="h-full bg-primary rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={spring.gentle}
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">{pct}%</p>
                        </div>

                        <button
                          type="button"
                          className="mt-1.5 self-start text-[13px] font-medium text-primary"
                          onClick={() => router.push(`/library-reader/${s.readableBookId}`)}
                        >
                          Continue →
                        </button>
                      </div>

                      {/* Close button */}
                      <button
                        type="button"
                        className="self-start rounded-full p-1.5 text-muted-foreground/50 hover:text-foreground transition-colors"
                        onClick={() => closeBook(s.id)}
                        disabled={closingSessionId === s.id}
                      >
                        {closingSessionId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* Discover — cover-only horizontal rail */}
        {shuffledPublicBooks.length > 0 && (
          <section className="space-y-2">
            <div
              className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none" }}
            >
              {visibleBooks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={cn(
                    "group w-[120px] shrink-0 cursor-pointer text-left",
                  )}
                  onClick={() => {
                    if (b.isActive) router.push(`/library-reader/${b.id}`);
                    else startReading(b.id);
                  }}
                >
                  <div className={cn(
                    "relative aspect-[2/3] w-full overflow-hidden rounded-xl transition-all duration-300",
                    "shadow-[0_1px_3px_rgba(0,0,0,0.04)] group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
                    "group-hover:scale-[1.03] group-active:scale-[0.97]",
                    b.isActive && "ring-2 ring-primary",
                  )}>
                    {b.coverImageUrl ? (
                      <img src={b.coverImageUrl} alt={b.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground/25">
                        <BookOpen className="h-8 w-8" />
                      </div>
                    )}
                    {startingBookId === b.id && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Discover</p>
              {totalBookPages > 1 && booksPage < totalBookPages - 1 && (
                <button
                  type="button"
                  onClick={() => setBooksPage((p) => Math.min(totalBookPages - 1, p + 1))}
                  className="flex items-center gap-0.5 text-[13px] font-medium text-primary"
                >
                  More <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </section>
        )}

        {/* Organisation Books — same cover rail */}
        {orgBooks.length > 0 && (
          <section className="space-y-2">
            <div
              className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none" }}
            >
              {orgBooks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="group w-[120px] shrink-0 cursor-pointer text-left"
                  onClick={() => {
                    if (b.isActive) router.push(`/library-reader/${b.id}`);
                    else startReading(b.id);
                  }}
                >
                  <div className={cn(
                    "relative aspect-[2/3] w-full overflow-hidden rounded-xl transition-all duration-300",
                    "shadow-[0_1px_3px_rgba(0,0,0,0.04)] group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]",
                    "group-hover:scale-[1.03] group-active:scale-[0.97]",
                    b.isActive && "ring-2 ring-primary",
                  )}>
                    {b.coverImageUrl ? (
                      <img src={b.coverImageUrl} alt={b.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground/25">
                        <BookOpen className="h-8 w-8" />
                      </div>
                    )}
                    {startingBookId === b.id && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Library Collection</p>
          </section>
        )}

        {/* Empty state */}
        {shuffledPublicBooks.length === 0 && orgBooks.length === 0 && !seedingPublicBooks && (
          <div className="text-center py-16">
            <BookOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
            <p className="text-[20px] font-medium text-muted-foreground">Nothing here yet</p>
            <p className="text-[13px] mt-1 text-muted-foreground/70">Search above to discover public domain classics</p>
          </div>
        )}

        {/* Seeding indicator */}
        {seedingPublicBooks && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <p className="text-[13px] text-muted-foreground">Loading public domain books…</p>
          </div>
        )}
      </div>
    </MotionPage>
  );
}
