"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "@/components/ui/motion";
import { MotionPage, MotionList, MotionItem, spring } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { BookOpen, Loader2, Sparkles, X, Play, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { READER_MAX_ACTIVE_BOOKS } from "@/lib/constants";

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

export default function LibraryReaderPage() {
  const router = useRouter();
  const [books, setBooks] = useState<ReaderBook[]>([]);
  const [sessions, setSessions] = useState<ReadingSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [certePlusRequired, setCertePlusRequired] = useState(false);
  const [startingBookId, setStartingBookId] = useState<string | null>(null);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [booksRes, sessionsRes] = await Promise.all([
        fetch("/api/library/reader/books"),
        fetch("/api/library/reader/sessions"),
      ]);

      if (booksRes.status === 403) {
        setCertePlusRequired(true);
        setLoading(false);
        return;
      }

      if (booksRes.ok) {
        const booksData = await booksRes.json();
        setBooks(booksData.books || []);
      }

      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setSessions(sessionsData.sessions || []);
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
    try {
      const res = await fetch("/api/library/reader/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readableBookId }),
      });

      if (res.status === 409) {
        // Already open, navigate directly
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

        {/* Available Books */}
        <section>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Available Books
          </h2>

          {books.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No digital books available yet.</p>
              <p className="text-xs mt-1">Check back later for new additions.</p>
            </div>
          ) : (
            <MotionList className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {books.map((b) => (
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
                    {/* Cover */}
                    <div className="aspect-[2/3] bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center overflow-hidden">
                      {b.coverImageUrl ? (
                        <img src={b.coverImageUrl} alt={b.title} className="w-full h-full object-cover" />
                      ) : (
                        <BookOpen className="h-10 w-10 text-muted-foreground/30" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-2.5">
                      <h3 className="font-semibold text-xs truncate">{b.title}</h3>
                      <p className="text-[10px] text-muted-foreground truncate">{b.author}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] text-muted-foreground">{b.totalPages} pages</span>
                        {b.isAudioEnabled && (
                          <span className="text-[10px] text-indigo-500 font-medium">• Audio</span>
                        )}
                      </div>
                    </div>

                    {/* Active badge */}
                    {b.isActive && (
                      <div className="absolute top-2 right-2 bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                        Reading
                      </div>
                    )}

                    {/* Loading overlay */}
                    {startingBookId === b.id && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                      </div>
                    )}
                  </motion.div>
                </MotionItem>
              ))}
            </MotionList>
          )}
        </section>
      </div>
    </MotionPage>
  );
}
