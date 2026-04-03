"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { IndianRupee, CheckCircle2, AlertCircle, CreditCard, Landmark, ChevronLeft } from "lucide-react";
import {
  IoRestaurant,
  IoCart,
  IoBook,
  IoWallet,
  IoReceipt,
  IoShieldCheckmark,
  IoSparkles,
  IoNotifications,
  IoReader,
  IoCalendar,
  IoDocumentText,
  IoClipboard,
  IoTicket,
} from "react-icons/io5";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { CerteWordmark } from "@/components/certe-logo";
import { ParentNotificationBell } from "@/components/parent-notification-bell";
import { CanteenSelector } from "@/components/canteen-selector";
import { motion, BottomSheet } from "@/components/ui/motion";
import { usePersistedSelection } from "@/lib/use-persisted-selection";
import { useRealtimeData } from "@/lib/events";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type ParentMode = "canteen" | "library" | "content";
type WalletSnapshot = {
  childId: string;
  childName: string;
  parentName?: string | null;
  balance: number;
};

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | Date | null;
  createdAt: string | Date;
  childName: string;
  childGrNumber: string | null;
};

type NoticeItem = {
  id: string;
  title: string;
  message: string;
  targetType: string;
  createdAt: string | Date;
  acknowledged: boolean;
};

type PaymentEventItem = {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  dueDate: string | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  kioskMode: boolean;
  paymentAccountId: string | null;
  paymentAccountLabel: string | null;
  paymentAccountMethod: string | null;
  paymentAccountUpiId: string | null;
  paymentAccountHolderName: string | null;
  paymentAccountNumber: string | null;
  paymentAccountIfsc: string | null;
  paymentAccountBankName: string | null;
  children: Array<{ id: string; name: string; grNumber: string | null; paid: boolean; receipt: { receiptNumber: string } | null }>;
};

type ReceiptItem = {
  id: string;
  eventId: string;
  paymentMode: string;
  amount: number;
  receiptNumber: string;
  paidAt: string;
};

function getParentMode(pathname: string, requestedMode: string | null): ParentMode {
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/content") || pathname.startsWith("/assignments") || pathname.startsWith("/calendar")) return "content";
  if (
    pathname === "/menu" ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/pre-orders") ||
    pathname === "/cart"
  ) {
    return "canteen";
  }
  if (requestedMode === "library" || requestedMode === "canteen" || requestedMode === "content") {
    return requestedMode;
  }
  return "canteen";
}

function getActiveTab(pathname: string, searchParams?: URLSearchParams): string {
  if (pathname === "/library-showcase") return "showcase";
  if (pathname.startsWith("/library-reader")) return "reader";
  if (["/settings", "/children", "/wallet", "/notifications", "/messaging-settings"].includes(pathname)) {
    return "settings";
  }
  if (pathname === "/controls") return "controls";
  if (pathname === "/calendar" || pathname.startsWith("/calendar/")) return "calendar";
  if (pathname === "/orders") return "orders";
  if (pathname === "/pre-orders") return "preorders";
  if (pathname === "/cart") return "cart";
  if (pathname === "/assignments" || pathname.startsWith("/assignments/")) {
    const type = searchParams?.get("type");
    if (type === "NOTE") return "notes";
    return "feed";
  }
  if (pathname === "/content") return "home";
  if (pathname === "/content/new") return "new";
  if (pathname.startsWith("/content/") && pathname.endsWith("/submissions")) return "home";
  if (pathname.startsWith("/content/")) return "home";
  if (pathname === "/library-history") return "home";
  return "home";
}

function ParentLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const cartItems = useCartStore((s) => s.items);
  const cartCount = useCartStore((s) => s.getItemCount());
  const clearCart = useCartStore((s) => s.clearCart);

  const [overdueCount, setOverdueCount] = useState(0);
  const certePlusActive = useCertePlusStore((s) => s.status?.active === true);
  const ensureCertePlusFresh = useCertePlusStore((s) => s.ensureFresh);

  const [mounted, setMounted] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [cartBounce, setCartBounce] = useState(false);
  const [showControlsSheet, setShowControlsSheet] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [walletDrawerOpen, setWalletDrawerOpen] = useState(false);
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [paymentsDrawerOpen, setPaymentsDrawerOpen] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentEvents, setPaymentEvents] = useState<PaymentEventItem[]>([]);
  const [paymentReceipts, setPaymentReceipts] = useState<ReceiptItem[]>([]);
  const [selectedPaymentEvent, setSelectedPaymentEvent] = useState<PaymentEventItem | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  const [wallets, setWallets] = useState<WalletSnapshot[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [notifItems, setNotifItems] = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [noticeItems, setNoticeItems] = useState<NoticeItem[]>([]);
  const [activeNotice, setActiveNotice] = useState<NoticeItem | null>(null);
  const [pendingEventsCount, setPendingEventsCount] = useState(0);
  const { value: selectedCanteen, setValue: setSelectedCanteen } = usePersistedSelection(
    "certe:selected-canteen-id",
  );
  const { value: selectedLibrary, setValue: setSelectedLibrary } = usePersistedSelection(
    "certe:selected-library-id",
  );
  const prevCartCount = useRef(cartCount);
  const headerRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const requestedMode = searchParams.get("mode");
  const parentMode = getParentMode(pathname, requestedMode);
  const activeTab = getActiveTab(pathname, searchParams);
  const activeModeLabel = parentMode === "canteen"
    ? "Canteen"
    : parentMode === "library"
      ? "Library"
      : "Notes";
  const showHeaderContextSelector = false; // canteen selector moved into MenuClient

  const withParentMode = useCallback(
    (href: string) => {
      const separator = href.includes("?") ? "&" : "?";
      return `${href}${separator}mode=${parentMode}`;
    },
    [parentMode],
  );

  const cartTotal = useMemo(
    () =>
      cartItems.reduce(
        (total, item) => total + (item.discountedPrice ?? item.price) * item.quantity,
        0,
      ),
    [cartItems],
  );

  const totalWalletBalance = useMemo(
    () => wallets.reduce((sum, wallet) => sum + wallet.balance, 0),
    [wallets],
  );
  const walletOwnerName = useMemo(
    () => wallets[0]?.parentName?.trim() || session?.user?.name || "Parent",
    [session?.user?.name, wallets],
  );

  const fetchWallets = useCallback(async () => {
    setWalletsLoading(true);
    setWalletError(null);
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load wallet balances");
      }
      const data = (await res.json()) as WalletSnapshot[];
      setWallets(data ?? []);
    } catch (error) {
      setWalletError(
        error instanceof Error ? error.message : "Failed to load wallet balances",
      );
    } finally {
      setWalletsLoading(false);
    }
  }, []);

  const blurFocusedElement = useCallback(() => {
    if (typeof document === "undefined") return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const res = await fetch("/api/parent/notifications?limit=30", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: NotificationItem[] };
      setNotifItems(data.notifications ?? []);
    } finally {
      setNotifLoading(false);
    }
  }, []);

  const fetchNotices = useCallback(async () => {
    try {
      const res = await fetch("/api/parent/notices", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notices: NoticeItem[] };
      setNoticeItems(data.notices ?? []);
    } catch {
      // silently ignore
    }
  }, []);

  const fetchPaymentEventsCount = useCallback(async () => {
    try {
      const res = await fetch("/api/parent/payment-events", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as { events: Array<{ status: string; children: Array<{ paid: boolean }> }> };
      const pending = (data.events ?? []).filter(
        (e) => e.status === "ACTIVE" && e.children.some((c: { paid: boolean }) => !c.paid),
      ).length;
      setPendingEventsCount(pending);
    } catch {
      // silently ignore
    }
  }, []);

  /** Fetch notifications first, then open the drawer once loaded */
  const openNotificationDrawer = useCallback(async () => {
    blurFocusedElement();
    setNotifLoading(true);
    try {
      const [notifRes, noticeRes] = await Promise.all([
        fetch("/api/parent/notifications?limit=30", { cache: "no-store" }),
        fetch("/api/parent/notices", { cache: "no-store" }),
      ]);
      if (notifRes.ok) {
        const data = (await notifRes.json()) as { notifications: NotificationItem[] };
        setNotifItems(data.notifications ?? []);
      }
      if (noticeRes.ok) {
        const data = (await noticeRes.json()) as { notices: NoticeItem[] };
        setNoticeItems(data.notices ?? []);
      }
    } finally {
      setNotifLoading(false);
      setNotificationDrawerOpen(true);
    }
  }, [blurFocusedElement]);

  const openPaymentsDrawer = useCallback(async () => {
    blurFocusedElement();
    setPaymentsDrawerOpen(true);
    setPaymentsLoading(true);
    try {
      const res = await fetch("/api/parent/payment-events", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as { events: PaymentEventItem[]; receipts: ReceiptItem[] };
      setPaymentEvents(data.events ?? []);
      setPaymentReceipts(data.receipts ?? []);
      const pending = (data.events ?? []).filter(
        (e) => e.status === "ACTIVE" && e.children.some((c) => !c.paid),
      ).length;
      setPendingEventsCount(pending);
    } finally {
      setPaymentsLoading(false);
    }
  }, [blurFocusedElement]);

  const getNotifRoute = useCallback((type: string): string => {
    if (type.startsWith("ORDER") || type === "KIOSK_ORDER_GIVEN" || type === "KIOSK_ORDER_PICKED") return "/orders";
    if (type.startsWith("WALLET") || type === "WALLET_TOPUP") return "/wallet?mode=canteen";
    if (type.startsWith("PRE_ORDER")) return "/pre-orders";
    if (type.startsWith("GATE") || type === "GATE_ENTRY" || type === "GATE_EXIT") return "/notifications?mode=canteen";
    if (type.startsWith("ATTENDANCE")) return "/notifications?mode=canteen";
    if (type.startsWith("LIBRARY")) return "/library-history";
    return "/notifications?mode=canteen";
  }, []);

  const markNotifAsRead = useCallback(async (notificationId: string, type?: string) => {
    setNotifItems((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    await fetch("/api/parent/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId }),
    });
    if (type) {
      setNotificationDrawerOpen(false);
      router.push(getNotifRoute(type));
    }
  }, [getNotifRoute, router]);

  const markAllNotifsRead = useCallback(async () => {
    setNotifItems((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    );
    await fetch("/api/parent/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
  }, []);

  const acknowledgeNotice = useCallback(async (noticeId: string) => {
    setNoticeItems((prev) =>
      prev.map((n) => (n.id === noticeId ? { ...n, acknowledged: true } : n)),
    );
    setActiveNotice(null);
    await fetch("/api/parent/notices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noticeId }),
    });
  }, []);

  const notifUnreadCount = useMemo(
    () =>
      notifItems.filter((n) => !n.readAt).length +
      noticeItems.filter((n) => !n.acknowledged).length,
    [notifItems, noticeItems],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Track header + tabs height for sticky offset CSS vars
  useEffect(() => {
    const setVars = () => {
      const hH = headerRef.current?.offsetHeight ?? 0;
      const tH = tabsRef.current?.offsetHeight ?? 0;
      document.documentElement.style.setProperty("--header-h", `${hH}px`);
      document.documentElement.style.setProperty("--tabs-h", `${tH}px`);
    };
    const ro = new ResizeObserver(setVars);
    if (headerRef.current) ro.observe(headerRef.current);
    if (tabsRef.current) ro.observe(tabsRef.current);
    setVars();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScroll = () => {
      setHeaderCollapsed(window.scrollY > 28);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (cartCount > prevCartCount.current) {
      setCartBounce(true);
      const timer = setTimeout(() => setCartBounce(false), 360);
      prevCartCount.current = cartCount;
      return () => clearTimeout(timer);
    }
    prevCartCount.current = cartCount;
  }, [cartCount]);

  useEffect(() => {
    fetch("/api/library/history")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.overdueCount) setOverdueCount(data.overdueCount);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void ensureCertePlusFresh(45_000);
  }, [ensureCertePlusFresh]);

  // Fetch initial notification count so bell badge is accurate on mount
  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  // Fetch notices on mount for badge count
  useEffect(() => {
    void fetchNotices();
  }, [fetchNotices]);

  // Refresh notices when management sends a new one
  useRealtimeData(fetchNotices, "notice-updated");

  // Fetch pending payment events count on mount
  useEffect(() => {
    void fetchPaymentEventsCount();
  }, [fetchPaymentEventsCount]);

  // Refresh payment events count via SSE
  useRealtimeData(fetchPaymentEventsCount, "payment-event");

  // Keep header balance chip populated even when wallet icon is removed
  useEffect(() => {
    void fetchWallets();
  }, [fetchWallets]);

  useEffect(() => {
    if (!walletDrawerOpen) return;
    void fetchWallets();
  }, [fetchWallets, walletDrawerOpen]);

  // Auto-refresh wallet balance when orders/payments change via SSE
  useRealtimeData(fetchWallets, "orders-updated");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mediaQuery.matches);
    sync();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", sync);
      return () => mediaQuery.removeEventListener("change", sync);
    }

    mediaQuery.addListener(sync);
    return () => mediaQuery.removeListener(sync);
  }, []);

  useEffect(() => {
    setCartDrawerOpen(false);
    setWalletDrawerOpen(false);
    setNotificationDrawerOpen(false);
  }, [pathname]);

  const getInitials = (name?: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  type TabItem = {
    key: string;
    href: string;
    icon: React.ElementType | null;
    label: string;
    locked: boolean;
    isProfile?: boolean;
  };

  const renderPaymentEventDetail = (event: PaymentEventItem) => (
    <div className="space-y-4">
      {event.description && (
        <p className="text-sm text-muted-foreground">{event.description}</p>
      )}
      <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">Amount per child</p>
          <p className="text-2xl font-bold flex items-center gap-1">
            <IndianRupee className="h-5 w-5" />
            {event.amount.toFixed(2)}
          </p>
        </div>
        {event.dueDate && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Due date</p>
            <p className={cn("text-sm font-semibold", new Date(event.dueDate) < new Date() && !event.children.every(c => c.paid) ? "text-destructive" : "")}>
              {new Date(event.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        )}
      </div>

      {event.paymentAccountId && (
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pay To</p>
          <div className="flex items-center gap-2">
            {event.paymentAccountMethod === "UPI"
              ? <CreditCard className="h-5 w-5 text-violet-500" />
              : <Landmark className="h-5 w-5 text-blue-500" />}
            <p className="font-semibold text-sm">{event.paymentAccountLabel}</p>
          </div>
          {event.paymentAccountMethod === "UPI" && event.paymentAccountUpiId && (
            <p className="text-sm font-mono bg-muted/50 rounded-lg px-3 py-2">{event.paymentAccountUpiId}</p>
          )}
          {event.paymentAccountMethod === "BANK_ACCOUNT" && (
            <div className="space-y-1 text-sm">
              {event.paymentAccountHolderName && <div className="flex justify-between"><span className="text-muted-foreground">Account Holder</span><span className="font-medium">{event.paymentAccountHolderName}</span></div>}
              {event.paymentAccountNumber && <div className="flex justify-between"><span className="text-muted-foreground">Account No.</span><span className="font-mono font-medium">{event.paymentAccountNumber}</span></div>}
              {event.paymentAccountIfsc && <div className="flex justify-between"><span className="text-muted-foreground">IFSC</span><span className="font-mono font-medium">{event.paymentAccountIfsc}</span></div>}
              {event.paymentAccountBankName && <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span className="font-medium">{event.paymentAccountBankName}</span></div>}
            </div>
          )}
        </div>
      )}

      {event.kioskMode && (
        <div className="rounded-xl border border-dashed p-3 text-sm text-center text-muted-foreground">
          Collected at school via kiosk tap.
        </div>
      )}

      {event.children.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Children</p>
          {event.children.map((c) => (
            <div key={c.id} className={cn(
              "flex items-center justify-between rounded-xl px-3 py-2.5 border",
              c.paid ? "bg-green-50/70 border-green-200 dark:bg-green-950/20 dark:border-green-800/40" : "bg-card border-border",
            )}>
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                {c.grNumber && <p className="text-xs text-muted-foreground">GR: {c.grNumber}</p>}
              </div>
              {c.paid ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                  {c.receipt && <span className="text-[10px] text-muted-foreground ml-1">{c.receipt.receiptNumber}</span>}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">Pending</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPaymentEventList = () => {
    const activeEvents = paymentEvents.filter((e) => e.status === "ACTIVE");
    const pastEvents = paymentEvents.filter((e) => e.status !== "ACTIVE");

    if (paymentEvents.length === 0 && paymentReceipts.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <IoCalendar className="mx-auto h-6 w-6 text-muted-foreground/30" />
          <p className="mt-1.5 text-xs text-muted-foreground">No payment events yet</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {activeEvents.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Pending</p>
            {activeEvents.map((event) => {
              const overdue = event.dueDate ? new Date(event.dueDate) < new Date() : false;
              const paid = event.children.every((c) => c.paid);
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setSelectedPaymentEvent(event)}
                  className={cn(
                    "w-full text-left rounded-2xl border p-3.5 transition-all hover:border-primary/30",
                    overdue && !paid ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-card/70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{event.title}</p>
                      {event.description && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{event.description}</p>}
                      {event.dueDate && (
                        <p className={cn("text-[11px] mt-1", overdue && !paid ? "text-destructive font-medium" : "text-muted-foreground")}>
                          Due {new Date(event.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          {overdue && !paid && " · Overdue"}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn("text-lg font-bold", paid ? "text-green-600 dark:text-green-400" : "")}>₹{event.amount.toFixed(0)}</p>
                      {paid && <span className="text-[10px] text-green-600 font-medium flex items-center gap-0.5 justify-end"><CheckCircle2 className="h-3 w-3" />Paid</span>}
                      {!paid && overdue && <AlertCircle className="h-4 w-4 text-destructive ml-auto" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {pastEvents.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">History</p>
            {pastEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => setSelectedPaymentEvent(event)}
                className="w-full text-left rounded-2xl border border-border/40 bg-card/50 p-3.5 transition-all hover:border-primary/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium truncate">{event.title}</p>
                  <p className="text-sm font-semibold text-muted-foreground shrink-0">₹{event.amount.toFixed(0)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderNotificationList = () => (
    <>
      {notifLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground">
          Loading notifications...
        </div>
      ) : noticeItems.length === 0 && notifItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <IoNotifications className="mx-auto h-6 w-6 text-muted-foreground/30" />
          <p className="mt-1.5 text-xs text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Management notices – shown first with premium styling */}
          {noticeItems.map((n) => (
            <div
              key={n.id}
              className={cn(
                "rounded-xl border px-3 py-2.5 transition-colors",
                n.acknowledged
                  ? "border-border/40 bg-card/50"
                  : "border-violet-200 bg-violet-50/70 dark:border-violet-800/50 dark:bg-violet-950/20",
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm leading-tight", !n.acknowledged && "font-semibold text-violet-900 dark:text-violet-100")}>
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{n.message}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveNotice(n)}
                      className="text-[11px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 underline-offset-2 hover:underline"
                    >
                      Open to view full
                    </button>
                    <span className="text-[10px] text-muted-foreground/60">
                      · {new Date(n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
                {!n.acknowledged && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" />
                )}
              </div>
            </div>
          ))}
          {/* Regular notifications */}
          {notifItems.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => void markNotifAsRead(n.id, n.type)}
              className={cn(
                "w-full text-left rounded-xl px-3 py-2.5 transition-colors",
                n.readAt
                  ? "hover:bg-card/70"
                  : "bg-orange-50/60 hover:bg-orange-50 dark:bg-orange-950/10 dark:hover:bg-orange-950/20",
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm leading-tight", !n.readAt && "font-semibold")}>{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                    {n.childName} · {new Date(n.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {!n.readAt && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );

  const tabs: TabItem[] = useMemo(() => {
    if (parentMode === "content") {
      return [
        { key: "feed" as const, href: "/assignments?type=ASSIGNMENT", icon: IoClipboard, label: "Assignments", locked: false },
        { key: "notes" as const, href: "/assignments?type=NOTE", icon: IoDocumentText, label: "Notes", locked: false },
        { key: "calendar" as const, href: "/calendar", icon: IoCalendar, label: "Calendar", locked: false },
        { key: "settings" as const, href: withParentMode("/settings"), icon: null, label: "Me", locked: false, isProfile: true },
      ];
    }
    if (parentMode === "canteen") {
      return [
        { key: "home" as const, href: "/menu", icon: IoRestaurant, label: "Menu", locked: false },
        { key: "orders" as const, href: "/orders", icon: IoReceipt, label: "Orders", locked: false },
        { key: "preorders" as const, href: "/pre-orders", icon: IoTicket, label: "Pass", locked: false },
        { key: "settings" as const, href: withParentMode("/settings"), icon: null, label: "Me", locked: false, isProfile: true },
      ];
    }
    return [
      { key: "showcase" as const, href: "/library-showcase", icon: IoSparkles, label: "Showcase", locked: false },
      { key: "reader" as const, href: "/library-reader", icon: IoReader, label: "Reader", locked: false },
      { key: "home" as const, href: "/library-history", icon: IoBook, label: "History", locked: false },
      { key: "settings" as const, href: withParentMode("/settings"), icon: null, label: "Me", locked: false, isProfile: true },
    ];
  }, [certePlusActive, parentMode, withParentMode]);

  return (
    <>
      <header ref={headerRef} className="sticky top-0 z-50 w-full bg-[#f59e0b] dark:bg-[#b45309]">
        <div className="mx-auto w-full max-w-6xl px-3 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-6">
          {/* Top row: Certe branding + actions */}
          <div className={cn(
            "flex items-center justify-between gap-3 transition-all duration-200",
            headerCollapsed ? "py-1.5" : "pb-2",
          )}>
            <div className="flex min-w-0 items-center gap-1">
              <div className="relative h-8 min-w-[132px]">
                <motion.div
                  className="absolute inset-0 flex items-center"
                  animate={{ opacity: headerCollapsed ? 0 : 1, y: headerCollapsed ? -6 : 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <CerteWordmark className="text-[1.85rem]" white showPlus={certePlusActive} />
                </motion.div>
                <motion.span
                  className="absolute inset-0 flex items-center text-[1.5rem] font-sans font-black tracking-[-0.06em] text-white"
                  animate={{ opacity: headerCollapsed ? 1 : 0, y: headerCollapsed ? 0 : 6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {activeModeLabel}
                </motion.span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <div className="flex items-center gap-0.5 rounded-xl border border-white/20 bg-white/20 px-1 py-1 shadow-sm backdrop-blur-sm">
                <ParentNotificationBell
                  parentId={session?.user?.id}
                  externalUnreadCount={notifUnreadCount}
                  onClick={() => void openNotificationDrawer()}
                  className="h-9 w-9 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => void openPaymentsDrawer()}
                  aria-label="Payments"
                  className="group relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/15"
                >
                  <IoCalendar className="h-4.5 w-4.5 transition-transform duration-200 group-hover:scale-110" />
                  {pendingEventsCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground ring-2 ring-background animate-in zoom-in-75 duration-300">
                      {pendingEventsCount > 9 ? "9+" : pendingEventsCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { blurFocusedElement(); setWalletDrawerOpen(true); }}
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/15"
                  aria-label="Wallet"
                >
                  <IoWallet className="h-4.5 w-4.5" />
                </button>
                {parentMode === "canteen" && (
                  <button
                    type="button"
                    onClick={() => { blurFocusedElement(); setCartDrawerOpen(true); }}
                    className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/15"
                    aria-label="Cart"
                  >
                    <IoCart className={cn("h-4.5 w-4.5", cartBounce && "animate-bounce")} />
                    {mounted && cartCount > 0 && (
                      <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-0.5 text-[9px] font-bold text-amber-700">
                        {cartCount > 9 ? "9+" : cartCount}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>
      </header>

      {/* Mode tabs — sticky below header */}
      <div
        ref={tabsRef}
        className="sticky z-40 w-full bg-[#f59e0b] dark:bg-[#b45309]"
        style={{ top: "var(--header-h, 60px)" } as React.CSSProperties}
      >
        <div className="mx-auto w-full max-w-6xl px-3 md:px-6">
          <div className="relative flex w-full items-end">
            {[
              { mode: "canteen" as ParentMode, href: "/menu", icon: IoRestaurant, label: "Canteen", badge: 0 },
              { mode: "library" as ParentMode, href: "/library-showcase", icon: IoBook, label: "Library", badge: overdueCount },
              { mode: "content" as ParentMode, href: "/assignments", icon: IoDocumentText, label: "Notes", badge: 0 },
            ].map((tab) => {
              const isActive = parentMode === tab.mode;
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.mode}
                  href={tab.href}
                  className={cn(
                    "relative flex flex-1 flex-col items-center gap-0.5 rounded-t-2xl px-5 py-2.5 transition-all duration-200",
                    isActive
                      ? "bg-background dark:bg-background z-10"
                      : "bg-transparent hover:bg-white/20 dark:hover:bg-white/10 text-white/70",
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="mode-tab-bg"
                      className="absolute inset-0 rounded-t-2xl bg-background"
                      transition={{ type: "tween", duration: 0.12, ease: "easeInOut" }}
                    />
                  )}
                  <Icon className={cn(
                    "relative z-10 h-6 w-6",
                    isActive ? "text-[#d4891a]" : "text-white/80",
                  )} />
                  <span className={cn(
                    "relative z-10 text-[11px] font-semibold leading-none",
                    isActive ? "text-foreground" : "text-white/80",
                  )}>
                    {tab.label}
                  </span>
                  {tab.badge > 0 && (
                    <span className="absolute right-2 top-1.5 z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
                      {tab.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Context selector row - canteen mode only, below tabs */}
      {showHeaderContextSelector && (
        <div className="w-full bg-background px-3 py-2 md:px-6">
          <div className="mx-auto flex max-w-6xl items-center gap-2">
            <CanteenSelector
              value={selectedCanteen}
              onChange={setSelectedCanteen}
              showAll={false}
              includeInactive
              compact
              className="w-[180px] sm:w-[220px]"
            />
          </div>
        </div>
      )}

      <div className="app-mobile-safe-bottom pb-28">
        {children}
      </div>

      {/* Gradient dim behind bottom nav */}
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 h-36 bg-gradient-to-t from-background/90 via-background/60 to-transparent" />

      <nav className="fixed bottom-3 left-0 right-0 z-50 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex items-end justify-center gap-4 px-3">
          {/* iOS-style compact tab bar */}
          <div className={cn(
            "w-70 h-16 flex items-stretch justify-between rounded-[72px] border border-white/20 px-1.5 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.1)]",
            "bg-background/70 backdrop-blur-2xl backdrop-saturate-[1.8]",
            "dark:border-white/[0.08] dark:bg-background/50 dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]",
          )}>
            {tabs.filter(item => !item.isProfile).map((tab) => {
              const isActive = activeTab === tab.key;
              const Icon = tab.icon;

              const handleClick = (e: React.MouseEvent) => {
                if (tab.locked) {
                  e.preventDefault();
                  setShowControlsSheet(true);
                }
              };

              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  onClick={handleClick}
                  className="relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-5 py-1.5"
                >
                  {isActive && (
                    <motion.div
                      layoutId="tab-pill"
                      className="absolute inset-0 rounded-4xl bg-primary/10 dark:bg-primary/20"
                      transition={{ type: "tween", duration: 0.12, ease: "easeInOut" }}
                    />)
                  }
                  <motion.div
                    whileTap={{ scale: 0.85 }}
                    className="relative z-10 flex flex-col items-center gap-0.5"
                  >
                    {Icon ? (
                      <Icon
                        className={cn(
                          "h-[20px] w-[20px] transition-colors duration-200",
                          isActive ? "text-primary" : "text-muted-foreground/70",
                          tab.key === "cart" && cartBounce && "animate-bounce",
                        )}
                      />
                    ) : null}
                    <span className={cn(
                      "text-[10px] font-medium leading-none transition-colors duration-200",
                      isActive ? "text-primary" : "text-muted-foreground/70",
                    )}>
                      {tab.label}
                    </span>
                  </motion.div>

                  {tab.key === "home" && parentMode === "library" && overdueCount > 0 && (
                    <span className="absolute right-1 top-0 z-20 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[8px] font-bold text-white">
                      {overdueCount}
                    </span>
                  )}

                  {tab.key === "cart" && mounted && cartCount > 0 && (
                    <span className="absolute right-1 top-0 z-20 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-bold text-primary-foreground">
                      {cartCount}
                    </span>
                  )}

                  {tab.key === "controls" && tab.locked && (
                    <span className="absolute right-1 top-0 z-20 rounded-full bg-primary px-1 py-0.5 text-[7px] font-bold leading-none text-primary-foreground">
                      +
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Separated profile circle button */}
          {(() => {
            const profileTab = tabs.find(item => item.isProfile);
            if (!profileTab) return null;
            const isActive = activeTab === profileTab.key;
            return (
              <Link
                href={profileTab.href}
                className={cn(
                  "relative bottom-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.1)]",
                  "bg-background/70 backdrop-blur-2xl backdrop-saturate-[1.8]",
                  "dark:border-white/[0.08] dark:bg-background/50 dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]",
                  isActive && "ring-2 ring-primary/40",
                )}
              >
                <motion.div whileTap={{ scale: 0.85 }}>
                  <Avatar className={cn(
                    "h-12 w-12 ring-1 transition-all duration-200",
                    isActive ? "ring-primary/40" : "ring-primary/20",
                  )}>
                    <AvatarFallback className={cn(
                      "text-[10px] font-bold transition-colors duration-200",
                      isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/90",
                    )}>
                      {mounted ? getInitials(session?.user?.name) : "?"}
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
              </Link>
            );
          })()}
        </div>
      </nav>

      {isMobile ? (
        <>
          <BottomSheet
            open={cartDrawerOpen}
            onClose={() => setCartDrawerOpen(false)}
            snapPoints={[88]}
            bare
          >
            <div className="flex h-full flex-col">
              <div className="space-y-1 border-b border-border/60 px-5 py-3">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <IoCart className="h-4 w-4 text-primary" />
                  Cart
                </h3>
                <p className="text-sm text-muted-foreground">
                  {cartCount > 0
                    ? `${cartCount} item${cartCount > 1 ? "s" : ""} ready for checkout`
                    : "Your cart is empty. Add something from the menu."}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {cartItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No items yet. Tap Menu to start an order.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cartItems.map((item) => {
                      const lineTotal =
                        (item.discountedPrice ?? item.price) * item.quantity;
                      return (
                        <div
                          key={item.menuItemId}
                          className="rounded-2xl border border-border/60 bg-card/70 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{item.name}</p>
                              <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                            </div>
                            <p className="text-sm font-semibold">{`INR ${lineTotal.toFixed(2)}`}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2 border-t border-border/60 bg-muted/30 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background px-3 py-2">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <span className="text-sm font-semibold">{`INR ${cartTotal.toFixed(2)}`}</span>
                </div>
                <Button
                  variant="premium"
                  className="w-full"
                  disabled={cartCount === 0}
                  onClick={() => {
                    setCartDrawerOpen(false);
                    void router.push("/cart");
                  }}
                >
                  Open Full Cart
                </Button>
                {cartCount > 0 && (
                  <Button
                    variant="ghost"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={clearCart}
                  >
                    Clear Cart
                  </Button>
                )}
              </div>
            </div>
          </BottomSheet>

          <BottomSheet
            open={walletDrawerOpen}
            onClose={() => setWalletDrawerOpen(false)}
            snapPoints={[84]}
            bare
          >
            <div className="flex h-full flex-col">
              <div className="space-y-1 border-b border-border/60 px-5 py-3">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <IoWallet className="h-4 w-4 text-primary" />
                  Family Wallet
                </h3>
                <p className="text-sm text-muted-foreground">
                  Quick balance snapshot across all child wallets.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {walletsLoading ? (
                  <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground">
                    Loading wallet balances...
                  </div>
                ) : walletError ? (
                  <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                    <p className="text-sm text-destructive">{walletError}</p>
                    <Button variant="outline" size="sm" onClick={() => void fetchWallets()}>
                      Retry
                    </Button>
                  </div>
                ) : wallets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No wallet found yet. Add a child to activate family wallet.
                  </div>
                ) : (
                  <>
                    <div className="mb-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {walletOwnerName}&apos;s Family Balance
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-2xl font-bold">
                        <IndianRupee className="h-5 w-5 text-primary" />
                        {totalWalletBalance.toFixed(2)}
                      </p>
                    </div>

                    <div className="space-y-2">
                      {wallets.map((wallet) => (
                        <div
                          key={wallet.childId}
                          className="rounded-2xl border border-border/60 bg-card/70 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{wallet.childName}</p>
                              <p className="text-xs text-muted-foreground">
                                {walletOwnerName}&apos;s available balance
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-primary">
                              {`INR ${wallet.balance.toFixed(2)}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="border-t border-border/60 bg-muted/30 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Button
                  className="w-full gap-2"
                  variant="premium"
                  onClick={() => {
                    setWalletDrawerOpen(false);
                    void router.push(withParentMode("/wallet"));
                  }}
                >
                  <IoSparkles className="h-4 w-4" />
                  Open Wallet
                </Button>
              </div>
            </div>
          </BottomSheet>

          {/* Notification Drawer (mobile) */}
          <BottomSheet
            open={notificationDrawerOpen}
            onClose={() => setNotificationDrawerOpen(false)}
            snapPoints={[84]}
            bare
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                <div className="space-y-0.5">
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    <IoNotifications className="h-4 w-4 text-orange-500" />
                    Notifications
                  </h3>
                  <p className="text-xs text-muted-foreground">{notifUnreadCount} unread</p>
                </div>
                {notifUnreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                    onClick={() => void markAllNotifsRead()}
                  >
                    Mark all read
                  </Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {renderNotificationList()}
              </div>

              <div className="border-t border-border/60 bg-muted/30 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => {
                    setNotificationDrawerOpen(false);
                    void router.push(withParentMode("/notifications"));
                  }}
                >
                  View All Notifications
                </Button>
              </div>
            </div>
          </BottomSheet>

          {/* Payments Drawer (mobile) */}
          <BottomSheet
            open={paymentsDrawerOpen}
            onClose={() => { setPaymentsDrawerOpen(false); setSelectedPaymentEvent(null); }}
            snapPoints={[88]}
            bare
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
                {selectedPaymentEvent ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedPaymentEvent(null)}
                      className="mr-1 -ml-1 rounded-lg p-1.5 hover:bg-muted transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <h3 className="text-base font-semibold truncate">{selectedPaymentEvent.title}</h3>
                  </>
                ) : (
                  <>
                    <h3 className="flex items-center gap-2 text-base font-semibold">
                      <IoCalendar className="h-4 w-4 text-primary" />
                      Payments
                    </h3>
                    {pendingEventsCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                        {pendingEventsCount}
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {paymentsLoading ? (
                  <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground">
                    Loading payments...
                  </div>
                ) : selectedPaymentEvent ? (
                  renderPaymentEventDetail(selectedPaymentEvent)
                ) : (
                  renderPaymentEventList()
                )}
              </div>

              <div className="border-t border-border/60 bg-muted/30 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => {
                    setPaymentsDrawerOpen(false);
                    setSelectedPaymentEvent(null);
                    void router.push("/events");
                  }}
                >
                  View Full History
                </Button>
              </div>
            </div>
          </BottomSheet>
        </>
      ) : (
        <>
          <Sheet
            open={cartDrawerOpen}
            onOpenChange={(open) => {
              if (open) blurFocusedElement();
              setCartDrawerOpen(open);
            }}
          >
            <SheetContent
              side="right"
              className="w-[92vw] border-l border-white/15 bg-background/95 p-0 backdrop-blur-2xl sm:max-w-md"
            >
              <div className="flex h-full flex-col">
                <SheetHeader className="space-y-1 border-b border-border/60">
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <IoCart className="h-4 w-4 text-primary" />
                    Cart
                  </SheetTitle>
                  <SheetDescription>
                    {cartCount > 0
                      ? `${cartCount} item${cartCount > 1 ? "s" : ""} ready for checkout`
                      : "Your cart is empty. Add something from the menu."}
                  </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-4">
                  {cartItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      No items yet. Tap Menu to start an order.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cartItems.map((item) => {
                        const lineTotal =
                          (item.discountedPrice ?? item.price) * item.quantity;
                        return (
                          <div
                            key={item.menuItemId}
                            className="rounded-2xl border border-border/60 bg-card/70 p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{item.name}</p>
                                <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                              </div>
                              <p className="text-sm font-semibold">{`INR ${lineTotal.toFixed(2)}`}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <SheetFooter className="border-t border-border/60 bg-muted/30">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background px-3 py-2">
                      <span className="text-sm text-muted-foreground">Subtotal</span>
                      <span className="text-sm font-semibold">{`INR ${cartTotal.toFixed(2)}`}</span>
                    </div>
                    <Button
                      variant="premium"
                      className="w-full"
                      disabled={cartCount === 0}
                      onClick={() => {
                        setCartDrawerOpen(false);
                        void router.push("/cart");
                      }}
                    >
                      Open Full Cart
                    </Button>
                    {cartCount > 0 && (
                      <Button
                        variant="ghost"
                        className="w-full text-destructive hover:text-destructive"
                        onClick={clearCart}
                      >
                        Clear Cart
                      </Button>
                    )}
                  </div>
                </SheetFooter>
              </div>
            </SheetContent>
          </Sheet>

          <Sheet
            open={walletDrawerOpen}
            onOpenChange={(open) => {
              if (open) blurFocusedElement();
              setWalletDrawerOpen(open);
            }}
          >
            <SheetContent
              side="right"
              className="w-[92vw] border-l border-white/15 bg-background/95 p-0 backdrop-blur-2xl sm:max-w-md"
            >
              <div className="flex h-full flex-col">
                <SheetHeader className="space-y-1 border-b border-border/60">
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <IoWallet className="h-4 w-4 text-primary" />
                    Family Wallet
                  </SheetTitle>
                  <SheetDescription>
                    Quick balance snapshot across all child wallets.
                  </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-4">
                  {walletsLoading ? (
                    <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground">
                      Loading wallet balances...
                    </div>
                  ) : walletError ? (
                    <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                      <p className="text-sm text-destructive">{walletError}</p>
                      <Button variant="outline" size="sm" onClick={() => void fetchWallets()}>
                        Retry
                      </Button>
                    </div>
                  ) : wallets.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      No wallet found yet. Add a child to activate family wallet.
                    </div>
                  ) : (
                    <>
                    <div className="mb-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          {walletOwnerName}&apos;s Family Balance
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-2xl font-bold">
                          <IndianRupee className="h-5 w-5 text-primary" />
                          {totalWalletBalance.toFixed(2)}
                        </p>
                      </div>

                      <div className="space-y-2">
                        {wallets.map((wallet) => (
                          <div
                            key={wallet.childId}
                            className="rounded-2xl border border-border/60 bg-card/70 p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">{wallet.childName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {walletOwnerName}&apos;s available balance
                                </p>
                              </div>
                              <p className="text-sm font-semibold text-primary">
                                {`INR ${wallet.balance.toFixed(2)}`}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <SheetFooter className="border-t border-border/60 bg-muted/30">
                  <Button
                    className="w-full gap-2"
                    variant="premium"
                    onClick={() => {
                      setWalletDrawerOpen(false);
                      void router.push(withParentMode("/wallet"));
                    }}
                  >
                    <IoSparkles className="h-4 w-4" />
                    Open Wallet
                  </Button>
                </SheetFooter>
              </div>
            </SheetContent>
          </Sheet>

          {/* Notification Drawer (desktop) */}
          <Sheet
            open={notificationDrawerOpen}
            onOpenChange={(open) => {
              if (open) blurFocusedElement();
              setNotificationDrawerOpen(open);
            }}
          >
            <SheetContent
              side="right"
              className="w-[92vw] border-l border-white/15 bg-background/95 p-0 backdrop-blur-2xl sm:max-w-md"
            >
              <div className="flex h-full flex-col">
                <SheetHeader className="space-y-1 border-b border-border/60">
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <IoNotifications className="h-4 w-4 text-orange-500" />
                    Notifications
                  </SheetTitle>
                  <SheetDescription>
                    {notifUnreadCount} unread notification{notifUnreadCount !== 1 ? "s" : ""}
                  </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-3">
                  {renderNotificationList()}
                </div>

                <SheetFooter className="border-t border-border/60 bg-muted/30">
                  <div className="space-y-2 w-full">
                    {notifUnreadCount > 0 && (
                      <Button
                        variant="ghost"
                        className="w-full text-xs text-orange-600"
                        onClick={() => void markAllNotifsRead()}
                      >
                        Mark all as read
                      </Button>
                    )}
                    <Button
                      className="w-full gap-2"
                      variant="outline"
                      onClick={() => {
                        setNotificationDrawerOpen(false);
                        void router.push(withParentMode("/notifications"));
                      }}
                    >
                      View All Notifications
                    </Button>
                  </div>
                </SheetFooter>
              </div>
            </SheetContent>
          </Sheet>

          {/* Payments Drawer (desktop) */}
          <Sheet
            open={paymentsDrawerOpen}
            onOpenChange={(open) => {
              if (!open) { setSelectedPaymentEvent(null); }
              if (open) blurFocusedElement();
              setPaymentsDrawerOpen(open);
            }}
          >
            <SheetContent
              side="right"
              className="w-[92vw] border-l border-white/15 bg-background/95 p-0 backdrop-blur-2xl sm:max-w-md"
            >
              <div className="flex h-full flex-col">
                <SheetHeader className="border-b border-border/60">
                  <div className="flex items-center gap-2">
                    {selectedPaymentEvent ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setSelectedPaymentEvent(null)}
                          className="-ml-1 mr-1 rounded-lg p-1.5 hover:bg-muted transition-colors"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <SheetTitle className="text-base font-semibold truncate">{selectedPaymentEvent.title}</SheetTitle>
                      </>
                    ) : (
                      <>
                        <SheetTitle className="flex items-center gap-2 text-base">
                          <IoCalendar className="h-4 w-4 text-primary" />
                          Payments
                        </SheetTitle>
                        {pendingEventsCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                            {pendingEventsCount}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <SheetDescription className="sr-only">
                    {selectedPaymentEvent ? selectedPaymentEvent.title : "School payment events"}
                  </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-4">
                  {paymentsLoading ? (
                    <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground">
                      Loading payments...
                    </div>
                  ) : selectedPaymentEvent ? (
                    renderPaymentEventDetail(selectedPaymentEvent)
                  ) : (
                    renderPaymentEventList()
                  )}
                </div>

                <SheetFooter className="border-t border-border/60 bg-muted/30">
                  <Button
                    className="w-full gap-2"
                    variant="outline"
                    onClick={() => {
                      setPaymentsDrawerOpen(false);
                      setSelectedPaymentEvent(null);
                      void router.push("/events");
                    }}
                  >
                    View Full History
                  </Button>
                </SheetFooter>
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}

      <BottomSheet
        open={showControlsSheet}
        onClose={() => setShowControlsSheet(false)}
      >
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <IoShieldCheckmark className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-bold">Unlock Controls</h3>
            <p className="mt-1 max-w-[280px] text-sm text-muted-foreground">
              Set spend limits and block items with Certe Plus.
            </p>
          </div>
          <Button
            variant="premium"
            size="lg"
            className="w-full max-w-[280px]"
            onClick={() => {
              setShowControlsSheet(false);
              void router.push(withParentMode("/settings"));
            }}
          >
            Upgrade to Certe+
          </Button>
        </div>
      </BottomSheet>

      {/* Notice Detail Dialog */}
      <Dialog open={activeNotice !== null} onOpenChange={(open) => { if (!open) setActiveNotice(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base leading-snug pr-4">
              {activeNotice?.title ?? "Notice"}
            </DialogTitle>
            <DialogDescription className="sr-only">Notice from management</DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 dark:border-violet-900/30 dark:bg-violet-950/20 p-4">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {activeNotice?.message}
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {activeNotice && new Date(activeNotice.createdAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          <DialogFooter>
            {activeNotice && !activeNotice.acknowledged ? (
              <Button
                className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => { if (activeNotice) void acknowledgeNotice(activeNotice.id); }}
              >
                Acknowledge
              </Button>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => setActiveNotice(null)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense>
      <ParentLayoutContent>{children}</ParentLayoutContent>
    </Suspense>
  );
}

