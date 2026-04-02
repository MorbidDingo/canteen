"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "@/components/ui/motion";
import { spring } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import type { ReadingMode } from "@/lib/constants";
import {
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Loader2,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  X,
  Minus,
  Plus,
  List,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Settings2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ──────────────────────────────────────────────

interface Chapter {
  id: string;
  chapterNumber: number;
  title: string;
  content: string;
  pageStart: number;
  pageEnd: number;
  audioUrl: string | null;
}

interface BookInfo {
  id: string;
  title: string;
  author: string;
  totalPages: number;
  totalChapters: number;
  isAudioEnabled: boolean;
  coverImageUrl: string | null;
  contentType?: string;
}

interface BookmarkItem {
  id: string;
  chapterNumber: number;
  page: number;
  label: string | null;
  createdAt: string;
}

interface HighlightItem {
  id: string;
  chapterNumber: number;
  page: number;
  startOffset: number;
  endOffset: number;
  highlightedText: string;
  color: string;
  note: string | null;
  createdAt: string;
}

// ─── Mode Config ─────────────────────────────────────────

const MODE_CONFIG: Record<
  ReadingMode,
  {
    bg: string;
    text: string;
    sub: string;
    bar: string;
    sheet: string;
    filter: string;
    accent: string;
    btnHover: string;
    icon: React.ReactNode;
  }
> = {
  LIGHT: {
    bg: "bg-[#FAFAF8]",
    text: "text-[#1C1C1C]",
    sub: "text-[#888]",
    bar: "bg-white/85 backdrop-blur-xl border-black/[0.06]",
    sheet: "bg-white border-black/[0.06]",
    filter: "",
    accent: "text-indigo-600",
    btnHover: "hover:bg-black/[0.05]",
    icon: <Sun className="h-4 w-4" />,
  },
  DARK: {
    bg: "bg-[#0F0F0F]",
    text: "text-[#E0E0E0]",
    sub: "text-[#666]",
    bar: "bg-[#1A1A1A]/90 backdrop-blur-xl border-white/[0.08]",
    sheet: "bg-[#1A1A1A] border-white/[0.08]",
    filter: "",
    accent: "text-indigo-400",
    btnHover: "hover:bg-white/[0.06]",
    icon: <Moon className="h-4 w-4" />,
  },
  BLUE_LIGHT: {
    bg: "bg-[#FFF8EE]",
    text: "text-[#2C1B00]",
    sub: "text-[#A07840]",
    bar: "bg-[#FFF8EE]/90 backdrop-blur-xl border-amber-900/[0.08]",
    sheet: "bg-[#FFF8EE] border-amber-900/[0.08]",
    filter: "sepia(18%) saturate(80%)",
    accent: "text-amber-700",
    btnHover: "hover:bg-amber-900/[0.06]",
    icon: <span className="text-sm">🕯️</span>,
  },
  GREY: {
    bg: "bg-[#EBEBEB]",
    text: "text-[#282828]",
    sub: "text-[#777]",
    bar: "bg-[#F2F2F2]/90 backdrop-blur-xl border-black/[0.06]",
    sheet: "bg-[#F2F2F2] border-black/[0.06]",
    filter: "saturate(0%)",
    accent: "text-[#444]",
    btnHover: "hover:bg-black/[0.05]",
    icon: <span className="text-sm">⚪</span>,
  },
};

const MODE_ORDER: ReadingMode[] = ["LIGHT", "DARK", "BLUE_LIGHT", "GREY"];
const MODE_LABELS: Record<ReadingMode, string> = {
  LIGHT: "Light",
  DARK: "Dark",
  BLUE_LIGHT: "Warm",
  GREY: "Grey",
};

// ─── Highlight Colors ────────────────────────────────────

const HIGHLIGHT_COLORS = [
  { color: "#fbbf24", label: "Amber" },
  { color: "#34d399", label: "Green" },
  { color: "#60a5fa", label: "Blue" },
  { color: "#f87171", label: "Red" },
  { color: "#c084fc", label: "Purple" },
];

// ─── Width Options ───────────────────────────────────────

const WIDTH_OPTIONS = [
  { label: "S", title: "Narrow", px: 520 },
  { label: "M", title: "Normal", px: 680 },
  { label: "L", title: "Wide", px: 840 },
] as const;
type WidthPx = (typeof WIDTH_OPTIONS)[number]["px"];

// ─── Utility: absolute DOM offset ───────────────────────

function getAbsoluteTextOffset(container: HTMLElement, targetNode: Node, nodeOffset: number): number {
  let total = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let cur: Node | null = walker.nextNode();
  while (cur) {
    if (cur === targetNode) return total + nodeOffset;
    total += cur.textContent?.length ?? 0;
    cur = walker.nextNode();
  }
  return total + nodeOffset;
}

// ─── Utility: compute pages ──────────────────────────────

interface PageSlice {
  startOffset: number; // char offset in chapter content
  endOffset: number;
}

function computePageSlices(
  content: string,
  containerHeight: number,
  fontSize: number,
  lineHeight: number,
  textWidthPx: number,
  titleHeightPx: number,
): PageSlice[] {
  if (typeof window === "undefined" || containerHeight <= 0 || !content) {
    return [{ startOffset: 0, endOffset: content.length }];
  }

  const probe = document.createElement("div");
  probe.style.cssText = [
    "position:fixed",
    "top:-9999px",
    "left:0",
    `width:${textWidthPx}px`,
    `font-size:${fontSize}px`,
    `line-height:${lineHeight}`,
    "font-family:inherit",
    "white-space:pre-wrap",
    "word-break:break-word",
    "visibility:hidden",
    "pointer-events:none",
    "padding:0",
    "margin:0",
  ].join(";");
  document.body.appendChild(probe);

  const paragraphs = content.split("\n");
  const slices: PageSlice[] = [];
  let buf: string[] = [];
  let bufHeight = 0;
  let pageStartOffset = 0;
  let isFirst = true;

  const cap = () => (isFirst ? Math.max(60, containerHeight - titleHeightPx) : containerHeight);

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    probe.textContent = p || "\u00A0";
    const ph = probe.offsetHeight;

    if (bufHeight + ph > cap() && buf.length > 0) {
      const joined = buf.join("\n");
      slices.push({ startOffset: pageStartOffset, endOffset: pageStartOffset + joined.length });
      pageStartOffset += joined.length + 1; // +1 for the \n separator
      buf = [p];
      bufHeight = ph;
      isFirst = false;
    } else {
      if (buf.length > 0) bufHeight += ph;
      else bufHeight = ph;
      buf.push(p);
    }
  }

  if (buf.length > 0) {
    const joined = buf.join("\n");
    slices.push({ startOffset: pageStartOffset, endOffset: pageStartOffset + joined.length });
  }

  document.body.removeChild(probe);
  return slices.length > 0 ? slices : [{ startOffset: 0, endOffset: content.length }];
}

