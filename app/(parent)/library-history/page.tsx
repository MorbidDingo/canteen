"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  BookOpen,
  Loader2,
  Search,
} from "lucide-react";
import {
  BOOK_CATEGORY_LABELS,
  type BookCategory,
} from "@/lib/constants";
import { useSSE } from "@/lib/events";

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
}

interface DiscoverData {
  children: ChildOption[];
  selectedChildId: string | null;
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

export default function LibraryHistoryPage() {
  const [data, setData] = useState<DiscoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");

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
      if (query) params.set("q", query);
      if (category !== "ALL") params.set("category", category);

      const res = await fetch(`/api/library/discover?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json: DiscoverData = await res.json();

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
      toast.error("Failed to load library history");
    } finally {
      setLoading(false);
    }
  }, [selectedChildId, query, category]);

  useSSE("library-updated", () => {
    void fetchDiscover();
  });

  useEffect(() => {
    void fetchDiscover();
  }, [fetchDiscover]);

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
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          No children found.
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell space-y-4 pb-24">
      <section className="rounded-md border bg-background p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_200px_200px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="h-10 pl-9"
              placeholder="Search title or author"
            />
          </div>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-10">
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
            <SelectTrigger className="h-10">
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

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">Currently Issued</h2>
        {data.issued.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">No active issuances.</CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {data.issued.map((item) => {
              const daysRemaining = getDaysRemaining(item.dueDate);
              const overdue = daysRemaining < 0;

              return (
                <Card key={item.issuanceId}>
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
                      {item.bookCoverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.bookCoverUrl} alt={item.bookTitle} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <BookOpen className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-medium">{item.bookTitle}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{item.bookAuthor}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Issued {new Date(item.issuedAt).toLocaleDateString()} • Due {new Date(item.dueDate).toLocaleDateString()}
                      </p>
                    </div>

                    <Badge className={overdue ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}>
                      {overdue
                        ? `${Math.abs(daysRemaining)}d overdue`
                        : `${daysRemaining}d left`}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">Reading History</h2>
        {visibleHistory.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">No history yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {visibleHistory.slice(0, 20).map((item) => (
                <div key={item.issuanceId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium">{item.bookTitle}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {item.bookAuthor} • {getCategoryLabel(item.bookCategory)}
                    </p>
                  </div>
                  <Badge variant="outline">{item.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
