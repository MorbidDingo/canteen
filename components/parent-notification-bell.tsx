"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, X, CheckCheck, Clock, ExternalLink, Inbox, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type BellFilter = "ALL" | "UNREAD" | "KIOSK" | "GATE" | "LIBRARY" | "BLOCKED";

const FILTER_CONFIG: Record<BellFilter, { label: string; color: string; dot: string }> = {
  ALL:     { label: "All",     color: "bg-zinc-800 text-white border-zinc-800",         dot: "bg-zinc-400" },
  UNREAD:  { label: "Unread",  color: "bg-orange-600 text-white border-orange-600",      dot: "bg-orange-500" },
  KIOSK:   { label: "Kiosk",   color: "bg-violet-600 text-white border-violet-600",      dot: "bg-violet-400" },
  GATE:    { label: "Gate",    color: "bg-sky-600 text-white border-sky-600",            dot: "bg-sky-400" },
  LIBRARY: { label: "Library", color: "bg-emerald-600 text-white border-emerald-600",    dot: "bg-emerald-400" },
  BLOCKED: { label: "Blocked", color: "bg-rose-600 text-white border-rose-600",          dot: "bg-rose-400" },
};

const CATEGORY_PILL: Record<Exclude<BellFilter, "ALL" | "UNREAD">, { bg: string; text: string }> = {
  KIOSK:   { bg: "bg-violet-100 dark:bg-violet-950/60", text: "text-violet-700 dark:text-violet-300" },
  GATE:    { bg: "bg-sky-100 dark:bg-sky-950/60",       text: "text-sky-700 dark:text-sky-300" },
  LIBRARY: { bg: "bg-emerald-100 dark:bg-emerald-950/60", text: "text-emerald-700 dark:text-emerald-300" },
  BLOCKED: { bg: "bg-rose-100 dark:bg-rose-950/60",     text: "text-rose-700 dark:text-rose-300" },
};

function getNotificationCategory(type: string): Exclude<BellFilter, "ALL" | "UNREAD"> {
  if (type.startsWith("KIOSK_"))   return "KIOSK";
  if (type.startsWith("GATE_"))    return "GATE";
  if (type.startsWith("LIBRARY_")) return "LIBRARY";
  if (type.startsWith("BLOCKED_")) return "BLOCKED";
  return "LIBRARY";
}

