"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  IndianRupee,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Landmark,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Store,
  BookOpen,
  MapPin,
  Check,
  ChevronDown,
  Pencil,
} from "lucide-react";
import {
  IoRestaurant,
  IoRestaurantOutline,
  IoCart,
  IoBook,
  IoBookOutline,
  IoWallet,
  IoShieldCheckmark,
  IoSparkles,
  IoSparklesOutline,
  IoNotifications,
  IoCalendar,
  IoDocumentText,
  IoDocumentTextOutline,
  IoChatbubbleEllipses,
  IoSettings,
  IoClose,
} from "react-icons/io5";
import { cn } from "@/lib/utils";
import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  Suspense,
} from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { ParentNotificationBell } from "@/components/parent-notification-bell";
import { motion, BottomSheet } from "@/components/ui/motion";
import {
  ChatAssistant,
  type ChatContext,
} from "@/components/ai/chat-assistant";
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
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { PROFILE_PHOTO_MAX_BYTES } from "@/lib/profile-photo";

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
  children: Array<{
    id: string;
    name: string;
    grNumber: string | null;
    paid: boolean;
    receipt: { receiptNumber: string } | null;
  }>;
};

type ReceiptItem = {
  id: string;
  eventId: string;
  paymentMode: string;
  amount: number;
  receiptNumber: string;
  paidAt: string;
};

function getParentMode(
  pathname: string,
  requestedMode: string | null,
): ParentMode {
  if (pathname.startsWith("/library")) return "library";
  if (
    pathname.startsWith("/content") ||
    pathname.startsWith("/assignments") ||
    pathname.startsWith("/calendar")
  )
    return "content";
  if (
    pathname === "/menu" ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/pre-orders") ||
    pathname === "/cart"
  ) {
    return "canteen";
  }
  if (
    requestedMode === "library" ||
    requestedMode === "canteen" ||
    requestedMode === "content"
  ) {
    return requestedMode;
  }
  return "canteen";
}

function getActiveBottomTab(
  pathname: string,
): "food" | "library" | "notes" | "pass" | "settings" {
  if (
    pathname === "/pre-orders" ||
    pathname.startsWith("/pre-orders/") ||
    pathname === "/certe-pass"
  ) {
    return "pass";
  }
  if (
    pathname === "/menu" ||
    pathname === "/orders" ||
    pathname === "/cart" ||
    pathname.startsWith("/orders/")
  ) {
    return "food";
  }
  if (
    pathname === "/library-showcase" ||
    pathname.startsWith("/library-reader") ||
    pathname === "/library-history"
  ) {
    return "library";
  }
  if (
    pathname === "/assignments" ||
    pathname.startsWith("/assignments/") ||
    pathname === "/calendar" ||
    pathname.startsWith("/calendar/") ||
    pathname === "/content" ||
    pathname.startsWith("/content/")
  ) {
    return "notes";
  }
  return "settings";
}

function getPageTitle(
  pathname: string,
  searchParams?: URLSearchParams,
): string {
  if (pathname === "/menu") return "Menu";
  if (pathname === "/orders") return "Orders";
  if (pathname === "/cart") return "Cart";
  if (pathname === "/pre-orders") return "Pass";
  if (pathname === "/certe-pass") return "Certe Pass";
  if (pathname === "/library-showcase") return "Library";
  if (pathname.startsWith("/library-reader")) return "Reader";
  if (pathname === "/library-history") return "History";
  if (pathname === "/assignments" || pathname.startsWith("/assignments/")) {
    const type = searchParams?.get("type");
    return type === "NOTE" ? "Board" : "Board";
  }
  if (pathname === "/calendar" || pathname.startsWith("/calendar/"))
    return "Calendar";
  if (pathname === "/content") return "Content";
  if (pathname.startsWith("/content/")) return "Content";
  if (pathname === "/settings") return "Settings";
  if (pathname === "/children") return "Members";
  if (pathname === "/wallet") return "Wallet";
  if (pathname === "/controls") return "Controls";
  if (pathname === "/notifications") return "Notifications";
  if (pathname === "/messaging-settings") return "Messages";
  if (pathname === "/timetable") return "Timetable";
  if (pathname === "/events" || pathname.startsWith("/events/"))
    return "Events";
  return "Home";
}

