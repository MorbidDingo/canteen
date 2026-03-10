"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ScrollText,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Monitor,
  User,
} from "lucide-react";

interface AuditEntry {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  action: string;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const ACTION_LABELS: Record<string, string> = {
  MENU_ITEM_CREATED: "Menu Item Created",
  MENU_ITEM_UPDATED: "Menu Item Updated",
  MENU_ITEM_DELETED: "Menu Item Deleted",
  ORDER_STATUS_CHANGED: "Order Status Changed",
  CARD_ASSIGNED: "Card Assigned",
  CARD_UNLINKED: "Card Unlinked",
  STUDENT_CREATED: "Student Created",
  STUDENT_DELETED: "Student Deleted",
  UNITS_UPDATED: "Units Updated",
  UNITS_RESET: "Units Reset",
};

const ACTION_COLORS: Record<string, string> = {
  MENU_ITEM_CREATED: "bg-green-100 text-green-800",
  MENU_ITEM_UPDATED: "bg-blue-100 text-blue-800",
  MENU_ITEM_DELETED: "bg-red-100 text-red-800",
  ORDER_STATUS_CHANGED: "bg-yellow-100 text-yellow-800",
  CARD_ASSIGNED: "bg-purple-100 text-purple-800",
  CARD_UNLINKED: "bg-orange-100 text-orange-800",
  STUDENT_CREATED: "bg-green-100 text-green-800",
  STUDENT_DELETED: "bg-red-100 text-red-800",
  UNITS_UPDATED: "bg-blue-100 text-blue-800",
  UNITS_RESET: "bg-orange-100 text-orange-800",
};

function parseDetails(details: string | null): Record<string, unknown> | null {
  if (!details) return null;
  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
}

function formatUserAgent(ua: string | null): string {
  if (!ua) return "Unknown";
  if (ua.includes("Mobile")) return "Mobile";
  if (ua.includes("Tablet")) return "Tablet";
  return "Desktop";
}

export default function ManagementAuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("all");

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (actionFilter !== "all") params.set("action", actionFilter);
      const res = await fetch(`/api/management/audit?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch {
      toast.error("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            Audit Log
          </h1>
          <p className="text-muted-foreground text-sm">
            Track all administrative actions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={actionFilter}
            onValueChange={(v) => { setActionFilter(v); setPage(1); }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={fetchLogs}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-16" />
            </Card>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ScrollText className="h-12 w-12 mb-2 opacity-40" />
            <p>No audit entries found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {logs.map((entry, index) => {
              const details = parseDetails(entry.details);
              return (
                <Card
                  key={entry.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${index * 20}ms` }}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge
                            className={`text-[10px] ${ACTION_COLORS[entry.action] || "bg-gray-100 text-gray-800"}`}
                          >
                            {ACTION_LABELS[entry.action] || entry.action}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {entry.userRole}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{entry.userName}</span>
                          <span className="text-muted-foreground text-xs">
                            ({entry.userEmail})
                          </span>
                        </div>
                        {details && (
                          <div className="mt-1.5 text-xs text-muted-foreground space-x-2">
                            {Object.entries(details).map(([key, val]) => (
                              <span key={key}>
                                <span className="font-medium">{key}:</span>{" "}
                                {String(val)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {formatTime(entry.createdAt)}
                        </p>
                        <div className="flex items-center gap-1 justify-end mt-1 text-[10px] text-muted-foreground">
                          <Monitor className="h-3 w-3" />
                          {formatUserAgent(entry.userAgent)}
                          {entry.ipAddress && (
                            <span className="ml-1">· {entry.ipAddress}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} entries)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