function timeAgo(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ───────────── Shared notification row ───────────── */
function NotificationRow({
  n,
  onRead,
  compact = false,
}: {
  n: ParentNotification;
  onRead: (id: string) => void;
  compact?: boolean;
}) {
  const category = getNotificationCategory(n.type);
  const pill = CATEGORY_PILL[category];
  const isUnread = !n.readAt;

  return (
    <button
      type="button"
      onClick={() => onRead(n.id)}
      className={cn(
        "group w-full text-left transition-colors duration-150",
        compact ? "px-3 py-2.5" : "px-4 py-3.5",
        isUnread
          ? "bg-orange-50/60 dark:bg-orange-950/20 hover:bg-orange-50 dark:hover:bg-orange-950/30"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
        "border-b border-zinc-100 dark:border-zinc-800 last:border-b-0",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Unread dot / read check */}
        <div className="mt-1 shrink-0">
          {isUnread ? (
            <span className="block h-2 w-2 rounded-full bg-orange-500 ring-2 ring-orange-200 dark:ring-orange-900" />
          ) : (
            <span className="block h-2 w-2 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <p className={cn(
              "truncate leading-tight",
              compact ? "text-[13px]" : "text-sm",
              isUnread ? "font-semibold text-zinc-900 dark:text-zinc-100" : "font-medium text-zinc-700 dark:text-zinc-300",
            )}>
              {n.title}
            </p>
            <span className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              pill.bg, pill.text,
            )}>
              {category}
            </span>
          </div>

          <p className={cn(
            "text-zinc-500 dark:text-zinc-400 leading-snug line-clamp-2",
            compact ? "text-[12px]" : "text-xs",
          )}>
            {n.message}
          </p>

          <div className="flex items-center gap-2 pt-0.5">
            {n.childName && (
              <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 truncate">
                {n.childName}
                {n.childGrNumber ? ` · GR ${n.childGrNumber}` : ""}
              </span>
            )}
            <span className="ml-auto flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-600 shrink-0">
              <Clock className="h-3 w-3" />
              {timeAgo(n.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ───────────── Filter strip ───────────── */
function FilterStrip({
  filter,
  setFilter,
  notifications,
  scrollable = false,
}: {
  filter: BellFilter;
  setFilter: (f: BellFilter) => void;
  notifications: ParentNotification[];
  scrollable?: boolean;
}) {
  const counts: Record<BellFilter, number> = useMemo(() => {
    const base = {} as Record<BellFilter, number>;
    base.ALL = notifications.length;
    base.UNREAD = notifications.filter((n) => !n.readAt).length;
    base.KIOSK   = notifications.filter((n) => getNotificationCategory(n.type) === "KIOSK").length;
    base.GATE    = notifications.filter((n) => getNotificationCategory(n.type) === "GATE").length;
    base.LIBRARY = notifications.filter((n) => getNotificationCategory(n.type) === "LIBRARY").length;
    base.BLOCKED = notifications.filter((n) => getNotificationCategory(n.type) === "BLOCKED").length;
    return base;
  }, [notifications]);

  return (
    <div className={cn(
      "flex gap-1.5 py-2",
      scrollable
        ? "px-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        : "px-3 flex-wrap",
    )}>
      {(Object.keys(FILTER_CONFIG) as BellFilter[]).map((key) => {
        const cfg = FILTER_CONFIG[key];
        const active = filter === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all duration-150",
              active
                ? cfg.color
                : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 bg-white dark:bg-zinc-900",
            )}
          >
            {active && <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />}
            {cfg.label}
            {counts[key] > 0 && (
              <span className={cn(
                "rounded-full px-1 text-[10px]",
                active ? "bg-white/25 text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500",
              )}>
                {counts[key]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── Empty state ───────────── */
function EmptyState({ filter, loading }: { filter: BellFilter; loading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      {loading ? (
        <>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="w-full space-y-1.5 rounded-lg border border-zinc-100 dark:border-zinc-800 p-3 animate-pulse">
              <div className="h-3 w-2/3 rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-2.5 w-full rounded bg-zinc-50 dark:bg-zinc-800/50" />
              <div className="h-2 w-1/3 rounded bg-zinc-50 dark:bg-zinc-800/50" />
            </div>
          ))}
        </>
      ) : (
        <>
          <span className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-4">
            <Inbox className="h-7 w-7 text-zinc-400" />
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              {filter === "UNREAD" ? "All caught up!" : "No notifications"}
            </p>
            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
              {filter === "UNREAD"
                ? "No unread messages right now."
                : "Nothing in this category yet."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────── Main component ───────────── */
export function ParentNotificationBell({
  parentId,
  className,
}: {
  parentId?: string;
  className?: string;
}) {
  const [notifications, setNotifications] = useState<ParentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [filter, setFilter] = useState<BellFilter>("ALL");
  const touchStartYRef = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications],
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === "UNREAD") return !n.readAt;
      if (filter === "ALL") return true;
      return getNotificationCategory(n.type) === filter;
    });
  }, [filter, notifications]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/parent/notifications?limit=30", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: ParentNotification[] };
      setNotifications(data.notifications ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!parentId) return;
    fetchNotifications();
  }, [fetchNotifications, parentId]);

  // ── Notification permission (with iOS/iPadOS support) ──
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect iOS/iPadOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone);

    // iOS: notifications only work in PWA standalone mode (Safari 16.4+)
    if (isIOS && !isStandalone) {
      const dismissKey = "ios-pwa-prompt-dismissed";
      if (!window.localStorage.getItem(dismissKey)) {
        const timer = setTimeout(() => setShowIOSPrompt(true), 2000);
        return () => clearTimeout(timer);
      }
      return;
    }

    // Standard browsers & iOS PWA: request notification permission
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    const key = "parent-notification-permission-asked";
    if (window.localStorage.getItem(key) === "1") return;
    const timer = setTimeout(() => {
      Notification.requestPermission().finally(() => window.localStorage.setItem(key, "1"));
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const dismissIOSPrompt = useCallback(() => {
    setShowIOSPrompt(false);
    window.localStorage.setItem("ios-pwa-prompt-dismissed", "1");
  }, []);

  useSSE("parent-notification", (payload) => {
    if (!parentId) return;
    const incoming = payload as IncomingPayload | undefined;
    if (!incoming || incoming.parentId !== parentId) return;

    setNotifications((prev) => {
      const next: ParentNotification[] = [
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
      ].slice(0, 30);
      return next;
    });

    if (typeof window !== "undefined" && Notification.permission === "granted") {
      new Notification(incoming.title, { body: incoming.message });
    }
  });

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

  const handleSheetTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  }, []);

  const handleSheetTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartYRef.current == null) return;
    const currentY = event.touches[0]?.clientY ?? touchStartYRef.current;
    const delta = currentY - touchStartYRef.current;
    setDragOffsetY(delta > 0 ? delta : 0);
  }, []);

  const handleSheetTouchEnd = useCallback(() => {
    if (dragOffsetY > 120) {
      setMobileOpen(false);
    }
    setDragOffsetY(0);
    touchStartYRef.current = null;
  }, [dragOffsetY]);

  useEffect(() => {
    if (!mobileOpen) {
      setDragOffsetY(0);
      touchStartYRef.current = null;
    }
  }, [mobileOpen]);

  /* Bell trigger */
  const bellTrigger = (
    <span className="relative inline-flex">
      <Bell className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
      {unreadCount > 0 && (
        <span className={cn(
          "absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1",
          "bg-orange-500 text-white text-[9px] font-bold leading-none ring-2 ring-background",
          "animate-in zoom-in-75 duration-300",
        )}>
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </span>
  );

  return (
    <>
      {/* ── iOS Add-to-Home-Screen prompt ── */}
      {showIOSPrompt && (
        <Dialog open={showIOSPrompt} onOpenChange={setShowIOSPrompt}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-center text-base">Enable Notifications</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-center text-sm text-muted-foreground">
              <p>
                To receive instant notifications on your device, add this app to your Home Screen:
              </p>
              <ol className="text-left space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                  <span>Tap the <Share aria-hidden="true" className="inline h-4 w-4 align-text-bottom" /> <strong>Share</strong> button in Safari</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                  <span>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                  <span>Open the app from your Home Screen</span>
                </li>
              </ol>
              <p className="text-xs text-muted-foreground/70">
                Push notifications require iOS 16.4 or later.
              </p>
            </div>
            <Button variant="outline" className="w-full mt-2" onClick={dismissIOSPrompt}>
              Got it
            </Button>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Mobile: bottom sheet ── */}
      <div className="md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className={cn("group", className)}
          onClick={() => setMobileOpen(true)}
        >
          {bellTrigger}
        </Button>

        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogContent
            showCloseButton={false}
            className={cn(
              "top-auto left-0 right-0 bottom-0 translate-x-0 translate-y-0",
              "max-w-none w-screen rounded-t-3xl rounded-b-none",
              "border-x-0 border-b-0 p-0 gap-0",
              "h-[90dvh] flex flex-col overflow-hidden",
              "bg-white dark:bg-zinc-950",
              "shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.18)] dark:shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.5)]",
            )}
            style={{
              transform: dragOffsetY > 0 ? `translateY(${dragOffsetY}px)` : undefined,
              transition: dragOffsetY > 0 ? "none" : undefined,
            }}
          >
            {/* Handle */}
            <div
              className="flex justify-center pt-3 pb-1 shrink-0 touch-none"
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
              onTouchCancel={handleSheetTouchEnd}
            >
              <span className="h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700" />
            </div>

            {/* Header */}
            <DialogHeader className="shrink-0 px-4 pb-3 pt-0">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <DialogTitle className="text-[17px] font-bold text-zinc-900 dark:text-zinc-100">
                    Notifications
                  </DialogTitle>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                    {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 gap-1.5 px-3 text-xs font-semibold rounded-full",
                      "text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/40",
                    )}
                    onClick={markAllRead}
                    disabled={unreadCount === 0}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-zinc-400"
                    onClick={() => setMobileOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </DialogHeader>

            {/* Filter strip */}
            <div className="shrink-0 border-y border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/50 backdrop-blur">
              <FilterStrip
                filter={filter}
                setFilter={setFilter}
                notifications={notifications}
                scrollable
              />
            </div>

            {/* Notification list */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {filteredNotifications.length === 0 ? (
                <EmptyState filter={filter} loading={loading} />
              ) : (
                filteredNotifications.map((n) => (
                  <NotificationRow key={n.id} n={n} onRead={markAsRead} />
                ))
              )}
            </div>

            {/* Footer */}
            <div className={cn(
              "shrink-0 border-t border-zinc-100 dark:border-zinc-800 px-4 py-3",
              "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
              "bg-white dark:bg-zinc-950",
            )}>
              <Link
                href="/notifications"
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl py-2.5",
                  "text-sm font-semibold text-orange-600 dark:text-orange-400",
                  "border border-orange-200 dark:border-orange-900 hover:bg-orange-50 dark:hover:bg-orange-950/40",
                  "transition-colors duration-150",
                )}
              >
                <ExternalLink className="h-4 w-4" />
                View full notification history
              </Link>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Desktop: dropdown ── */}
      <div className="hidden md:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className={cn("group", className)}>
              {bellTrigger}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className={cn(
              "w-[380px] p-0 rounded-2xl overflow-hidden",
              "border border-zinc-200 dark:border-zinc-800",
              "bg-white dark:bg-zinc-950",
              "shadow-[0_8px_40px_-8px_rgba(0,0,0,0.18),0_2px_12px_-4px_rgba(0,0,0,0.08)]",
              "dark:shadow-[0_8px_40px_-8px_rgba(0,0,0,0.6)]",
              "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200",
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Notifications</p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  href="/notifications"
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  View all
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-7 gap-1 px-2.5 text-[11px] font-semibold rounded-full",
                    "text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/40",
                  )}
                  onClick={markAllRead}
                  disabled={unreadCount === 0}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all
                </Button>
              </div>
            </div>

            {/* Filter strip */}
            <div className="border-y border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
              <FilterStrip
                filter={filter}
                setFilter={setFilter}
                notifications={notifications}
              />
            </div>

            {/* Notification list */}
            <div className="max-h-[360px] overflow-y-auto overscroll-contain">
              {filteredNotifications.length === 0 ? (
                <EmptyState filter={filter} loading={loading} />
              ) : (
                filteredNotifications.map((n) => (
                  <NotificationRow key={n.id} n={n} onRead={markAsRead} compact />
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