function ParentLayoutContent({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const cartItems = useCartStore((s) => s.items);
  const cartCount = useCartStore((s) => s.getItemCount());
  const clearCart = useCartStore((s) => s.clearCart);

  const [overdueCount, setOverdueCount] = useState(0);
  const certePlusActive = useCertePlusStore((s) => s.status?.active === true);
  const certePlusStatus = useCertePlusStore((s) => s.status);
  const ensureCertePlusFresh = useCertePlusStore((s) => s.ensureFresh);

  const [mounted, setMounted] = useState(false);
  const [cartBounce, setCartBounce] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [showControlsSheet, setShowControlsSheet] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [walletDrawerOpen, setWalletDrawerOpen] = useState(false);
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [paymentsDrawerOpen, setPaymentsDrawerOpen] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentEvents, setPaymentEvents] = useState<PaymentEventItem[]>([]);
  const [paymentReceipts, setPaymentReceipts] = useState<ReceiptItem[]>([]);
  const [selectedPaymentEvent, setSelectedPaymentEvent] =
    useState<PaymentEventItem | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [wallets, setWallets] = useState<WalletSnapshot[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [notifItems, setNotifItems] = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [noticeItems, setNoticeItems] = useState<NoticeItem[]>([]);
  const [activeNotice, setActiveNotice] = useState<NoticeItem | null>(null);
  const [pendingEventsCount, setPendingEventsCount] = useState(0);
  const { value: selectedCanteen, setValue: setSelectedCanteen } =
    usePersistedSelection("certe:selected-canteen-id");
  const { value: selectedLibrary, setValue: setSelectedLibrary } =
    usePersistedSelection("certe:selected-library-id");

  // Venue picker state
  const [venuePickerOpen, setVenuePickerOpen] = useState(false);
  const [canteens, setCanteens] = useState<
    { id: string; name: string; location: string | null }[]
  >([]);
  const [libraries, setLibraries] = useState<
    { id: string; name: string; location: string | null }[]
  >([]);
  const [venuesLoaded, setVenuesLoaded] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profilePhotoPreviewOpen, setProfilePhotoPreviewOpen] = useState(false);

  const prevCartCount = useRef(cartCount);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

  const requestedMode = searchParams.get("mode");
  const parentMode = getParentMode(pathname, requestedMode);
  const bottomTab = getActiveBottomTab(pathname);
  const pageTitle = getPageTitle(pathname, searchParams);
  const showVenueChip =
    pathname === "/menu" || pathname === "/library-showcase";
  const venueType = pathname === "/menu" ? "canteen" : "library";
  const { theme, setTheme } = useTheme();

  const cartTotal = useMemo(
    () =>
      cartItems.reduce(
        (total, item) =>
          total + (item.discountedPrice ?? item.price) * item.quantity,
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
        error instanceof Error
          ? error.message
          : "Failed to load wallet balances",
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

  const handleProfilePhotoInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      toast.error("Photo must be under 5MB");
      return;
    }
    setProfileUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/profile/photo", {
        method: "POST",
        body: formData,
      });
      let data: { imageUrl?: string; error?: string } = {};
      try {
        data = (await res.json()) as { imageUrl?: string; error?: string };
      } catch {
        throw new Error("Unexpected response while uploading photo");
      }
      if (!res.ok || !data.imageUrl) {
        throw new Error(data.error || "Failed to upload photo");
      }
      setProfileImage(data.imageUrl);
      setProfilePhotoPreviewOpen(false);
      toast.success("Profile photo updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload photo");
    } finally {
      setProfileUploading(false);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const res = await fetch("/api/parent/notifications?limit=30", {
        cache: "no-store",
      });
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
      const res = await fetch("/api/parent/payment-events", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        events: Array<{ status: string; children: Array<{ paid: boolean }> }>;
      };
      const pending = (data.events ?? []).filter(
        (e) =>
          e.status === "ACTIVE" &&
          e.children.some((c: { paid: boolean }) => !c.paid),
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
        const data = (await notifRes.json()) as {
          notifications: NotificationItem[];
        };
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
      const res = await fetch("/api/parent/payment-events", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        events: PaymentEventItem[];
        receipts: ReceiptItem[];
      };
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

  const PAYMENT_NOTIF_TYPES = useMemo(
    () =>
      new Set([
        "PAYMENT_EVENT_CREATED",
        "PAYMENT_EVENT_REMINDER",
        "PAYMENT_COMPLETED",
      ]),
    [],
  );

  const EVENT_NOTIF_TYPES = useMemo(
    () => new Set(["GATE_ENTRY", "GATE_EXIT", "ATTENDANCE"]),
    [],
  );

  const getNotifRoute = useCallback((type: string): string => {
    if (
      type.startsWith("ORDER") ||
      type === "KIOSK_ORDER_GIVEN" ||
      type === "KIOSK_ORDER_PICKED"
    )
      return "/orders";
    if (type.startsWith("WALLET") || type === "WALLET_TOPUP")
      return "/wallet?mode=canteen";
    if (type.startsWith("PRE_ORDER")) return "/pre-orders";
    if (type.startsWith("LIBRARY")) return "/library-history";
    if (type.startsWith("GATE") || type.startsWith("ATTENDANCE"))
      return "/calendar";
    return "/notifications?mode=canteen";
  }, []);

  const isEventNotifType = useCallback(
    (type: string): boolean => {
      return (
        EVENT_NOTIF_TYPES.has(type) ||
        type.startsWith("GATE") ||
        type.startsWith("ATTENDANCE")
      );
    },
    [EVENT_NOTIF_TYPES],
  );

  const getNotifEventLabel = useCallback((type: string): string => {
    if (type === "GATE_ENTRY") return "Gate Entry";
    if (type === "GATE_EXIT") return "Gate Exit";
    if (type.startsWith("ATTENDANCE")) return "Attendance";
    return "Event";
  }, []);

  const markNotifAsRead = useCallback(
    async (notificationId: string, type?: string) => {
      setNotifItems((prev) =>
        prev.map((n) =>
          n.id === notificationId
            ? { ...n, readAt: new Date().toISOString() }
            : n,
        ),
      );
      await fetch("/api/parent/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
      if (type) {
        setNotificationDrawerOpen(false);
        if (PAYMENT_NOTIF_TYPES.has(type)) {
          void openPaymentsDrawer();
        } else if (isEventNotifType(type)) {
          toast(`${getNotifEventLabel(type)} event recorded`, { icon: "📅" });
          router.push("/calendar");
        } else {
          router.push(getNotifRoute(type));
        }
      }
    },
    [
      getNotifRoute,
      getNotifEventLabel,
      isEventNotifType,
      router,
      PAYMENT_NOTIF_TYPES,
      openPaymentsDrawer,
    ],
  );

  const markAllNotifsRead = useCallback(async () => {
    setNotifItems((prev) =>
      prev.map((n) =>
        n.readAt ? n : { ...n, readAt: new Date().toISOString() },
      ),
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

  const unreadNotificationCount = useMemo(
    () => notifItems.filter((n) => !n.readAt).length,
    [notifItems],
  );

  const unreadNoticeCount = useMemo(
    () => noticeItems.filter((n) => !n.acknowledged).length,
    [noticeItems],
  );

  const notifUnreadCount = unreadNotificationCount + unreadNoticeCount;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setProfileImage(session?.user?.image ?? null);
  }, [session?.user?.image]);

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
    setProfileSheetOpen(false);
    setVenuePickerOpen(false);
  }, [pathname]);

  // Fetch canteens & libraries once for venue picker
  useEffect(() => {
    if (venuesLoaded) return;
    Promise.all([
      fetch("/api/org/canteens", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { canteens: [] },
      ),
      fetch("/api/org/libraries", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : { libraries: [] },
      ),
    ])
      .then(([cData, lData]) => {
        const c = (
          (
            cData as {
              canteens: {
                id: string;
                name: string;
                location: string | null;
                status: string;
              }[];
            }
          ).canteens ?? []
        )
          .filter((v) => v.status === "ACTIVE")
          .map(({ id, name, location }) => ({ id, name, location }));
        const l = (
          (
            lData as {
              libraries: {
                id: string;
                name: string;
                location: string | null;
                status: string;
              }[];
            }
          ).libraries ?? []
        )
          .filter((v) => v.status === "ACTIVE")
          .map(({ id, name, location }) => ({ id, name, location }));
        setCanteens(c);
        setLibraries(l);
        setVenuesLoaded(true);
        // Auto-select first if none set
        if (!selectedCanteen && c.length > 0) setSelectedCanteen(c[0].id);
        if (!selectedLibrary && l.length > 0) setSelectedLibrary(l[0].id);
      })
      .catch(() => {
        setVenuesLoaded(true);
      });
  }, [
    venuesLoaded,
    selectedCanteen,
    selectedLibrary,
    setSelectedCanteen,
    setSelectedLibrary,
  ]);

  const currentVenueName = useMemo(() => {
    if (venueType === "canteen") {
      return (
        canteens.find((c) => c.id === selectedCanteen)?.name ??
        "Select cafeteria"
      );
    }
    return (
      libraries.find((l) => l.id === selectedLibrary)?.name ?? "Select library"
    );
  }, [venueType, canteens, libraries, selectedCanteen, selectedLibrary]);

  const getInitials = (name?: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const renderPaymentEventDetail = (event: PaymentEventItem) => (
    <div className="space-y-4">
      {event.description && (
        <p className="text-sm text-muted-foreground">{event.description}</p>
      )}
      <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">Amount per member</p>
          <p className="text-2xl font-bold flex items-center gap-1">
            <IndianRupee className="h-5 w-5" />
            {event.amount.toFixed(2)}
          </p>
        </div>
        {event.dueDate && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Due date</p>
            <p
              className={cn(
                "text-sm font-semibold",
                new Date(event.dueDate) < new Date() &&
                  !event.children.every((c) => c.paid)
                  ? "text-destructive"
                  : "",
              )}
            >
              {new Date(event.dueDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        )}
      </div>

      {event.paymentAccountId && (
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Pay To
          </p>
          <div className="flex items-center gap-2">
            {event.paymentAccountMethod === "UPI" ? (
              <CreditCard className="h-5 w-5 text-violet-500" />
            ) : (
              <Landmark className="h-5 w-5 text-blue-500" />
            )}
            <p className="font-semibold text-sm">{event.paymentAccountLabel}</p>
          </div>
          {event.paymentAccountMethod === "UPI" &&
            event.paymentAccountUpiId && (
              <p className="text-sm font-mono bg-muted/50 rounded-lg px-3 py-2">
                {event.paymentAccountUpiId}
              </p>
            )}
          {event.paymentAccountMethod === "BANK_ACCOUNT" && (
            <div className="space-y-1 text-sm">
              {event.paymentAccountHolderName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account Holder</span>
                  <span className="font-medium">
                    {event.paymentAccountHolderName}
                  </span>
                </div>
              )}
              {event.paymentAccountNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account No.</span>
                  <span className="font-mono font-medium">
                    {event.paymentAccountNumber}
                  </span>
                </div>
              )}
              {event.paymentAccountIfsc && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IFSC</span>
                  <span className="font-mono font-medium">
                    {event.paymentAccountIfsc}
                  </span>
                </div>
              )}
              {event.paymentAccountBankName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bank</span>
                  <span className="font-medium">
                    {event.paymentAccountBankName}
                  </span>
                </div>
              )}
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
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Members
          </p>
          {event.children.map((c) => (
            <div
              key={c.id}
              className={cn(
                "flex items-center justify-between rounded-xl px-3 py-2.5 border",
                c.paid
                  ? "bg-green-50/70 border-green-200 dark:bg-green-950/20 dark:border-green-800/40"
                  : "bg-card border-border",
              )}
            >
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                {c.grNumber && (
                  <p className="text-xs text-muted-foreground">
                    GR: {c.grNumber}
                  </p>
                )}
              </div>
              {c.paid ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                  {c.receipt && (
                    <span className="text-[12px] text-muted-foreground ml-1">
                      {c.receipt.receiptNumber}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">
                  Pending
                </span>
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
          <p className="mt-1.5 text-xs text-muted-foreground">
            No payment events yet
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {activeEvents.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Pending
            </p>
            {activeEvents.map((event) => {
              const overdue = event.dueDate
                ? new Date(event.dueDate) < new Date()
                : false;
              const paid = event.children.every((c) => c.paid);
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setSelectedPaymentEvent(event)}
                  className={cn(
                    "w-full text-left rounded-2xl border p-3.5 transition-all hover:border-primary/30",
                    overdue && !paid
                      ? "border-destructive/40 bg-destructive/5"
                      : "border-border/60 bg-card/70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">
                        {event.title}
                      </p>
                      {event.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {event.description}
                        </p>
                      )}
                      {event.dueDate && (
                        <p
                          className={cn(
                            "text-[13px] mt-1",
                            overdue && !paid
                              ? "text-destructive font-medium"
                              : "text-muted-foreground",
                          )}
                        >
                          Due{" "}
                          {new Date(event.dueDate).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" },
                          )}
                          {overdue && !paid && " · Overdue"}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={cn(
                          "text-lg font-bold",
                          paid ? "text-green-600 dark:text-green-400" : "",
                        )}
                      >
                        ₹{event.amount.toFixed(0)}
                      </p>
                      {paid && (
                        <span className="text-[12px] text-green-600 font-medium flex items-center gap-0.5 justify-end">
                          <CheckCircle2 className="h-3 w-3" />
                          Paid
                        </span>
                      )}
                      {!paid && overdue && (
                        <AlertCircle className="h-4 w-4 text-destructive ml-auto" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {pastEvents.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              History
            </p>
            {pastEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => setSelectedPaymentEvent(event)}
                className="w-full text-left rounded-2xl border border-border/40 bg-card/50 p-3.5 transition-all hover:border-primary/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium truncate">{event.title}</p>
                  <p className="text-sm font-semibold text-muted-foreground shrink-0">
                    ₹{event.amount.toFixed(0)}
                  </p>
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
      ) : notifItems.length === 0 && noticeItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <IoNotifications className="mx-auto h-6 w-6 text-muted-foreground/30" />
          <p className="mt-1.5 text-xs text-muted-foreground">
            No notifications yet
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {notifItems.map((n) => {
            const isPayment = PAYMENT_NOTIF_TYPES.has(n.type);
            const isEvent = isEventNotifType(n.type);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => void markNotifAsRead(n.id, n.type)}
                className={cn(
                  "w-full text-left rounded-xl px-3 py-2.5 transition-colors",
                  isPayment && !n.readAt
                    ? "bg-emerald-50/70 hover:bg-emerald-50 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20 border border-emerald-200/40 dark:border-emerald-800/20"
                    : n.readAt
                      ? "hover:bg-card/70"
                      : "bg-orange-50/60 hover:bg-orange-50 dark:bg-orange-950/10 dark:hover:bg-orange-950/20",
                )}
              >
                <div className="flex items-start gap-2.5">
                  {isPayment ? (
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/40">
                      <IndianRupee className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  ) : isEvent ? (
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100/70 dark:bg-blue-950/30">
                      <IoCalendar className="h-3.5 w-3.5 text-blue-500" />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm leading-tight",
                        !n.readAt && "font-semibold",
                      )}
                    >
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {n.message}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <p className="text-[12px] text-muted-foreground/70">
                        {n.childName} ·{" "}
                        {new Date(n.createdAt).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {isPayment && (
                        <span className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                          View payment →
                        </span>
                      )}
                      {isEvent && (
                        <span className="text-[12px] font-medium text-blue-500">
                          View in calendar →
                        </span>
                      )}
                    </div>
                  </div>
                  {!n.readAt && (
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        isPayment ? "bg-emerald-500" : "bg-orange-500",
                      )}
                    />
                  )}
                </div>
              </button>
            );
          })}
          {noticeItems.map((n) => (
            <button
              key={`notice-${n.id}`}
              type="button"
              onClick={() => {
                setNotificationDrawerOpen(false);
                setActiveNotice(n);
                void router.push("/calendar");
              }}
              className={cn(
                "w-full text-left rounded-xl px-3 py-2.5 transition-colors",
                n.acknowledged
                  ? "hover:bg-card/70"
                  : "bg-violet-50/60 hover:bg-violet-50 dark:bg-violet-950/10 dark:hover:bg-violet-950/20",
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100/70 dark:bg-violet-950/30">
                  <IoCalendar className="h-3.5 w-3.5 text-violet-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm leading-tight", !n.acknowledged && "font-semibold")}>
                    {n.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {n.message}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <p className="text-[12px] text-muted-foreground/70">
                      {new Date(n.createdAt).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <span className="text-[12px] font-medium text-violet-500">
                      View in calendar →
                    </span>
                  </div>
                </div>
                {!n.acknowledged && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );

  const bottomTabs = useMemo(
    () => [
      {
        key: "food" as const,
        href: "/menu",
        icon: IoRestaurant,
        iconOutline: IoRestaurantOutline,
        label: "Food",
      },
      {
        key: "library" as const,
        href: "/library-showcase",
        icon: IoBook,
        iconOutline: IoBookOutline,
        label: "Library",
      },
      {
        key: "pass" as const,
        href: certePlusActive ? "/pre-orders" : "/certe-pass",
        icon: IoSparkles,
        iconOutline: IoSparklesOutline,
        label: "Pass",
      },
      {
        key: "notes" as const,
        href: "/assignments",
        icon: IoDocumentText,
        iconOutline: IoDocumentTextOutline,
        label: "Board",
      },
    ],
    [certePlusActive],
  );

  return (
    <>
      {/* Minimal transparent header */}
      <header className="sticky top-0 z-50 bg-background/100 px-5">
        <div
          className={cn(
            "flex min-h-14 items-center justify-between",
            showVenueChip ? "pt-3 pb-2" : "py-2",
          )}
        >
          {/* Left: Context-sensitive title / greeting */}
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
            <span className="text-[30px] font-semibold tracking-tight">
              {pageTitle}
            </span>
            {showVenueChip && (
              <button
                type="button"
                onClick={() => setVenuePickerOpen(true)}
                className="flex items-center gap-1 mt-0 text-[15px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {venueType === "canteen" ? (
                  <Store className="h-3 w-3 shrink-0" />
                ) : (
                  <BookOpen className="h-3 w-3 shrink-0" />
                )}
                <span className="truncate max-w-[180px]">
                  {currentVenueName}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              </button>
            )}
            </div>
          </div>

          {/* Right: Cart + Bell + Avatar */}
          <div className="flex items-center gap-0.5">
            {parentMode === "canteen" && (
              <button
                type="button"
                onClick={() => {
                  blurFocusedElement();
                  setCartDrawerOpen(true);
                }}
                className="relative inline-flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted/50"
                aria-label="Cart"
              >
                <IoCart
                  className={cn(
                    "h-[22px] w-[22px]",
                    cartBounce && "animate-bounce-subtle",
                  )}
                />
                {mounted && cartCount > 0 && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            )}
            <ParentNotificationBell
              parentId={session?.user?.id}
              externalUnreadCount={notifUnreadCount}
              onClick={() => void openNotificationDrawer()}
              className="h-11 min-h-11 w-11 min-w-11 rounded-full"
            />
            <button
              type="button"
              onClick={() => {
                blurFocusedElement();
                setWalletDrawerOpen(true);
              }}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-primary/10 px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
              aria-label="Wallet balance"
            >
              <IoWallet className="h-4 w-4" />
              <span>
                {mounted
                  ? `₹${totalWalletBalance.toLocaleString("en-IN")}`
                  : "…"}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Venue picker BottomSheet */}
      <BottomSheet
        open={venuePickerOpen}
        onClose={() => setVenuePickerOpen(false)}
        snapPoints={[40]}
      >
        <div className="space-y-4">
          <p className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
            {venueType === "canteen" ? "Select Cafeteria" : "Select Library"}
          </p>
          <div className="space-y-1">
            {(venueType === "canteen" ? canteens : libraries).map((venue) => {
              const isSelected =
                venueType === "canteen"
                  ? venue.id === selectedCanteen
                  : venue.id === selectedLibrary;
              return (
                <button
                  key={venue.id}
                  type="button"
                  onClick={() => {
                    if (venueType === "canteen") setSelectedCanteen(venue.id);
                    else setSelectedLibrary(venue.id);
                    setVenuePickerOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                    isSelected ? "bg-primary/10" : "hover:bg-muted/40",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full shrink-0",
                      isSelected ? "bg-primary/15" : "bg-muted/50",
                    )}
                  >
                    {venueType === "canteen" ? (
                      <Store
                        className={cn(
                          "h-4 w-4",
                          isSelected ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                    ) : (
                      <BookOpen
                        className={cn(
                          "h-4 w-4",
                          isSelected ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-[14px] truncate",
                        isSelected && "font-semibold text-primary",
                      )}
                    >
                      {venue.name}
                    </p>
                    {venue.location && (
                      <p className="text-[14px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{venue.location}</span>
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
            {(venueType === "canteen" ? canteens : libraries).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No {venueType === "canteen" ? "cafeterias" : "libraries"}{" "}
                available
              </p>
            )}
          </div>
        </div>
      </BottomSheet>

      {/* Content */}
      <div className="pb-24">{children}</div>

      {/* Bottom tab bar — GitHub iOS-style circular floating bar */}
      <nav
        className="fixed bottom-3 left-0 right-0 z-50 mx-auto flex w-[85%] max-w-md items-center justify-center gap-2.5"
        style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
      >
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-full border border-black/[0.06] bg-white/80 px-1.5 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] backdrop-blur-2xl dark:border-white/[0.12] dark:bg-slate-900/80 dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          {/* Subtle top highlight */}
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/10" />

          <div className="relative flex items-center gap-0.5">
            {bottomTabs.map((tab) => {
              const isActive = bottomTab === tab.key;
              const ActiveIcon = tab.icon;
              const InactiveIcon = tab.iconOutline;
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={cn(
                    "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-[2px] rounded-full py-2 transition-all duration-200",
                    isActive
                      ? "text-primary"
                      : "text-slate-500 dark:text-slate-400",
                  )}
                >
                  {/* Active circular background */}
                  {isActive && (
                    <span className="absolute inset-0 rounded-full bg-primary/10 dark:bg-primary/15" />
                  )}
                  <span className="relative">
                    {isActive ? (
                      <ActiveIcon className="h-[21px] w-[21px] transition-all duration-200" />
                    ) : (
                      <InactiveIcon className="h-[21px] w-[21px] transition-all duration-200" />
                    )}
                    {tab.key === "pass" && certePlusActive && (
                      <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-amber-400 ring-[1.5px] ring-white dark:ring-slate-900" />
                    )}
                    {tab.key === "pass" && !certePlusActive && (
                      <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-sky-400/80 ring-[1.5px] ring-white dark:ring-slate-900" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "relative text-[10px] font-semibold leading-none tracking-wide",
                      isActive
                        ? "text-primary"
                        : "text-slate-500 dark:text-slate-400",
                    )}
                  >
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Profile bubble — circular like GitHub iOS */}
        <button
          type="button"
          onClick={() => setProfileSheetOpen(true)}
          className={cn(
            "relative shrink-0 h-[46px] w-[46px] min-w-[46px] aspect-square overflow-hidden rounded-full bg-white/80 shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] backdrop-blur-2xl transition-all duration-200 active:scale-95 dark:bg-slate-900/80 dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
            certePlusActive
              ? "ring-2 ring-amber-400/80 dark:ring-amber-500/70"
              : "ring-2 ring-slate-300/70 dark:ring-slate-500/50",
          )}
          aria-label="Profile"
        >
          <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/50 to-transparent dark:from-white/5" />
          <Avatar className="relative h-full w-full">
            <AvatarImage src={profileImage ?? undefined} alt={session?.user?.name || "Profile"} />
            <AvatarFallback className="text-[15px] font-bold text-slate-700 dark:text-slate-200">
              {mounted ? getInitials(session?.user?.name) : "?"}
            </AvatarFallback>
          </Avatar>
        </button>
      </nav>

      {/* Profile Sheet */}
      <BottomSheet
        open={profileSheetOpen}
        onClose={() => setProfileSheetOpen(false)}
        snapPoints={[60, 90]}
        bare
      >
        <div className="flex h-full flex-col">
          {/* Profile info */}
          <div className="px-5 pt-2 pb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={profileImage ?? undefined} alt={session?.user?.name || "Profile"} />
                  <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                    {mounted ? getInitials(session?.user?.name) : "?"}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => {
                    setProfileSheetOpen(false);
                    setProfilePhotoPreviewOpen(true);
                  }}
                  className="absolute bottom-0 right-0 inline-flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground shadow-sm transition-colors hover:bg-muted/70"
                  aria-label="Edit profile photo"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
              <div className="min-w-0">
                <p className="truncate text-[24px] font-bold tracking-tight">
                  {session?.user?.name || "User"}
                </p>
                <p className="truncate text-[15px] text-muted-foreground">
                  {session?.user?.email}
                </p>
              </div>
            </div>
            <input
              ref={profilePhotoInputRef}
              id="parent-profile-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={profileUploading}
              onChange={handleProfilePhotoInputChange}
            />
            <div className="mt-2 text-xs text-muted-foreground">
              Select the pencil icon to edit your profile photo.
            </div>

            {/* Wallet + Children cards */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setProfileSheetOpen(false);
                  void router.push("/wallet");
                }}
                className="rounded-2xl bg-card p-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <p className="text-xs text-muted-foreground">Wallet</p>
                <p className="mt-1 flex items-center gap-1 text-lg font-bold">
                  <IndianRupee className="h-4 w-4" />
                  {totalWalletBalance.toFixed(0)}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setProfileSheetOpen(false);
                  void router.push("/children");
                }}
                className="rounded-2xl bg-card p-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <p className="text-xs text-muted-foreground">Members</p>
                <p className="mt-1 text-lg font-bold">
                  {wallets.length} {wallets.length === 1 ? "member" : "members"}
                </p>
              </button>
            </div>

            {/* Certe+ subscription card */}
            <button
              type="button"
              onClick={() => {
                setProfileSheetOpen(false);
                void router.push("/certe-pass");
              }}
              className={cn(
                "mt-3 flex w-full items-center gap-3 rounded-2xl p-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
                certePlusActive
                  ? "bg-gradient-to-r from-amber-50 to-amber-100/60 dark:from-amber-950/30 dark:to-amber-900/20"
                  : "bg-card",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  certePlusActive ? "bg-amber-400/20" : "bg-muted/50",
                )}
              >
                <IoShieldCheckmark
                  className={cn(
                    "h-4.5 w-4.5",
                    certePlusActive
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                  )}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">Certe+</p>
                {certePlusActive ? (
                  <p className="text-[14px] text-amber-700 dark:text-amber-400">
                    Active ·{" "}
                    {certePlusStatus?.subscription?.plan || "Subscribed"}
                  </p>
                ) : (
                  <p className="text-[14px] text-muted-foreground">
                    View benefits & subscribe
                  </p>
                )}
              </div>
              {!certePlusActive && (
                <span className="shrink-0 rounded-full bg-primary px-3 py-1 text-[13px] font-semibold text-primary-foreground">
                  Get
                </span>
              )}
              {certePlusActive && (
                <Check className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              )}
            </button>
          </div>

          {/* Menu items */}
          <div className="flex-1 overflow-y-auto px-5">
            {([
              ...(certePlusActive
                ? [{ label: "Pre-Orders", href: "/pre-orders" }]
                : []),
              { label: "Your Posts", href: "/content" },
              { label: "Order History", href: "/orders" },
              { label: "Library History", href: "/library-history" },
              { label: "Calendar", href: "/calendar" },
              { label: "Controls", href: "/controls" },
              { label: "Notifications", href: "/notifications" },
              { label: "Messaging", href: "/messaging-settings" },
            ] as Array<{ label: string; href: string; action?: () => void }>).map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.action) {
                    item.action();
                    return;
                  }
                  setProfileSheetOpen(false);
                  void router.push(item.href);
                }}
                className="flex w-full items-center justify-between border-b border-border/30 py-3.5 text-[15px] last:border-0"
              >
                {item.label}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}

            {/* Theme toggle */}
            <div className="flex items-center justify-between border-b border-border/30 py-3.5">
              <span className="text-[15px]">Theme</span>
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted/50"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Sign out — sticky at bottom */}
          <div className="shrink-0 border-t border-border/30 px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() =>
                signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      window.location.href = "/login";
                    },
                  },
                })
              }
              className="w-full py-3 text-[15px] text-primary"
            >
              Sign Out
            </button>
          </div>
        </div>
      </BottomSheet>

      {isMobile ? (
        <>
          <BottomSheet
            open={cartDrawerOpen}
            onClose={() => setCartDrawerOpen(false)}
            snapPoints={[50]}
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
                              <p className="truncate text-sm font-semibold">
                                {item.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Qty {item.quantity}
                              </p>
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
                  <span className="text-sm text-muted-foreground">
                    Subtotal
                  </span>
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
            snapPoints={[50]}
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchWallets()}
                    >
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
                              <p className="text-sm font-semibold">
                                {wallet.childName}
                              </p>
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
                    void router.push("/wallet");
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
            snapPoints={[60, 90]}
            bare
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
                <div className="space-y-0.5">
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    <IoNotifications className="h-4 w-4 text-orange-500" />
                    Notifications
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {notifUnreadCount} unread
                  </p>
                </div>
                {unreadNotificationCount > 0 && (
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
                    void router.push("/notifications");
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
            onClose={() => {
              setPaymentsDrawerOpen(false);
              setSelectedPaymentEvent(null);
            }}
            snapPoints={[60, 90]}
            bare
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
                {selectedPaymentEvent ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedPaymentEvent(null)}
                      className="mr-1 -ml-1 inline-flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-full hover:bg-muted transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <h3 className="text-base font-semibold truncate">
                      {selectedPaymentEvent.title}
                    </h3>
                  </>
                ) : (
                  <>
                    <h3 className="flex items-center gap-2 text-base font-semibold">
                      <IoCalendar className="h-4 w-4 text-primary" />
                      Payments
                    </h3>
                    {pendingEventsCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[12px] font-bold text-white">
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
                                <p className="truncate text-sm font-semibold">
                                  {item.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Qty {item.quantity}
                                </p>
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
                      <span className="text-sm text-muted-foreground">
                        Subtotal
                      </span>
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void fetchWallets()}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : wallets.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      No wallet found yet. Add a child to activate family
                      wallet.
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
                                <p className="text-sm font-semibold">
                                  {wallet.childName}
                                </p>
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
                      void router.push("/wallet");
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
                    {notifUnreadCount} unread notification
                    {notifUnreadCount !== 1 ? "s" : ""}
                  </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-3">
                  {renderNotificationList()}
                </div>

                <SheetFooter className="border-t border-border/60 bg-muted/30">
                  <div className="space-y-2 w-full">
                    {unreadNotificationCount > 0 && (
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
                        void router.push("/notifications");
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
              if (!open) {
                setSelectedPaymentEvent(null);
              }
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
                          className="-ml-1 mr-1 inline-flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-full hover:bg-muted transition-colors"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <SheetTitle className="text-base font-semibold truncate">
                          {selectedPaymentEvent.title}
                        </SheetTitle>
                      </>
                    ) : (
                      <>
                        <SheetTitle className="flex items-center gap-2 text-base">
                          <IoCalendar className="h-4 w-4 text-primary" />
                          Payments
                        </SheetTitle>
                        {pendingEventsCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[12px] font-bold text-white">
                            {pendingEventsCount}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <SheetDescription className="sr-only">
                    {selectedPaymentEvent
                      ? selectedPaymentEvent.title
                      : "School payment events"}
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
              void router.push("/settings");
            }}
          >
            Upgrade to Certe+
          </Button>
        </div>
      </BottomSheet>

      <Dialog
        open={profilePhotoPreviewOpen}
        onOpenChange={(open) => setProfilePhotoPreviewOpen(open)}
      >
        <DialogContent className="z-[70] max-w-sm gap-0 overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Edit profile photo</DialogTitle>
            <DialogDescription>
              Preview your profile photo and tap edit to upload a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            {profileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profileImage}
                alt={session?.user?.name || "Profile"}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center bg-muted text-5xl font-semibold text-muted-foreground">
                {mounted ? getInitials(session?.user?.name) : "?"}
              </div>
            )}
            <button
              type="button"
              onClick={() => profilePhotoInputRef.current?.click()}
              disabled={profileUploading}
              className={cn(
                "absolute right-3 top-3 inline-flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground shadow-sm transition-colors",
                profileUploading ? "cursor-not-allowed opacity-70" : "hover:bg-muted/70",
              )}
              aria-label="Upload new profile photo"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notice Detail Dialog */}
      <Dialog
        open={activeNotice !== null}
        onOpenChange={(open) => {
          if (!open) setActiveNotice(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base leading-snug pr-4">
              {activeNotice?.title ?? "Notice"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Notice from management
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 dark:border-violet-900/30 dark:bg-violet-950/20 p-4">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {activeNotice?.message}
            </p>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {activeNotice &&
              new Date(activeNotice.createdAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
          </p>
          <DialogFooter>
            {activeNotice && !activeNotice.acknowledged ? (
              <Button
                className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => {
                  if (activeNotice) void acknowledgeNotice(activeNotice.id);
                }}
              >
                Acknowledge
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setActiveNotice(null)}
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AI Assistant FAB + Chat Panel ─────────────────── */}
      {certePlusActive && (
        <button
          type="button"
          onClick={() => setChatOpen((v) => !v)}
          aria-label="Open AI Assistant"
          className="fixed bottom-[5.5rem] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-white/60 shadow-sm backdrop-blur-xl transition-colors hover:bg-white/80 active:scale-[0.96] dark:border-white/10 dark:bg-slate-900/70 dark:hover:bg-slate-900/90 md:bottom-6 md:right-6"
        >
          {chatOpen ? (
            <IoClose className="h-5 w-5 text-foreground" />
          ) : (
            <IoChatbubbleEllipses className="h-5 w-5 text-primary" />
          )}
        </button>
      )}

      <ChatAssistant
        open={chatOpen}
        onOpenChange={setChatOpen}
        context={parentMode as ChatContext}
      />
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
