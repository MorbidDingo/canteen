"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSSE } from "@/lib/events";

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
    year: "numeric",
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

  return (
    <div className="app-shell-compact space-y-4">
      <Card className="border-orange-100">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2 text-orange-900">
                <Bell className="h-5 w-5 text-orange-700" />
                Notifications
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {unreadCount} unread updates about kiosk, gate, library, and blocked attempts.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="w-full border-orange-200 text-orange-800 hover:bg-orange-50 sm:w-auto"
            >
              Mark all read
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              placeholder="Search notifications, child name, or GR number"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(["ALL", "UNREAD", "KIOSK", "GATE", "LIBRARY", "BLOCKED"] as PageFilter[]).map((key) => (
              <Button
                key={key}
                variant={filter === key ? "default" : "outline"}
                size="sm"
                className={filter === key ? "bg-orange-600 hover:bg-orange-700" : ""}
                onClick={() => setFilter(key)}
              >
                {key}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Loading notifications...</p>}
      {!loading && grouped.length === 0 && (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No notifications found for your current filters.
          </CardContent>
        </Card>
      )}

      {!loading &&
        grouped.map(([label, entries]) => (
          <div key={label} className="space-y-2">
            <h2 className="text-xs uppercase tracking-wide text-orange-700 font-semibold">{label}</h2>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {entries.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markAsRead(n.id)}
                    className="w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-orange-50/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{n.title}</p>
                        <p className="text-sm text-zinc-600 mt-0.5">{n.message}</p>
                        <p className="text-xs text-zinc-500 mt-1">
                          {n.childName}
                          {n.childGrNumber ? ` (GR ${n.childGrNumber})` : ""}
                          {" · "}
                          {new Date(n.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      {!n.readAt && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-orange-600" />}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        ))}
    </div>
  );
}
