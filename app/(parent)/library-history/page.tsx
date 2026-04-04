"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Loader2 } from "lucide-react";
import { useSSE } from "@/lib/events";
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
  const {
    value: selectedLibrary,
    setValue: setSelectedLibrary,
    hydrated: libraryScopeHydrated,
  } = usePersistedSelection("certe:selected-library-id");

  const fetchDiscover = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (selectedChildId) params.set("childId", selectedChildId);
      if (selectedLibrary) params.set("libraryId", selectedLibrary);

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
    } catch {
      toast.error("Failed to load library history");
    } finally {
      setLoading(false);
    }
  }, [selectedChildId, selectedLibrary, setSelectedLibrary]);

  useSSE("library-updated", () => {
    void fetchDiscover();
  });

  useEffect(() => {
    if (!libraryScopeHydrated) return;
    void fetchDiscover();
  }, [fetchDiscover, libraryScopeHydrated]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.children.length === 0) {
    return (
      <div className="px-5 pb-24 sm:px-8">
        <div className="py-16 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-muted-foreground/20" />
          <p className="mt-2 text-[15px] text-muted-foreground">No members found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 px-5 pb-24 sm:px-8">

      {/* Child filter — only if 2+ children */}
      {data.children.length > 1 && (
        <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          {data.children.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedChildId(c.id)}
              className={cn(
                "h-8 shrink-0 rounded-full px-3 text-[12px] font-medium transition-colors",
                (selectedChildId || data.selectedChildId || data.children[0]?.id) === c.id
                  ? "bg-foreground text-background"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/60",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Currently Issued */}
      <section className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Currently Issued</p>

        {data.issued.length === 0 ? (
          <div className="py-10 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/20" />
            <p className="mt-2 text-[13px] text-muted-foreground">No active issuances</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.issued.map((item) => {
              const daysRemaining = getDaysRemaining(item.dueDate);
              const overdue = daysRemaining < 0;

              return (
                <div
                  key={item.issuanceId}
                  className="flex gap-3 rounded-2xl bg-card p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                >
                  {/* Book cover */}
                  <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {item.bookCoverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.bookCoverUrl} alt={item.bookTitle} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                        <BookOpen className="h-4 w-4" />
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[15px] font-semibold leading-tight">{item.bookTitle}</p>
                    <p className="line-clamp-1 mt-0.5 text-[13px] text-muted-foreground">{item.bookAuthor}</p>
                    <p className={cn(
                      "mt-1 text-[12px] font-medium",
                      overdue ? "text-destructive" : "text-emerald-600",
                    )}>
                      {overdue
                        ? `Overdue ${Math.abs(daysRemaining)} days`
                        : `Due ${formatDate(item.dueDate)} · ${daysRemaining} days`}
                    </p>
                  </div>

                  {/* Overdue dot indicator */}
                  {overdue && (
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-destructive" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Returned — text-only rows */}
      <section className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Returned</p>

        {(data.history ?? []).length === 0 ? (
          <div className="py-10 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/20" />
            <p className="mt-2 text-[13px] text-muted-foreground">No history yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {(data.history ?? []).slice(0, 20).map((item) => (
              <div
                key={item.issuanceId}
                className="rounded-xl px-3 py-2.5"
              >
                <p className="text-[14px] font-medium leading-tight">
                  {item.bookTitle} · <span className="font-normal text-muted-foreground">{item.bookAuthor}</span>
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Returned {item.returnedAt ? formatDate(item.returnedAt) : "N/A"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
