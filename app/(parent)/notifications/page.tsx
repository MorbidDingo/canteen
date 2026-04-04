"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
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

  const grouped = useMemo(() => {
    const map = new Map<string, ParentNotification[]>();
    for (const n of notifications) {
      const key = dateBucketLabel(n.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return Array.from(map.entries());
  }, [notifications]);

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
    <div className="px-5 space-y-6 pt-2 pb-24">
      {/* Mark all read — top right */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {unreadCount} unread
        </p>
        <button
          type="button"
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="text-[13px] font-medium text-primary disabled:text-muted-foreground/40"
        >
          Mark all read
        </button>
      </div>

      {/* Content */}
      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {!loading && grouped.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
          <Bell className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-xs text-muted-foreground">No notifications yet</p>
        </div>
      )}

      {!loading &&
        grouped.map(([label, entries]) => (
          <div key={label} className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">{label}</p>
            <div className="space-y-0">
              {entries.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.readAt && markAsRead(n.id)}
                  className={cn(
                    "w-full text-left flex items-center gap-3 py-3 border-b border-border/30 last:border-0",
                    !n.readAt && "border-l-2 border-l-primary pl-3",
                    n.readAt && "pl-[14px]",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[14px] leading-snug truncate", !n.readAt && "font-semibold")}>{n.title}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {new Date(n.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      {n.childName}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