// ─── Highlight Renderer ──────────────────────────────────

function renderWithHighlights(
  text: string,
  pageStartOffset: number,
  highlights: HighlightItem[],
  onClickHighlight: (hl: HighlightItem) => void,
): React.ReactNode {
  const pageEndOffset = pageStartOffset + text.length;

  const pageHls = mergeOverlapping(
    highlights
      .filter((hl) => hl.startOffset < pageEndOffset && hl.endOffset > pageStartOffset)
      .map((hl) => ({
        ...hl,
        localStart: Math.max(0, hl.startOffset - pageStartOffset),
        localEnd: Math.min(text.length, hl.endOffset - pageStartOffset),
      }))
      .filter((hl) => hl.localStart < hl.localEnd),
  );

  if (pageHls.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let idx = 0;

  for (const hl of pageHls) {
    if (hl.localStart > idx) {
      parts.push(<span key={`t${idx}`}>{text.slice(idx, hl.localStart)}</span>);
    }
    parts.push(
      <mark
        key={hl.id}
        onClick={() => onClickHighlight(hl)}
        style={{
          backgroundColor: `${hl.color}38`,
          borderBottom: `2px solid ${hl.color}`,
          borderRadius: "2px 2px 0 0",
          padding: "1px 0",
          cursor: "pointer",
        }}
        title={hl.note || hl.highlightedText}
      >
        {text.slice(hl.localStart, hl.localEnd)}
      </mark>,
    );
    idx = hl.localEnd;
  }

  if (idx < text.length) parts.push(<span key="tend">{text.slice(idx)}</span>);

  return <>{parts}</>;
}

// ─── Merge overlapping highlight spans ───────────────────
type LocalHighlight = HighlightItem & { localStart: number; localEnd: number };

function mergeOverlapping(hls: LocalHighlight[]): LocalHighlight[] {
  if (hls.length <= 1) return hls;
  const sorted = [...hls].sort((a, b) => a.localStart - b.localStart);
  const merged: LocalHighlight[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.localStart < last.localEnd) {
      // Overlapping — extend the current merged span
      merged[merged.length - 1] = {
        ...last,
        localEnd: Math.max(last.localEnd, cur.localEnd),
      };
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

// ─── Component ───────────────────────────────────────────

export function BookReader({ bookId }: { bookId: string }) {
  const router = useRouter();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const contentInnerRef = useRef<HTMLDivElement>(null);

  // ── Core data
  const [loading, setLoading] = useState(true);
  const [bookInfo, setBookInfo] = useState<BookInfo | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);

  // ── Reading position
  const [currentChapter, setCurrentChapter] = useState(1);
  const [pageIndex, setPageIndex] = useState(0); // 0-based index within pageSlices
  const [direction, setDirection] = useState(0);

  // ── Presentation
  const [readingMode, setReadingMode] = useState<ReadingMode>("LIGHT");
  const [fontSize, setFontSize] = useState(17);
  const [lineHeight, setLineHeight] = useState(1.85);
  const [contentWidth, setContentWidth] = useState<WidthPx>(680);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── UI panels
  const [showControls, setShowControls] = useState(true);
  const [activePanel, setActivePanel] = useState<"none" | "settings" | "annotations" | "chapters">(
    "none",
  );
  const [annotationTab, setAnnotationTab] = useState<"bookmarks" | "highlights">("bookmarks");
  const [activeHighlight, setActiveHighlight] = useState<HighlightItem | null>(null);

  // ── Pending highlight (shown when user selects text — awaiting color pick)
  const [pendingHighlight, setPendingHighlight] = useState<{
    text: string;
    startOffset: number;
    endOffset: number;
    bookPage: number;
  } | null>(null);

  // ── Audio
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ── Return position after annotation jump
  const [savedPosition, setSavedPosition] = useState<{ chapter: number; page: number } | null>(
    null,
  );

  // ── Pagination
  const [pageSlices, setPageSlices] = useState<PageSlice[]>([]);
  const [containerHeight, setContainerHeight] = useState(0);
  const [restoredBookPage, setRestoredBookPage] = useState<number | null>(null);

  const mode = MODE_CONFIG[readingMode];

  // ── Derived
  const activeChapter = useMemo(
    () => chapters.find((c) => c.chapterNumber === currentChapter),
    [chapters, currentChapter],
  );

  const currentPageSlice = pageSlices[pageIndex] ?? null;

  const currentPageText = useMemo(() => {
    if (!activeChapter || !currentPageSlice) return "";
    return activeChapter.content.slice(currentPageSlice.startOffset, currentPageSlice.endOffset);
  }, [activeChapter, currentPageSlice]);

  const currentChapterHighlights = useMemo(
    () => highlights.filter((h) => h.chapterNumber === currentChapter),
    [highlights, currentChapter],
  );

  useEffect(() => {
    if (chapters.length === 0) return;
    if (chapters.some((chapter) => chapter.chapterNumber === currentChapter)) return;

    setCurrentChapter(chapters[0].chapterNumber);
    setPageIndex(0);
    setRestoredBookPage(null);
  }, [chapters, currentChapter]);

  // ── Map page index → API book-page number
  function currentPageToBookPage(): number {
    if (!activeChapter) return 1;
    const total = pageSlices.length;
    if (total <= 1) return activeChapter.pageStart;
    return Math.round(
      activeChapter.pageStart +
        (pageIndex / (total - 1)) * (activeChapter.pageEnd - activeChapter.pageStart),
    );
  }

  const isCurrentPageBookmarked = useMemo(() => {
    if (!activeChapter) return false;
    const bookPage = currentPageToBookPage();
    return bookmarks.some((b) => b.chapterNumber === currentChapter && b.page === bookPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarks, currentChapter, pageIndex, pageSlices, activeChapter]);

  // ── Measure content area
  useLayoutEffect(() => {
    const measure = () => {
      if (contentAreaRef.current) {
        const h = contentAreaRef.current.clientHeight;
        if (h > 0) setContainerHeight(h);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (contentAreaRef.current) ro.observe(contentAreaRef.current);
    return () => ro.disconnect();
  }, [isFullscreen, loading]);

  // ── Compute page slices when chapter or settings change
  useEffect(() => {
    if (!activeChapter || containerHeight <= 0) return;

    const padding = 48; // vertical padding in content area
    const titleH = fontSize * lineHeight * 2.5 + 32;
    const availH = containerHeight - padding;

    // Actual text column width
    const vw = window.innerWidth;
    const actualWidth = Math.min(contentWidth, vw) - 40; // 40 = horizontal padding

    const slices = computePageSlices(
      activeChapter.content,
      availH,
      fontSize,
      lineHeight,
      actualWidth,
      titleH,
    );
    setPageSlices(slices);
    // Keep page index in bounds
    setPageIndex((prev) => Math.min(prev, Math.max(0, slices.length - 1)));
  }, [activeChapter, containerHeight, fontSize, lineHeight, contentWidth]);

  useEffect(() => {
    if (!activeChapter || pageSlices.length === 0 || restoredBookPage == null) return;

    const chapterSpan = activeChapter.pageEnd - activeChapter.pageStart;
    const nextPageIndex = chapterSpan > 0
      ? Math.round(
          ((restoredBookPage - activeChapter.pageStart) / chapterSpan) *
            Math.max(0, pageSlices.length - 1),
        )
      : 0;

    setPageIndex(Math.max(0, Math.min(pageSlices.length - 1, nextPageIndex)));
    setRestoredBookPage(null);
  }, [activeChapter, pageSlices, restoredBookPage]);

  // ── Data Fetching
  const fetchBookData = useCallback(async () => {
    try {
      const [contentRes, bookmarksRes, highlightsRes, progressRes] = await Promise.all([
        fetch(`/api/library/reader/${bookId}/content`),
        fetch(`/api/library/reader/${bookId}/bookmarks`),
        fetch(`/api/library/reader/${bookId}/highlights`),
        fetch(`/api/library/reader/${bookId}/progress`),
      ]);

      if (!contentRes.ok) {
        const errData = await contentRes.json().catch(() => null);
        toast.error(errData?.error || "Failed to load book content");
        router.push("/library-reader");
        return;
      }

      const contentData = await contentRes.json();
      const nextChapters = contentData.chapters ?? [];
      setBookInfo(contentData.book);
      setChapters(nextChapters);

      if (bookmarksRes.ok) {
        const d = await bookmarksRes.json();
        setBookmarks(d.bookmarks ?? []);
      }
      if (highlightsRes.ok) {
        const d = await highlightsRes.json();
        setHighlights(d.highlights ?? []);
      }
      if (progressRes.ok) {
        const d = await progressRes.json();
        const p = d.progress;
        if (p) {
          const hasSavedChapter = nextChapters.some(
            (chapter: Chapter) => chapter.chapterNumber === p.currentChapter,
          );
          const fallbackChapter = nextChapters[0]?.chapterNumber ?? 1;

          setCurrentChapter(hasSavedChapter ? p.currentChapter : fallbackChapter);
          setRestoredBookPage(hasSavedChapter ? (p.currentPage ?? null) : null);
          setReadingMode(p.readingMode as ReadingMode);
          setFontSize(p.fontSize ?? 17);
        } else {
          setCurrentChapter(nextChapters[0]?.chapterNumber ?? 1);
          setRestoredBookPage(null);
        }
      } else {
        setCurrentChapter(nextChapters[0]?.chapterNumber ?? 1);
        setRestoredBookPage(null);
      }
    } catch {
      toast.error("Failed to load book");
    } finally {
      setLoading(false);
    }
  }, [bookId, router]);

  useEffect(() => {
    fetchBookData();
  }, [fetchBookData]);

  // ── Auto-hide controls (only in fullscreen)
  const resetHideTimer = useCallback(() => {
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    setShowControls(true);
    if (isFullscreen) {
      hideControlsTimer.current = setTimeout(() => {
        if (activePanel === "none") setShowControls(false);
      }, 4000);
    }
  }, [activePanel, isFullscreen]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [resetHideTimer]);

  // Always show controls when not in fullscreen
  useEffect(() => {
    if (!isFullscreen) {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      setShowControls(true);
    }
  }, [isFullscreen]);

  // Keep controls visible while a panel is open
  useEffect(() => {
    if (activePanel !== "none") {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
      setShowControls(true);
    } else {
      resetHideTimer();
    }
  }, [activePanel, resetHideTimer]);

  // ── Progress auto-save
  const saveProgress = useCallback(
    (chapter: number, bookPage: number, mode: ReadingMode, size: number) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        fetch(`/api/library/reader/${bookId}/progress`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentChapter: chapter,
            currentPage: bookPage,
            readingMode: mode,
            fontSize: size,
          }),
        }).catch(() => {});
      }, 1000);
    },
    [bookId],
  );

  // ── Navigation
  const goToPageIndex = useCallback(
    (newPageIdx: number) => {
      if (!activeChapter) return;

      // Dismiss any pending highlight when navigating
      setPendingHighlight(null);
      window.getSelection()?.removeAllRanges();

      if (newPageIdx >= pageSlices.length) {
        // Advance to next chapter
        const nextCh = chapters.find((c) => c.chapterNumber === currentChapter + 1);
        if (nextCh) {
          setDirection(1);
          setCurrentChapter(nextCh.chapterNumber);
          setPageIndex(0);
          saveProgress(nextCh.chapterNumber, nextCh.pageStart, readingMode, fontSize);
        }
        return;
      }

      if (newPageIdx < 0) {
        // Go to previous chapter last page
        const prevCh = chapters.find((c) => c.chapterNumber === currentChapter - 1);
        if (prevCh) {
          setDirection(-1);
          setCurrentChapter(prevCh.chapterNumber);
          setPageIndex(Number.MAX_SAFE_INTEGER); // will be clamped by slice recompute
          saveProgress(prevCh.chapterNumber, prevCh.pageEnd, readingMode, fontSize);
        }
        return;
      }

      setDirection(newPageIdx > pageIndex ? 1 : -1);
      setPageIndex(newPageIdx);
      const bookPage =
        activeChapter.pageStart +
        Math.round(
          (newPageIdx / Math.max(1, pageSlices.length - 1)) *
            (activeChapter.pageEnd - activeChapter.pageStart),
        );
      saveProgress(currentChapter, bookPage, readingMode, fontSize);
    },
    [
      activeChapter,
      chapters,
      currentChapter,
      pageIndex,
      pageSlices,
      readingMode,
      fontSize,
      saveProgress,
    ],
  );

  const goToChapter = useCallback(
    (chapterNum: number) => {
      const ch = chapters.find((c) => c.chapterNumber === chapterNum);
      if (ch) {
        setDirection(chapterNum > currentChapter ? 1 : -1);
        setCurrentChapter(ch.chapterNumber);
        setPageIndex(0);
        setActivePanel("none");
        saveProgress(ch.chapterNumber, ch.pageStart, readingMode, fontSize);
      }
    },
    [chapters, currentChapter, readingMode, fontSize, saveProgress],
  );

  const navigateToAnnotation = useCallback(
    (chapterNum: number, bookPage: number) => {
      setSavedPosition({ chapter: currentChapter, page: pageIndex });
      setDirection(chapterNum >= currentChapter ? 1 : -1);
      setCurrentChapter(chapterNum);
      // Approximate page index from book page
      const ch = chapters.find((c) => c.chapterNumber === chapterNum);
      if (ch) {
        const fraction =
          ch.pageEnd > ch.pageStart
            ? (bookPage - ch.pageStart) / (ch.pageEnd - ch.pageStart)
            : 0;
        setPageIndex(Math.max(0, Math.round(fraction * (pageSlices.length - 1))));
      }
      setActivePanel("none");
    },
    [currentChapter, pageIndex, chapters, pageSlices.length],
  );

  const returnToSaved = useCallback(() => {
    if (!savedPosition) return;
    setDirection(
      savedPosition.chapter > currentChapter
        ? 1
        : savedPosition.chapter < currentChapter
          ? -1
          : savedPosition.page > pageIndex
            ? 1
            : -1,
    );
    setCurrentChapter(savedPosition.chapter);
    setPageIndex(savedPosition.page);
    saveProgress(savedPosition.chapter, savedPosition.page, readingMode, fontSize);
    setSavedPosition(null);
  }, [savedPosition, currentChapter, pageIndex, readingMode, fontSize, saveProgress]);

  // ── Bookmark
  const toggleBookmark = useCallback(async () => {
    const bookPage = currentPageToBookPage();
    const existing = bookmarks.find(
      (b) => b.chapterNumber === currentChapter && b.page === bookPage,
    );

    if (existing) {
      await fetch(
        `/api/library/reader/${bookId}/bookmarks?bookmarkId=${encodeURIComponent(existing.id)}`,
        { method: "DELETE" },
      );
      setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
      toast.success("Bookmark removed");
    } else {
      const res = await fetch(`/api/library/reader/${bookId}/bookmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterNumber: currentChapter,
          page: bookPage,
          label: `Ch ${currentChapter} · Pg ${bookPage}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setBookmarks((prev) => [...prev, data.bookmark]);
        toast.success("Bookmarked");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, bookmarks, currentChapter, pageIndex, pageSlices, activeChapter]);

  // ── Highlight
  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentInnerRef.current) return;
    const text = sel.toString().trim();
    if (!text || text.length < 3) return;

    const range = sel.getRangeAt(0);
    const startOffset = getAbsoluteTextOffset(
      contentInnerRef.current,
      range.startContainer,
      range.startOffset,
    );
    const endOffset = getAbsoluteTextOffset(
      contentInnerRef.current,
      range.endContainer,
      range.endOffset,
    );

    // Adjust by page slice offset to get chapter-level offset
    const pageStart = currentPageSlice?.startOffset ?? 0;
    const bookPage = currentPageToBookPage();

    setPendingHighlight({
      text,
      startOffset: pageStart + startOffset,
      endOffset: pageStart + endOffset,
      bookPage,
    });
  }, [currentChapter, currentPageSlice, pageIndex, pageSlices, activeChapter]);

  const confirmHighlight = useCallback(
    async (color: string) => {
      if (!pendingHighlight) return;
      const res = await fetch(`/api/library/reader/${bookId}/highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterNumber: currentChapter,
          page: pendingHighlight.bookPage,
          startOffset: pendingHighlight.startOffset,
          endOffset: pendingHighlight.endOffset,
          highlightedText: pendingHighlight.text,
          color,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setHighlights((prev) => [...prev, data.highlight]);
        window.getSelection()?.removeAllRanges();
        toast.success("Highlighted");
      }
      setPendingHighlight(null);
    },
    [bookId, currentChapter, pendingHighlight],
  );

  const removeHighlight = useCallback(
    async (hlId: string) => {
      await fetch(`/api/library/reader/${bookId}/highlights?highlightId=${encodeURIComponent(hlId)}`, {
        method: "DELETE",
      });
      setHighlights((prev) => prev.filter((h) => h.id !== hlId));
      setActiveHighlight(null);
      toast.success("Highlight removed");
    },
    [bookId],
  );

  // ── TTS
  const toggleSpeech = useCallback(() => {
    if (isSpeaking) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    if (!currentPageText) return;
    const utt = new SpeechSynthesisUtterance(currentPageText);
    utt.rate = 0.9;
    utt.onend = () => setIsSpeaking(false);
    utt.onerror = () => setIsSpeaking(false);
    speechSynthesis.speak(utt);
    setIsSpeaking(true);
  }, [isSpeaking, currentPageText]);

  // ── Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        goToPageIndex(pageIndex + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goToPageIndex(pageIndex - 1);
      } else if (e.key === "Escape") {
        if (activePanel !== "none") setActivePanel("none");
        else if (isFullscreen) setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goToPageIndex, pageIndex, activePanel, isFullscreen]);

  // ── Touch swipe
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (window.getSelection()?.toString().trim()) return;

      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      const isSwipe = Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50;

      if (isSwipe) {
        // Navigate pages but do NOT show controls (swipe should not reveal UI)
        if (dx < 0) goToPageIndex(pageIndex + 1);
        else goToPageIndex(pageIndex - 1);
      } else {
        // Tap — show controls
        resetHideTimer();
      }
    },
    [goToPageIndex, pageIndex, resetHideTimer],
  );

  // ── Fullscreen API
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // fallback: toggle CSS full-screen
      setIsFullscreen((v) => !v);
    }
  }, []);

  // ── Cleanup
  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, []);

  // ── Overall progress %
  const progressPct = useMemo(() => {
    if (!bookInfo || bookInfo.totalPages <= 0) return 0;
    const bookPage = currentPageToBookPage();
    return (bookPage / bookInfo.totalPages) * 100;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookInfo, currentChapter, pageIndex, pageSlices, activeChapter]);

  // ─── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center min-h-[100dvh] gap-4",
          "bg-[#FAFAF8]",
        )}
      >
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        <p className="text-sm text-neutral-400 font-light tracking-wide">Opening book…</p>
      </div>
    );
  }

  if (!bookInfo || chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] gap-3 px-6">
        <BookOpen className="h-9 w-9 text-neutral-300" />
        <p className="text-sm text-neutral-500 text-center">Book content is not available yet.</p>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full text-xs"
          onClick={() => router.push("/library-reader")}
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Back to library
        </Button>
      </div>
    );
  }

  const isFirstPage =
    currentChapter === chapters[0]?.chapterNumber && pageIndex === 0;
  const isLastPage =
    currentChapter === chapters[chapters.length - 1]?.chapterNumber &&
    pageIndex >= pageSlices.length - 1;

  const isFirstChPageOfChapter = pageIndex === 0;
  const chapterTitle = activeChapter?.title ?? "";

  return (
    <div
      className={cn(
        "flex flex-col",
        mode.bg,
        isFullscreen ? "fixed inset-0 z-[60]" : "min-h-[100dvh]",
      )}
      style={{ filter: mode.filter || undefined }}
      onClick={resetHideTimer}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Top bar ── */}
      <motion.div
        animate={{ opacity: showControls ? 1 : 0, y: showControls ? 0 : -8 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "sticky top-0 z-30 flex items-center justify-between px-3 h-[52px] border-b",
          mode.bar,
          "pointer-events-none",
        )}
        style={{ pointerEvents: showControls ? "auto" : "none" }}
      >
        {/* Left */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              speechSynthesis.cancel();
              router.push("/library-reader");
            }}
            className={cn(
              "h-8 w-8 flex items-center justify-center rounded-full transition-colors",
              mode.btnHover,
              mode.text,
            )}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Center */}
        <div className="flex-1 text-center px-3 min-w-0">
          <p className={cn("text-xs font-semibold truncate tracking-tight", mode.text)}>
            {bookInfo.title}
          </p>
          <p className={cn("text-[10px] truncate mt-0.5", mode.sub)}>
            {chapterTitle ? `${chapterTitle}` : `Chapter ${currentChapter}`}
            {pageSlices.length > 1 ? ` · ${pageIndex + 1}/${pageSlices.length}` : ""}
          </p>
        </div>

        {/* Right */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActivePanel(activePanel === "chapters" ? "none" : "chapters")}
            className={cn(
              "h-8 w-8 flex items-center justify-center rounded-full transition-colors",
              mode.btnHover,
              activePanel === "chapters" ? mode.accent : mode.text,
            )}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setActivePanel(activePanel === "settings" ? "none" : "settings")}
            className={cn(
              "h-8 w-8 flex items-center justify-center rounded-full transition-colors",
              mode.btnHover,
              activePanel === "settings" ? mode.accent : mode.text,
            )}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className={cn(
              "h-8 w-8 flex items-center justify-center rounded-full transition-colors",
              mode.btnHover,
              mode.text,
            )}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </motion.div>

      {/* ── Content area ── */}
      <div
        ref={contentAreaRef}
        className="flex-1 relative overflow-hidden"
      >
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={`${currentChapter}-${pageIndex}`}
            custom={direction}
            initial={{ opacity: 0, x: direction > 0 ? "6%" : "-6%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction > 0 ? "-6%" : "6%" }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute inset-0 overflow-hidden"
          >
            <div
              className="h-full overflow-y-hidden flex flex-col items-center"
            >
              <div
                className="w-full h-full px-5 py-6 overflow-hidden"
                style={{ maxWidth: `${contentWidth}px` }}
              >
                {/* Chapter title on first page */}
                {isFirstChPageOfChapter && chapterTitle && (
                  <div className="mb-6">
                    <p className={cn("text-[10px] uppercase tracking-[0.2em] mb-1", mode.sub)}>
                      Chapter {currentChapter}
                    </p>
                    <h2
                      className={cn("text-xl font-bold leading-snug", mode.text)}
                      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                    >
                      {chapterTitle}
                    </h2>
                    <div
                      className="mt-3 h-px w-8 rounded-full"
                      style={{ background: "currentColor", opacity: 0.15 }}
                    />
                  </div>
                )}

                {/* Page content */}
                <div
                  ref={contentInnerRef}
                  className={cn("whitespace-pre-wrap select-text", mode.text)}
                  style={{
                    fontSize: `${fontSize}px`,
                    lineHeight: lineHeight,
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontFeatureSettings: '"liga" 1, "kern" 1',
                    letterSpacing: "0.01em",
                    userSelect: "text",
                    WebkitUserSelect: "text",
                  }}
                  onMouseUp={handleTextSelection}
                  onTouchEnd={(e) => {
                    // Only process selection if text was selected (not a swipe)
                    const dx = Math.abs(e.changedTouches[0].clientX - touchStartX.current);
                    if (dx < 30) handleTextSelection();
                  }}
                >
                  {currentPageSlice ? (
                    renderWithHighlights(
                      currentPageText,
                      currentPageSlice.startOffset,
                      currentChapterHighlights,
                      (hl) => setActiveHighlight(hl),
                    )
                  ) : (
                    <div className={cn("flex min-h-[30vh] items-center justify-center text-sm", mode.sub)}>
                      Preparing page…
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bottom bar ── */}
      <motion.div
        animate={{ opacity: showControls ? 1 : 0, y: showControls ? 0 : 8 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "sticky bottom-0 z-30 border-t",
          mode.bar,
          isFullscreen ? "" : "pb-safe",
        )}
        style={{ pointerEvents: showControls ? "auto" : "none" }}
      >
        {/* Progress bar */}
        <div className="h-[2px] w-full overflow-hidden">
          <motion.div
            className="h-full bg-indigo-500/60 rounded-full"
            animate={{ width: `${progressPct}%` }}
            transition={spring.gentle}
          />
        </div>

        <div className="flex items-center justify-between px-4 h-14">
          {/* Prev */}
          <button
            onClick={() => goToPageIndex(pageIndex - 1)}
            disabled={isFirstPage}
            className={cn(
              "h-9 w-9 flex items-center justify-center rounded-full transition-colors",
              mode.btnHover,
              mode.text,
              isFirstPage && "opacity-25 pointer-events-none",
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* Center controls */}
          <div className="flex items-center gap-1">
            {/* Bookmark */}
            <button
              onClick={toggleBookmark}
              className={cn(
                "h-9 w-9 flex items-center justify-center rounded-full transition-colors",
                mode.btnHover,
                isCurrentPageBookmarked ? "text-amber-500" : mode.text,
              )}
            >
              <Bookmark
                className={cn("h-4 w-4", isCurrentPageBookmarked && "fill-current")}
              />
            </button>

            {/* Annotations */}
            <button
              onClick={() =>
                setActivePanel(activePanel === "annotations" ? "none" : "annotations")
              }
              className={cn(
                "h-9 w-9 flex items-center justify-center rounded-full transition-colors",
                mode.btnHover,
                activePanel === "annotations" ? mode.accent : mode.text,
              )}
            >
              <Highlighter className="h-4 w-4" />
            </button>

            {/* Reading mode cycle */}
            <button
              onClick={() => {
                const idx = MODE_ORDER.indexOf(readingMode);
                const next = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
                setReadingMode(next);
                saveProgress(currentChapter, currentPageToBookPage(), next, fontSize);
              }}
              className={cn(
                "h-9 w-9 flex items-center justify-center rounded-full transition-colors",
                mode.btnHover,
                mode.text,
              )}
            >
              {mode.icon}
            </button>

            {/* TTS */}
            <button
              onClick={toggleSpeech}
              className={cn(
                "h-9 w-9 flex items-center justify-center rounded-full transition-colors",
                mode.btnHover,
                isSpeaking ? "text-indigo-500" : mode.text,
              )}
            >
              {isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>

          {/* Next */}
          <button
            onClick={() => goToPageIndex(pageIndex + 1)}
            disabled={isLastPage}
            className={cn(
              "h-9 w-9 flex items-center justify-center rounded-full transition-colors",
              mode.btnHover,
              mode.text,
              isLastPage && "opacity-25 pointer-events-none",
            )}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </motion.div>

      {/* ── Settings panel ── */}
      <AnimatePresence>
        {activePanel === "settings" && (
          <>
            <motion.div
              key="settings-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
              onClick={() => setActivePanel("none")}
            />
            <motion.div
              key="settings-sheet"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={spring.snappy}
              className={cn(
                "fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t shadow-2xl",
                mode.sheet,
              )}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-8 h-1 rounded-full bg-current opacity-20" />
              </div>

              <div className="px-5 pb-8 pt-2 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className={cn("text-sm font-semibold", mode.text)}>Reading Settings</h3>
                  <button
                    onClick={() => setActivePanel("none")}
                    className={cn(
                      "h-7 w-7 flex items-center justify-center rounded-full",
                      mode.btnHover,
                      mode.sub,
                    )}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Reading mode */}
                <div>
                  <p className={cn("text-[10px] uppercase tracking-widest mb-2.5", mode.sub)}>
                    Mode
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {MODE_ORDER.map((m) => {
                      const mc = MODE_CONFIG[m];
                      return (
                        <button
                          key={m}
                          onClick={() => {
                            setReadingMode(m);
                            saveProgress(currentChapter, currentPageToBookPage(), m, fontSize);
                          }}
                          className={cn(
                            "py-2.5 px-1 rounded-xl border text-[11px] font-medium transition-all flex flex-col items-center gap-1",
                            readingMode === m
                              ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-600"
                              : cn(mc.bg, "border-transparent opacity-70"),
                          )}
                        >
                          <span>{mc.icon}</span>
                          <span className={readingMode === m ? "" : mc.text}>
                            {MODE_LABELS[m]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Font size */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className={cn("text-[10px] uppercase tracking-widest", mode.sub)}>
                      Font Size
                    </p>
                    <span className={cn("text-xs font-semibold tabular-nums", mode.text)}>
                      {fontSize}px
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        const s = Math.max(13, fontSize - 1);
                        setFontSize(s);
                        saveProgress(currentChapter, currentPageToBookPage(), readingMode, s);
                      }}
                      disabled={fontSize <= 13}
                      className={cn(
                        "h-8 w-8 flex items-center justify-center rounded-full border",
                        mode.btnHover,
                        mode.text,
                        fontSize <= 13 && "opacity-30",
                      )}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <div className="flex-1 relative h-1.5 rounded-full bg-current/10">
                      <div
                        className="absolute left-0 top-0 h-full bg-indigo-500/70 rounded-full transition-all"
                        style={{ width: `${((fontSize - 13) / (26 - 13)) * 100}%` }}
                      />
                    </div>
                    <button
                      onClick={() => {
                        const s = Math.min(26, fontSize + 1);
                        setFontSize(s);
                        saveProgress(currentChapter, currentPageToBookPage(), readingMode, s);
                      }}
                      disabled={fontSize >= 26}
                      className={cn(
                        "h-8 w-8 flex items-center justify-center rounded-full border",
                        mode.btnHover,
                        mode.text,
                        fontSize >= 26 && "opacity-30",
                      )}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Line height */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className={cn("text-[10px] uppercase tracking-widest", mode.sub)}>
                      Line Spacing
                    </p>
                    <span className={cn("text-xs font-semibold tabular-nums", mode.text)}>
                      {lineHeight.toFixed(2)}×
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {[1.5, 1.7, 1.85, 2.1].map((lh) => (
                      <button
                        key={lh}
                        onClick={() => setLineHeight(lh)}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg border text-[11px] font-medium transition-all",
                          lineHeight === lh
                            ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-600"
                            : cn(mode.btnHover, "border-current/10", mode.sub),
                        )}
                      >
                        {lh}×
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content width */}
                <div>
                  <p className={cn("text-[10px] uppercase tracking-widest mb-2.5", mode.sub)}>
                    Page Width
                  </p>
                  <div className="flex gap-2">
                    {WIDTH_OPTIONS.map((w) => (
                      <button
                        key={w.px}
                        onClick={() => setContentWidth(w.px)}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg border text-[11px] font-medium transition-all flex flex-col items-center gap-0.5",
                          contentWidth === w.px
                            ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-600"
                            : cn(mode.btnHover, "border-current/10", mode.sub),
                        )}
                      >
                        <span className="font-bold">{w.label}</span>
                        <span className="text-[9px] opacity-70">{w.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Chapters panel ── */}
      <AnimatePresence>
        {activePanel === "chapters" && (
          <>
            <motion.div
              key="chapters-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
              onClick={() => setActivePanel("none")}
            />
            <motion.div
              key="chapters-sheet"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={spring.snappy}
              className={cn(
                "fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t shadow-2xl max-h-[70dvh] flex flex-col",
                mode.sheet,
              )}
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-8 h-1 rounded-full bg-current opacity-20" />
              </div>
              <div className="flex items-center justify-between px-5 py-2 flex-shrink-0">
                <h3 className={cn("text-sm font-semibold", mode.text)}>Chapters</h3>
                <button
                  onClick={() => setActivePanel("none")}
                  className={cn(
                    "h-7 w-7 flex items-center justify-center rounded-full",
                    mode.btnHover,
                    mode.sub,
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-3 pb-8">
                {chapters.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => goToChapter(ch.chapterNumber)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-3 mb-0.5",
                      ch.chapterNumber === currentChapter
                        ? "bg-indigo-500/10 text-indigo-600 font-medium"
                        : cn(mode.btnHover, mode.text),
                    )}
                  >
                    <span
                      className={cn(
                        "text-[10px] tabular-nums w-7 shrink-0",
                        ch.chapterNumber === currentChapter ? "text-indigo-500" : mode.sub,
                      )}
                    >
                      {ch.chapterNumber}
                    </span>
                    <span className="truncate">{ch.title}</span>
                    {ch.chapterNumber === currentChapter && (
                      <span className="ml-auto shrink-0 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Annotations panel ── */}
      <AnimatePresence>
        {activePanel === "annotations" && (
          <>
            <motion.div
              key="ann-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
              onClick={() => setActivePanel("none")}
            />
            <motion.div
              key="ann-sheet"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={spring.snappy}
              className={cn(
                "fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t shadow-2xl max-h-[70dvh] flex flex-col",
                mode.sheet,
              )}
            >
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-8 h-1 rounded-full bg-current opacity-20" />
              </div>
              <div className="flex items-center justify-between px-5 py-2 flex-shrink-0">
                <h3 className={cn("text-sm font-semibold", mode.text)}>Notes & Highlights</h3>
                <button
                  onClick={() => setActivePanel("none")}
                  className={cn(
                    "h-7 w-7 flex items-center justify-center rounded-full",
                    mode.btnHover,
                    mode.sub,
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex px-5 gap-3 flex-shrink-0 border-b border-current/10">
                {(["bookmarks", "highlights"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setAnnotationTab(tab)}
                    className={cn(
                      "pb-2 text-xs font-medium border-b-2 -mb-px transition-colors capitalize",
                      annotationTab === tab
                        ? cn("border-indigo-500", mode.accent)
                        : cn("border-transparent", mode.sub),
                    )}
                  >
                    {tab}{" "}
                    <span className="tabular-nums">
                      ({tab === "bookmarks" ? bookmarks.length : highlights.length})
                    </span>
                  </button>
                ))}
              </div>

              <div className="overflow-y-auto flex-1 px-3 pb-8 pt-2">
                {annotationTab === "bookmarks" ? (
                  <>
                    {bookmarks.length === 0 ? (
                      <p className={cn("text-xs text-center py-6", mode.sub)}>
                        No bookmarks yet.
                        <br />
                        Tap the bookmark icon to save your place.
                      </p>
                    ) : (
                      bookmarks.map((bm) => (
                        <button
                          key={bm.id}
                          onClick={() => navigateToAnnotation(bm.chapterNumber, bm.page)}
                          className={cn(
                            "w-full text-left px-3 py-3 rounded-xl mb-1 flex items-center gap-3 transition-colors",
                            mode.btnHover,
                          )}
                        >
                          <Bookmark className="h-4 w-4 text-amber-500 fill-current shrink-0" />
                          <div className="min-w-0">
                            <p className={cn("text-sm truncate", mode.text)}>
                              {bm.label ?? `Ch ${bm.chapterNumber} · Pg ${bm.page}`}
                            </p>
                            <p className={cn("text-[10px] mt-0.5", mode.sub)}>
                              {new Date(bm.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </>
                ) : (
                  <>
                    {highlights.length === 0 ? (
                      <p className={cn("text-xs text-center py-6", mode.sub)}>
                        No highlights yet.
                        <br />
                        Select text to highlight it.
                      </p>
                    ) : (
                      highlights.map((hl) => (
                        <button
                          key={hl.id}
                          onClick={() => navigateToAnnotation(hl.chapterNumber, hl.page)}
                          className={cn(
                            "w-full text-left px-3 py-3 rounded-xl mb-1 flex items-start gap-3 transition-colors",
                            mode.btnHover,
                          )}
                        >
                          <div
                            className="mt-0.5 h-3.5 w-1 rounded-full shrink-0"
                            style={{ backgroundColor: hl.color }}
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn("text-sm line-clamp-2 italic", mode.text)}
                            >
                              &ldquo;{hl.highlightedText}&rdquo;
                            </p>
                            {hl.note && (
                              <p className={cn("text-[10px] mt-0.5", mode.sub)}>{hl.note}</p>
                            )}
                            <p className={cn("text-[10px] mt-1", mode.sub)}>
                              Ch {hl.chapterNumber} · Pg {hl.page}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Highlight tooltip ── */}
      <AnimatePresence>
        {activeHighlight && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.18 }}
            className={cn(
              "fixed bottom-24 left-1/2 -translate-x-1/2 z-50 max-w-[80vw] rounded-2xl shadow-2xl border px-4 py-3",
              mode.sheet,
            )}
          >
            <p className={cn("text-xs italic line-clamp-3 mb-2", mode.text)}>
              &ldquo;{activeHighlight.highlightedText}&rdquo;
            </p>
            {activeHighlight.note && (
              <p className={cn("text-[10px] mb-2", mode.sub)}>{activeHighlight.note}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => removeHighlight(activeHighlight.id)}
                className={cn(
                  "text-[10px] px-2.5 py-1 rounded-full border transition-colors text-red-500 border-red-500/30",
                  "hover:bg-red-500/10",
                )}
              >
                Remove
              </button>
              <button
                onClick={() => setActiveHighlight(null)}
                className={cn(
                  "text-[10px] px-2.5 py-1 rounded-full border transition-colors",
                  mode.btnHover,
                  mode.sub,
                  "border-current/20",
                )}
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Highlight color toolbar (shown when text is selected) ── */}
      <AnimatePresence>
        {pendingHighlight && (
          <>
            <motion.div
              key="hl-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.01 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              onClick={() => {
                setPendingHighlight(null);
                window.getSelection()?.removeAllRanges();
              }}
            />
            <motion.div
              key="hl-toolbar"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 bg-white dark:bg-neutral-900 rounded-full shadow-2xl border border-black/10 px-3 py-2"
            >
              {/* Color swatches — tap to highlight with that color */}
              {HIGHLIGHT_COLORS.map(({ color, label }) => (
                <button
                  key={color}
                  aria-label={`Highlight ${label}`}
                  onClick={() => confirmHighlight(color)}
                  className="w-7 h-7 rounded-full border-[2.5px] border-white shadow-md transition-transform active:scale-95 hover:scale-110"
                  style={{ backgroundColor: color }}
                />
              ))}

              {/* Divider */}
              <div className="w-px h-5 bg-black/10 mx-0.5" />

              {/* Cancel */}
              <button
                onClick={() => {
                  setPendingHighlight(null);
                  window.getSelection()?.removeAllRanges();
                }}
                className="h-7 px-2.5 rounded-full text-[11px] font-medium text-neutral-500 hover:bg-black/5 transition-colors"
              >
                Cancel
              </button>
            </motion.div>
            {/* Helper text */}
            <motion.p
              key="hl-hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed bottom-[116px] left-1/2 -translate-x-1/2 z-50 text-[10px] text-white/80 whitespace-nowrap bg-black/40 rounded-full px-2.5 py-0.5"
            >
              Pick a color to highlight
            </motion.p>
          </>
        )}
      </AnimatePresence>

      {/* ── Return-to-position pill ── */}
      <AnimatePresence>
        {savedPosition && (
          <motion.button
            initial={{ y: 24, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.9 }}
            transition={spring.snappy}
            onClick={returnToSaved}
            className={cn(
              "fixed z-50 bottom-24 left-1/2 -translate-x-1/2",
              "flex items-center gap-2 px-4 py-2 rounded-full shadow-xl text-xs font-medium",
              "bg-indigo-600 text-white",
            )}
          >
            <RotateCcw className="h-3 w-3" />
            Return to reading
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
