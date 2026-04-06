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

const ACTION_CATEGORIES: Record<string, { label: string; actions: Record<string, string> }> = {
  accounts: {
    label: "Accounts & Access",
    actions: {
      ACCOUNT_CREATED: "Account Created",
      ACCOUNT_UPDATED: "Account Updated",
      ACCOUNT_DELETED: "Account Deleted",
      ACCOUNT_BULK_CREATED: "Accounts Bulk Created",
      PASSWORD_CHANGED: "Password Changed",
      CREDENTIALS_SENT: "Credentials Sent",
      PARENT_CREATED: "Parent Created",
      PARENT_UPDATED: "Parent Updated",
      PARENT_DELETED: "Parent Deleted",
    },
  },
  students: {
    label: "Students",
    actions: {
      STUDENT_CREATED: "Student Created",
      STUDENT_DELETED: "Student Deleted",
      STUDENT_PHOTO_UPDATED: "Student Photo Updated",
      BULK_UPLOAD: "Bulk Upload",
    },
  },
  cards: {
    label: "Cards & RFID",
    actions: {
      CARD_ASSIGNED: "Card Assigned",
      CARD_UNLINKED: "Card Unlinked",
      TEMP_CARD_ISSUED: "Temp Card Issued",
      TEMP_CARD_REVOKED: "Temp Card Revoked",
      GUEST_CARD_ISSUED: "Guest Card Issued",
    },
  },
  menu: {
    label: "Menu & Orders",
    actions: {
      MENU_ITEM_CREATED: "Menu Item Created",
      MENU_ITEM_UPDATED: "Menu Item Updated",
      MENU_ITEM_DELETED: "Menu Item Deleted",
      ORDER_STATUS_CHANGED: "Order Status Changed",
      DISCOUNT_CREATED: "Discount Created",
      DISCOUNT_UPDATED: "Discount Updated",
      DISCOUNT_DELETED: "Discount Deleted",
    },
  },
  finance: {
    label: "Finance & Payments",
    actions: {
      UNITS_UPDATED: "Units Updated",
      UNITS_RESET: "Units Reset",
      WALLET_TOPUP: "Wallet Top-up",
      PAYMENT_EVENT_CREATED: "Payment Event Created",
      PAYMENT_EVENT_UPDATED: "Payment Event Updated",
      PAYMENT_EVENT_DELETED: "Payment Event Deleted",
      PAYMENT_RECEIVED: "Payment Received",
      PAYMENT_ACCOUNT_CREATED: "Payment Account Created",
      PAYMENT_ACCOUNT_REVIEWED: "Payment Account Reviewed",
      PAYMENT_CONFIG_UPDATED: "Payment Config Updated",
      SETTLEMENT_ACCOUNT_CREATED: "Settlement Account Created",
      SETTLEMENT_ACCOUNT_APPROVED: "Settlement Account Approved",
      SETTLEMENT_ACCOUNT_BLOCKED: "Settlement Account Blocked",
      SETTLEMENT_ACCOUNT_UNBLOCKED: "Settlement Account Unblocked",
      CANTEEN_ROUTING_UPDATED: "Canteen Routing Updated",
    },
  },
  devices: {
    label: "Devices",
    actions: {
      DEVICE_ACCOUNT_CREATED: "Device Account Created",
      DEVICE_STATUS_UPDATED: "Device Status Updated",
      DEVICE_ASSIGNED: "Device Assigned",
      DEVICE_UNASSIGNED: "Device Unassigned",
    },
  },
  content: {
    label: "Notes & Assignments",
    actions: {
      CONTENT_POST_CREATED: "Post Created",
      CONTENT_POST_UPDATED: "Post Updated",
      CONTENT_POST_DELETED: "Post Deleted",
      CONTENT_SUBMITTED: "Assignment Submitted",
      CONTENT_PERMISSION_GRANTED: "Permission Granted",
      CONTENT_PERMISSION_UPDATED: "Permission Updated",
      CONTENT_PERMISSION_REVOKED: "Permission Revoked",
      CONTENT_TAG_CREATED: "Tag Created",
      CONTENT_TAG_UPDATED: "Tag Updated",
      CONTENT_TAG_DELETED: "Tag Deleted",
      CONTENT_GROUP_CREATED: "Group Created",
      CONTENT_GROUP_UPDATED: "Group Updated",
      CONTENT_GROUP_DELETED: "Group Deleted",
    },
  },
  library: {
    label: "Library",
    actions: {
      BOOK_CREATED: "Book Created",
      BOOK_UPDATED: "Book Updated",
      BOOK_ARCHIVED: "Book Archived",
      BOOK_COPY_ADDED: "Copy Added",
      BOOK_COPY_UPDATED: "Copy Updated",
      BOOK_COPY_RETIRED: "Copy Retired",
      BOOK_ISSUED: "Book Issued",
      BOOK_RETURNED: "Book Returned",
      BOOK_REISSUED: "Book Reissued",
      BOOK_LOST_MARKED: "Book Lost",
      LIBRARY_FINE_DEDUCTED: "Fine Deducted",
      RETURN_CONFIRMED: "Return Confirmed",
      RETURN_REJECTED: "Return Rejected",
      LIBRARY_SETTINGS_UPDATED: "Library Settings Updated",
      LIBRARY_BULK_UPLOAD: "Library Bulk Upload",
      READABLE_BOOK_CREATED: "Readable Book Created",
    },
  },
  settings: {
    label: "Settings & Notices",
    actions: {
      SETTINGS_UPDATED: "Settings Updated",
      NOTICE_CREATED: "Notice Created",
      GATE_TAP: "Gate Tap",
    },
  },
};

