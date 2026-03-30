"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Search, CheckCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSSE } from "@/lib/events";
import { cn } from "@/lib/utils";

type ParentNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: string | null;
  readAt: string | Date | null;
  createdAt: string | Date;
  childId: string;
  childName: string;
  childGrNumber: string | null;
};

type PageFilter = "ALL" | "UNREAD" | "KIOSK" | "GATE" | "LIBRARY" | "BLOCKED";

function getNotificationCategory(type: string): Exclude<PageFilter, "ALL" | "UNREAD"> {
  if (type.startsWith("KIOSK_")) return "KIOSK";
  if (type.startsWith("GATE_")) return "GATE";
  if (type.startsWith("LIBRARY_")) return "LIBRARY";
  if (type.startsWith("BLOCKED_")) return "BLOCKED";
  return "LIBRARY";
}

function dateBucketLabel(value: string | Date) {
  const d = new Date(value);
  const now = new Date();

  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);

  const startYesterday = new Date(startToday);
  startYesterday.setDate(startToday.getDate() - 1);

  const startGiven = new Date(d);
  startGiven.setHours(0, 0, 0, 0);

  if (startGiven.getTime() === startToday.getTime()) return "Today";
  if (startGiven.getTime() === startYesterday.getTime()) return "Yesterday";

  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function ParentNotificationsPage() {
  const [notifications, setNotifications] = useState<ParentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PageFilter>("ALL");

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/parent/notifications?limit=100", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: ParentNotification[];
      };
      setNotifications(data.notifications ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useSSE("parent-notification", fetchNotifications);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();

    return notifications.filter((n) => {
      if (filter === "UNREAD" && n.readAt) return false;
      if (filter !== "ALL" && filter !== "UNREAD") {
        if (getNotificationCategory(n.type) !== filter) return false;
      }

      if (!q) return true;
      const haystack = `${n.title} ${n.message} ${n.childName} ${n.childGrNumber ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [filter, notifications, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, ParentNotification[]>();
    for (const n of visible) {
      const key = dateBucketLabel(n.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return Array.from(map.entries());
  }, [visible]);

  const markAsRead = useCallback(async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n)),
    );

    await fetch("/api/parent/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId }),
    });
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    );

    await fetch("/api/parent/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
  }, []);

  const FILTER_LABELS: Record<PageFilter, string> = {
    ALL: "All",
    UNREAD: "Unread",
    KIOSK: "Kiosk",
    GATE: "Gate",
    LIBRARY: "Library",
    BLOCKED: "Blocked",
  };

  return (
    <div className="app-shell space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-950/40">
            <Bell className="h-4.5 w-4.5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Notifications</h1>
            <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="gap-1 text-xs text-orange-700 hover:bg-orange-50 hover:text-orange-800 dark:text-orange-400 dark:hover:bg-orange-950/20"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Mark all read
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 rounded-xl border-border/50 bg-card/80 pl-8 text-sm shadow-sm"
          placeholder="Search notifications..."
        />
      </div>

      {/* Filters */}
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {(Object.keys(FILTER_LABELS) as PageFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            className={cn(
              "shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors",
              filter === key
                ? "bg-orange-600 text-white shadow-sm"
                : "bg-card/80 text-muted-foreground hover:bg-card hover:text-foreground",
            )}
            onClick={() => setFilter(key)}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {!loading && grouped.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 text-center">
          <Bell className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-xs text-muted-foreground">No notifications match your filters</p>
        </div>
      )}

      {!loading &&
        grouped.map(([label, entries]) => (
          <div key={label} className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-orange-600/80 dark:text-orange-400/60 pl-1">{label}</p>
            <div className="space-y-1">
              {entries.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markAsRead(n.id)}
                  className={cn(
                    "w-full text-left rounded-xl px-3 py-2.5 transition-colors",
                    n.readAt
                      ? "bg-card/40 hover:bg-card/70"
                      : "bg-orange-50/60 hover:bg-orange-50 dark:bg-orange-950/10 dark:hover:bg-orange-950/20",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm leading-tight", !n.readAt && "font-semibold")}>{n.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground/70">
                        {n.childName}
                        {n.childGrNumber ? ` · GR ${n.childGrNumber}` : ""}
                        {" · "}
                        {new Date(n.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    {!n.readAt && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
