"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
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

type IncomingPayload = {
  id: string;
  parentId: string;
  childId: string;
  type: string;
  title: string;
  message: string;
  metadata: string | null;
  readAt: string | null;
  createdAt: string;
  childName?: string;
  childGrNumber?: string | null;
};


export function ParentNotificationBell({
  parentId,
  className,
  href,
  onClick,
}: {
  parentId?: string;
  className?: string;
  href?: string;
  onClick?: () => void;
}) {
  const [notifications, setNotifications] = useState<ParentNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications],
  );

  useEffect(() => {
    if (!parentId) return;
    fetch("/api/parent/notifications?limit=30", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { notifications: ParentNotification[] } | null) => {
        if (data?.notifications) setNotifications(data.notifications);
      })
      .finally(() => setLoading(false));
  }, [parentId]);

  useSSE("parent-notification", (payload) => {
    if (!parentId) return;
    const incoming = payload as IncomingPayload | undefined;
    if (!incoming || incoming.parentId !== parentId) return;

    setNotifications((prev) =>
      [
        {
          id: incoming.id,
          type: incoming.type,
          title: incoming.title,
          message: incoming.message,
          metadata: incoming.metadata,
          readAt: incoming.readAt,
          createdAt: incoming.createdAt,
          childId: incoming.childId,
          childName: incoming.childName || "",
          childGrNumber: incoming.childGrNumber ?? null,
        },
        ...prev.filter((n) => n.id !== incoming.id),
      ].slice(0, 30),
    );

    if (typeof window !== "undefined" && Notification.permission === "granted") {
      new Notification(incoming.title, { body: incoming.message });
    }
  });

  const badge = !loading && unreadCount > 0 && (
    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-background animate-in zoom-in-75 duration-300">
      {unreadCount > 9 ? "9+" : unreadCount}
    </span>
  );

  const sharedClassName = cn(
    "group relative inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-accent",
    className,
  );

  // If onClick is provided, render as a button (drawer mode)
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={sharedClassName}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
        {badge}
      </button>
    );
  }

  // Otherwise render as a link (default fallback)
  return (
    <Link
      href={href ?? "/notifications"}
      className={sharedClassName}
      aria-label="Notifications"
    >
      <Bell className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
      {badge}
    </Link>
  );
}