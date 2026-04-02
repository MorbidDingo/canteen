"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "@/components/ui/motion";
import { MotionPage, MotionList, MotionItem, spring } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2, Sparkles, X, Play, Lock, TrendingUp, Bookmark, BarChart3, Globe, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { READER_MAX_ACTIVE_BOOKS } from "@/lib/constants";
import { Input } from "@/components/ui/input";

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
    // Check if this book already exists in the org's readableBook list
    const match = books.find((b) => b.isPublicDomain && (b as ReaderBook & { gutenbergId?: string }).gutenbergId === String(gutenbergId));
    if (match) {
      setSearchQuery("");
      setSearchResults([]);
      if (match.isActive) {
        warmReaderContent(match);
        router.push(`/library-reader/${match.id}`);
      } else {
        // Start reading session inline
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

    // Book not yet in org — trigger a public-books refresh, then navigate
    toast.info("Adding book to your library…");
    try {
      await fetch("/api/library/reader/public-books");
      const refreshRes = await fetch("/api/library/reader/books");
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        const refreshedBooks: (ReaderBook & { gutenbergId?: string })[] = refreshData.books || [];
        setBooks(refreshedBooks);
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
        setBooks(booksData.books || []);

        // Auto-seed public domain books if none exist
        const hasPublicBooks = (booksData.books || []).some((b: ReaderBook) => b.isPublicDomain);
        if (!hasPublicBooks && !seedingRef.current) {
          seedingRef.current = true;
          setSeedingPublicBooks(true);
          try {
            const seedRes = await fetch("/api/library/reader/public-books");
            if (seedRes.ok) {
              // Refresh book list after seeding
              const refreshRes = await fetch("/api/library/reader/books");
              if (refreshRes.ok) {
                const refreshData = await refreshRes.json();
                setBooks(refreshData.books || []);
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

  const startReading = async (readableBookId: string) => {
    setStartingBookId(readableBookId);
    const targetBook = books.find((book) => book.id === readableBookId);

    try {
      const res = await fetch("/api/library/reader/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readableBookId }),
      });

      if (res.status === 409) {
        // Already open, navigate directly
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
  };

  const closeBook = async (sessionId: string) => {
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
  };

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

  return (
    <MotionPage>
      <div className="px-4 pt-4 pb-24 max-w-2xl mx-auto space-y-6">
        {/* Quick Stats */}
        {stats && (
          <section className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-card border border-border p-3 text-center">
              <BarChart3 className="h-4 w-4 mx-auto text-indigo-500 mb-1" />
              <p className="text-lg font-bold">{stats.personal.activeBooks}</p>
              <p className="text-[10px] text-muted-foreground">Reading</p>
            </div>
            <div className="rounded-xl bg-card border border-border p-3 text-center">
              <Bookmark className="h-4 w-4 mx-auto text-amber-500 mb-1" />
              <p className="text-lg font-bold">{stats.personal.totalHighlights}</p>
              <p className="text-[10px] text-muted-foreground">Highlights</p>
            </div>
            <div className="rounded-xl bg-card border border-border p-3 text-center">
              <BookOpen className="h-4 w-4 mx-auto text-emerald-500 mb-1" />
              <p className="text-lg font-bold">{stats.orgStats.totalBooks}</p>
              <p className="text-[10px] text-muted-foreground">Library</p>
            </div>
          </section>
        )}

        {/* Search Books (Meilisearch-powered) */}
        <section className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search books by title, author, genre…"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 pr-10"
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

        {/* Currently Reading */}
        {sessions.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-500" />
              Currently Reading ({sessions.length}/{READER_MAX_ACTIVE_BOOKS})
            </h2>
            <MotionList className="space-y-3">
              <AnimatePresence mode="popLayout">
                {sessions.map((s) => (
                  <MotionItem key={s.id}>
                    <motion.div
                      layout
                      className="flex gap-3 p-3 rounded-xl bg-card border border-border shadow-sm"
                      whileTap={{ scale: 0.98 }}
                      transition={spring.snappy}
                    >
                      {/* Book cover */}
                      <div
                        className="w-16 h-24 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex-shrink-0 flex items-center justify-center overflow-hidden cursor-pointer"
                        onClick={() => router.push(`/library-reader/${s.readableBookId}`)}
                      >
                        {s.bookCover ? (
                          <img src={s.bookCover} alt={s.bookTitle} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <BookOpen className="h-6 w-6 text-white/80" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3
                          className="font-semibold text-sm truncate cursor-pointer hover:text-indigo-500 transition-colors"
                          onClick={() => router.push(`/library-reader/${s.readableBookId}`)}
                        >
                          {s.bookTitle}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate">{s.bookAuthor}</p>

                        {/* Progress bar */}
                        <div className="mt-2">
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                            <span>Page {s.currentPage}</span>
                            <span>{s.totalPages > 0 ? Math.round((s.currentPage / s.totalPages) * 100) : 0}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-indigo-500 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: s.totalPages > 0 ? `${(s.currentPage / s.totalPages) * 100}%` : "0%" }}
                              transition={spring.gentle}
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs gap-1 flex-1"
                            onClick={() => router.push(`/library-reader/${s.readableBookId}`)}
                          >
                            <Play className="h-3 w-3" /> Continue
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground"
                            onClick={() => closeBook(s.id)}
                            disabled={closingSessionId === s.id}
                          >
                            {closingSessionId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  </MotionItem>
                ))}
              </AnimatePresence>
            </MotionList>
          </section>
        )}

        {/* Trending Books */}
        {stats && stats.trending.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-rose-500" />
              Trending This Week
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {stats.trending.map((t) => (
                <motion.div
                  key={t.bookId}
                  className="flex-shrink-0 w-28 rounded-xl bg-card border border-border shadow-sm overflow-hidden cursor-pointer"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    const match = books.find((b) => b.id === t.bookId);
                    if (match?.isActive) {
                      router.push(`/library-reader/${t.bookId}`);
                    } else if (match) {
                      startReading(t.bookId);
                    }
                  }}
                >
                  <div className="aspect-[2/3] bg-gradient-to-br from-rose-500/20 to-orange-600/20 flex items-center justify-center overflow-hidden">
                    {t.coverImageUrl ? (
                      <img src={t.coverImageUrl} alt={t.title} className="w-full h-full object-cover" />
                    ) : (
                      <BookOpen className="h-8 w-8 text-muted-foreground/30" />
                    )}
                  </div>
                  <div className="p-2">
                    <h3 className="font-semibold text-[10px] truncate">{t.title}</h3>
                    <p className="text-[9px] text-muted-foreground truncate">{t.author}</p>
                    <p className="text-[9px] text-rose-500 font-medium mt-0.5">{t.recentReaders} reader{t.recentReaders !== 1 ? "s" : ""}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Popular Highlights */}
        {stats && stats.popularHighlights.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Popular Highlights
            </h2>
            <div className="space-y-2">
              {stats.popularHighlights.slice(0, 5).map((h, i) => (
                <div key={i} className="rounded-xl bg-card border border-border p-3">
                  <div className="border-l-2 border-amber-400 pl-3">
                    <p className="text-sm italic text-foreground/90 line-clamp-3">&ldquo;{h.highlightedText}&rdquo;</p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[10px] text-muted-foreground">
                      {h.bookTitle} — Ch. {h.chapterNumber}
                    </p>
                    <span className="text-[10px] text-amber-600 font-medium">
                      {h.highlightCount} highlight{h.highlightCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Public Domain Books */}
        {(() => {
          const publicBooks = books.filter((b) => b.isPublicDomain);
          if (publicBooks.length === 0) return null;
          return (
            <section>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Globe className="h-5 w-5 text-emerald-500" />
                Public Domain Books
              </h2>
              <MotionList className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {publicBooks.map((b) => (
                  <MotionItem key={b.id}>
                    <motion.div
                      className={cn(
                        "relative rounded-xl overflow-hidden bg-card border border-border shadow-sm cursor-pointer group",
                        b.isActive && "ring-2 ring-indigo-500",
                      )}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      transition={spring.snappy}
                      onClick={() => {
                        if (b.isActive) {
                          router.push(`/library-reader/${b.id}`);
                        } else {
                          startReading(b.id);
                        }
                      }}
                    >
                      <div className="aspect-[2/3] bg-gradient-to-br from-emerald-500/20 to-teal-600/20 flex items-center justify-center overflow-hidden">
                        {b.coverImageUrl ? (
                          <img src={b.coverImageUrl} alt={b.title} className="w-full h-full object-cover" />
                        ) : (
                          <BookOpen className="h-10 w-10 text-muted-foreground/30" />
                        )}
                      </div>
                      <div className="p-2.5">
                        <h3 className="font-semibold text-xs truncate">{b.title}</h3>
                        <p className="text-[10px] text-muted-foreground truncate">{b.author}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[9px] text-emerald-600 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded-full">Public Domain</span>
                        </div>
                      </div>
                      {b.isActive && (
                        <div className="absolute top-2 right-2 bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          Reading
                        </div>
                      )}
                      {startingBookId === b.id && (
                        <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                        </div>
                      )}
                    </motion.div>
                  </MotionItem>
                ))}
              </MotionList>
            </section>
          );
        })()}

        {/* Organisation Books */}
        <section>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            {books.some((b) => b.isPublicDomain) ? "Organisation Books" : "Available Books"}
          </h2>

          {(() => {
            const orgBooks = books.filter((b) => !b.isPublicDomain);
            if (orgBooks.length === 0 && !books.some((b) => b.isPublicDomain)) {
              return (
                <div className="text-center py-12 text-muted-foreground">
                  <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No digital books available yet.</p>
                  <p className="text-xs mt-1">Check back later for new additions.</p>
                </div>
              );
            }
            if (orgBooks.length === 0) return null;
            return (
              <MotionList className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {orgBooks.map((b) => (
                  <MotionItem key={b.id}>
                    <motion.div
                      className={cn(
                        "relative rounded-xl overflow-hidden bg-card border border-border shadow-sm cursor-pointer group",
                        b.isActive && "ring-2 ring-indigo-500",
                      )}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      transition={spring.snappy}
                      onClick={() => {
                        if (b.isActive) {
                          router.push(`/library-reader/${b.id}`);
                        } else {
                          startReading(b.id);
                        }
                      }}
                    >
                      <div className="aspect-[2/3] bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center overflow-hidden">
                        {b.coverImageUrl ? (
                          <img src={b.coverImageUrl} alt={b.title} className="w-full h-full object-cover" />
                        ) : (
                          <BookOpen className="h-10 w-10 text-muted-foreground/30" />
                        )}
                      </div>
                      <div className="p-2.5">
                        <h3 className="font-semibold text-xs truncate">{b.title}</h3>
                        <p className="text-[10px] text-muted-foreground truncate">{b.author}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[10px] text-muted-foreground">{b.totalPages} pages</span>
                          {b.isAudioEnabled && (
                            <span className="text-[10px] text-indigo-500 font-medium">• Audio</span>
                          )}
                          {b.contentType === "SCANNED" && (
                            <span className="text-[9px] text-orange-500 font-medium bg-orange-500/10 px-1.5 py-0.5 rounded-full">Scanned</span>
                          )}
                        </div>
                      </div>
                      {b.isActive && (
                        <div className="absolute top-2 right-2 bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          Reading
                        </div>
                      )}
                      {startingBookId === b.id && (
                        <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                        </div>
                      )}
                    </motion.div>
                  </MotionItem>
                ))}
              </MotionList>
            );
          })()}
        </section>

        {/* Seeding indicator */}
        {seedingPublicBooks && (
          <div className="text-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-500 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Loading public domain books...</p>
          </div>
        )}
      </div>
    </MotionPage>
  );
}