// Flatten for lookups
const ACTION_LABELS: Record<string, string> = {};
for (const cat of Object.values(ACTION_CATEGORIES)) {
  Object.assign(ACTION_LABELS, cat.actions);
}

const ACTION_CATEGORY_COLORS: Record<string, string> = {
  accounts: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  students: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cards: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  menu: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  finance: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  devices: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
  content: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  library: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  settings: "bg-stone-100 text-stone-800 dark:bg-stone-900/30 dark:text-stone-300",
};

const DELETE_ACTIONS = new Set([
  "MENU_ITEM_DELETED", "STUDENT_DELETED", "PARENT_DELETED", "ACCOUNT_DELETED",
  "BOOK_ARCHIVED", "BOOK_COPY_RETIRED", "CONTENT_POST_DELETED", "CONTENT_TAG_DELETED",
  "CONTENT_GROUP_DELETED", "CONTENT_PERMISSION_REVOKED", "PAYMENT_EVENT_DELETED",
  "DISCOUNT_DELETED", "SETTLEMENT_ACCOUNT_BLOCKED", "TEMP_CARD_REVOKED", "DEVICE_UNASSIGNED",
]);

function getCategoryForAction(action: string): string {
  for (const [cat, { actions }] of Object.entries(ACTION_CATEGORIES)) {
    if (action in actions) return cat;
  }
  return "settings";
}

function getActionColor(action: string): string {
  if (DELETE_ACTIONS.has(action)) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  return ACTION_CATEGORY_COLORS[getCategoryForAction(action)] || "bg-gray-100 text-gray-800";
}

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
      if (actionFilter !== "all") {
        if (actionFilter.startsWith("cat:")) {
          const catKey = actionFilter.slice(4);
          const cat = ACTION_CATEGORIES[catKey];
          if (cat) params.set("actions", Object.keys(cat.actions).join(","));
        } else {
          params.set("action", actionFilter);
        }
      }
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
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {Object.entries(ACTION_CATEGORIES).map(([catKey, cat]) => (
                <SelectItem key={catKey} value={`cat:${catKey}`}>
                  {cat.label}
                </SelectItem>
              ))}
              <SelectItem value="---" disabled>──────────</SelectItem>
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
                            className={`text-[10px] ${getActionColor(entry.action)}`}
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
