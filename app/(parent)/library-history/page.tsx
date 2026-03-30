"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  BookOpen,
  Loader2,
  Search,
  MapPin,
  Clock,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  BOOK_CATEGORY_LABELS,
  type BookCategory,
} from "@/lib/constants";
import { useSSE } from "@/lib/events";
import { LibrarySelector } from "@/components/library-selector";
import { usePersistedSelection } from "@/lib/use-persisted-selection";
import { cn } from "@/lib/utils";

interface ChildOption {
  id: string;
  name: string;
  className: string | null;
  section: string | null;
}

interface IssuedRecord {
  issuanceId: string;
  status: string;
  issuedAt: string;
  dueDate: string;
  returnedAt: string | null;
  reissueCount: number;
  fineAmount: number;
  accessionNumber: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  bookCategory: string;
  bookCoverUrl: string | null;
  libraryId?: string | null;
  libraryName?: string | null;
  libraryLocation?: string | null;
}

interface DiscoverData {
  children: ChildOption[];
  selectedChildId: string | null;
  selectedLibraryId?: string | null;
  libraries?: Array<{ id: string; name: string; location: string | null }>;
  filters: {
    query: string;
    category: string;
  };
  issued: IssuedRecord[];
  history: IssuedRecord[];
}

function getCategoryLabel(category: string) {
  return BOOK_CATEGORY_LABELS[category as BookCategory] ?? category;
}

function getDaysRemaining(dueDate: string) {
  const due = new Date(dueDate);
  const now = new Date();
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function LibraryHistoryPage() {
  const [data, setData] = useState<DiscoverData | null>(null);
  const [loading, setLoading] = useState(true);
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
    const handle = setTimeout(() => {
      setQuery(searchInput.trim());
    }, 250);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const fetchDiscover = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (selectedChildId) params.set("childId", selectedChildId);
      if (selectedLibrary) params.set("libraryId", selectedLibrary);
      if (query) params.set("q", query);
      if (category !== "ALL") params.set("category", category);

      const res = await fetch(`/api/library/discover?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json: DiscoverData = await res.json();

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
      toast.error("Failed to load library history");
    } finally {
      setLoading(false);
    }
  }, [selectedChildId, selectedLibrary, query, category, setSelectedLibrary]);

  useSSE("library-updated", () => {
    void fetchDiscover();
  });

  useEffect(() => {
    if (!libraryScopeHydrated) return;
    void fetchDiscover();
  }, [fetchDiscover, libraryScopeHydrated]);

  const visibleHistory = useMemo(() => data?.history ?? [], [data]);

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
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No children found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell space-y-4 pb-24">
      {/* Library selector */}
      <section className="flex justify-start">
        <LibrarySelector value={selectedLibrary} onChange={setSelectedLibrary} showAll compact />
      </section>

      {/* Search and filters - compact inline */}
      <section className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="h-9 rounded-xl border-border/50 bg-card/80 pl-8 text-sm shadow-sm backdrop-blur-sm"
            placeholder="Search books..."
          />
        </div>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-auto min-w-[120px] rounded-xl border-border/50 bg-card/80 text-xs shadow-sm">
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
          <SelectTrigger className="h-9 w-auto min-w-[100px] rounded-xl border-border/50 bg-card/80 text-xs shadow-sm">
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
      </section>

      {/* Currently Issued - Premium cards */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Currently Issued</h2>
          {data.issued.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{data.issued.length}</Badge>
          )}
        </div>

        {data.issued.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-6 text-center">
            <BookOpen className="mx-auto h-6 w-6 text-muted-foreground/30" />
            <p className="mt-1.5 text-xs text-muted-foreground">No active issuances</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.issued.map((item) => {
              const daysRemaining = getDaysRemaining(item.dueDate);
              const overdue = daysRemaining < 0;

              return (
                <div
                  key={item.issuanceId}
                  className={cn(
                    "group rounded-2xl border bg-card/80 p-3 shadow-sm backdrop-blur-sm transition-all",
                    overdue
                      ? "border-red-200/60 dark:border-red-900/30"
                      : "border-border/50 hover:border-border/80",
                  )}
                >
                  <div className="flex gap-3">
                    {/* Book cover */}
                    <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-muted shadow-sm">
                      {item.bookCoverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.bookCoverUrl} alt={item.bookTitle} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60 text-muted-foreground/40">
                          <BookOpen className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-sm font-semibold leading-tight">{item.bookTitle}</p>
                          <p className="line-clamp-1 mt-0.5 text-xs text-muted-foreground">{item.bookAuthor}</p>
                        </div>
                        <Badge className={cn(
                          "shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold",
                          overdue
                            ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
                        )}>
                          {overdue ? (
                            <><AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />{Math.abs(daysRemaining)}d overdue</>
                          ) : (
                            <>{daysRemaining}d left</>
                          )}
                        </Badge>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {item.libraryName && (
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5" />
                            {item.libraryName}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-0.5">
                          <CalendarDays className="h-2.5 w-2.5" />
                          {formatDate(item.issuedAt)} → {formatDate(item.dueDate)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Reading History - Clean list */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Reading History</h2>
          {visibleHistory.length > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{visibleHistory.length}</Badge>
          )}
        </div>

        {visibleHistory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-6 text-center">
            <BookOpen className="mx-auto h-6 w-6 text-muted-foreground/30" />
            <p className="mt-1.5 text-xs text-muted-foreground">No history yet</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleHistory.slice(0, 20).map((item) => (
              <div
                key={item.issuanceId}
                className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/60 px-3 py-2.5 shadow-sm backdrop-blur-sm transition-colors hover:bg-card/90"
              >
                {/* Mini cover */}
                <div className="h-10 w-7 shrink-0 overflow-hidden rounded-md bg-muted">
                  {item.bookCoverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.bookCoverUrl} alt={item.bookTitle} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                      <BookOpen className="h-3 w-3" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium leading-tight">{item.bookTitle}</p>
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">
                    {item.bookAuthor} · {getCategoryLabel(item.bookCategory)}
                  </p>
                </div>

                <Badge variant="outline" className="shrink-0 rounded-md text-[10px]">
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
