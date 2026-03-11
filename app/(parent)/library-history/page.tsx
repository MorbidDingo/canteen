"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  BookOpen,
  Loader2,
  Clock,
  AlertTriangle,
  CheckCircle,
  BookMarked,
  Calendar,
  Star,
} from "lucide-react";
import {
  ISSUANCE_STATUS_LABELS,
  ISSUANCE_STATUS_COLORS,
  BOOK_CATEGORY_LABELS,
  type IssuanceStatus,
  type BookCategory,
} from "@/lib/constants";
import { useSSE } from "@/lib/events";

interface ChildOption {
  id: string;
  name: string;
}

interface IssuanceRecord {
  id: string;
  status: string;
  issuedAt: string;
  dueDate: string;
  returnedAt: string | null;
  reissueCount: number;
  fineAmount: number;
  fineDeducted: boolean;
  notes: string | null;
  accessionNumber: string;
  bookTitle: string;
  bookAuthor: string;
  bookCategory: string;
  bookCoverUrl: string | null;
}

interface Stats {
  totalBooksRead: number;
  thisMonthCount: number;
  favoriteCategory: string | null;
}

interface HistoryData {
  children: ChildOption[];
  issued: IssuanceRecord[];
  history: IssuanceRecord[];
  stats: Stats | null;
  overdueCount: number;
}

function getDaysRemaining(dueDate: string) {
  const due = new Date(dueDate);
  const now = new Date();
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyColor(daysRemaining: number) {
  if (daysRemaining < 0) return "text-red-600 bg-red-50 border-red-200";
  if (daysRemaining <= 4) return "text-yellow-700 bg-yellow-50 border-yellow-200";
  return "text-green-700 bg-green-50 border-green-200";
}

function getUrgencyIcon(daysRemaining: number) {
  if (daysRemaining < 0) return <AlertTriangle className="h-4 w-4 text-red-600" />;
  if (daysRemaining <= 4) return <Clock className="h-4 w-4 text-yellow-600" />;
  return <CheckCircle className="h-4 w-4 text-green-600" />;
}

export default function LibraryHistoryPage() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChild, setSelectedChild] = useState<string>("");

  // Re-fetch on SSE library updates
  useSSE("library-updated", () => {
    if (selectedChild) fetchData(selectedChild);
  });

  const fetchData = useCallback(async (childId?: string) => {
    try {
      const params = childId ? `?childId=${childId}` : "";
      const res = await fetch(`/api/library/history${params}`);
      if (!res.ok) throw new Error();
      const json: HistoryData = await res.json();
      setData(json);
      if (!childId && json.children.length > 0) {
        setSelectedChild(json.children[0].id);
      }
    } catch {
      toast.error("Failed to load library data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleChildChange = (childId: string) => {
    setSelectedChild(childId);
    setLoading(true);
    fetchData(childId);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.children.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-muted-foreground py-16">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No children found</p>
          <p className="text-sm">Add a child to see library history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header with child selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Library
          </h1>
          <p className="text-muted-foreground text-sm">
            Track borrowed books and reading history
          </p>
        </div>
        {data.children.length > 1 && (
          <Select value={selectedChild} onValueChange={handleChildChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select child" />
            </SelectTrigger>
            <SelectContent>
              {data.children.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Summary Stats */}
      {data.stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <BookMarked className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{data.stats.totalBooksRead}</p>
                <p className="text-xs text-muted-foreground">Total Books Read</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Calendar className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{data.stats.thisMonthCount}</p>
                <p className="text-xs text-muted-foreground">This Month</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Star className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {data.stats.favoriteCategory
                    ? BOOK_CATEGORY_LABELS[data.stats.favoriteCategory as BookCategory] ??
                      data.stats.favoriteCategory
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Favorite Category</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Currently Issued Books */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Currently Issued</h2>
        {data.issued.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No books currently issued
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.issued.map((item) => {
              const daysRemaining = getDaysRemaining(item.dueDate);
              const urgency = getUrgencyColor(daysRemaining);
              return (
                <Card key={item.id} className={`border ${urgency}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">
                          {item.bookTitle}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {item.bookAuthor}
                        </p>
                      </div>
                      <Badge
                        className={
                          ISSUANCE_STATUS_COLORS[item.status as IssuanceStatus] ?? ""
                        }
                        variant="secondary"
                      >
                        {ISSUANCE_STATUS_LABELS[item.status as IssuanceStatus] ??
                          item.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      {getUrgencyIcon(daysRemaining)}
                      <span className="font-medium">
                        {daysRemaining < 0
                          ? `Overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? "s" : ""}`
                          : daysRemaining === 0
                            ? "Due today"
                            : `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Due: {new Date(item.dueDate).toLocaleDateString()}
                      </span>
                      <span>
                        Issued: {new Date(item.issuedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {item.reissueCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Reissued {item.reissueCount} time
                        {item.reissueCount !== 1 ? "s" : ""}
                      </p>
                    )}
                    {item.fineAmount > 0 && (
                      <p className="text-xs font-medium text-red-600">
                        Fine: ₹{item.fineAmount.toFixed(2)}
                        {item.fineDeducted && " (deducted)"}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {BOOK_CATEGORY_LABELS[item.bookCategory as BookCategory] ??
                          item.bookCategory}
                      </span>
                      <span>#{item.accessionNumber}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Book History */}
      <section>
        <h2 className="text-lg font-semibold mb-3">History</h2>
        {data.history.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No reading history yet
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {data.history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">
                      {item.bookTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.bookAuthor} &middot;{" "}
                      {BOOK_CATEGORY_LABELS[item.bookCategory as BookCategory] ??
                        item.bookCategory}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.issuedAt).toLocaleDateString()} →{" "}
                      {item.returnedAt
                        ? new Date(item.returnedAt).toLocaleDateString()
                        : "—"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge
                      className={
                        ISSUANCE_STATUS_COLORS[item.status as IssuanceStatus] ?? ""
                      }
                      variant="secondary"
                    >
                      {ISSUANCE_STATUS_LABELS[item.status as IssuanceStatus] ??
                        item.status}
                    </Badge>
                    {item.fineAmount > 0 && (
                      <span className="text-xs text-red-600">
                        ₹{item.fineAmount.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
