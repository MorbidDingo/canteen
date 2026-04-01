"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  UtensilsCrossed,
  ShoppingCart,
  BookOpen,
  BookOpenText,
  Wallet,
  ClipboardList,
  Shield,
  IndianRupee,
  Sparkles,
  MessageSquareText,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { CerteLogo } from "@/components/certe-logo";
import { ParentNotificationBell } from "@/components/parent-notification-bell";
import { ChatAssistant } from "@/components/ai/chat-assistant";
import { LibraryChatAssistant } from "@/components/ai/library-chat-assistant";
import { CanteenSelector } from "@/components/canteen-selector";
import { LibrarySelector } from "@/components/library-selector";
import { motion, BottomSheet } from "@/components/ui/motion";
import { usePersistedSelection } from "@/lib/use-persisted-selection";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type ParentMode = "canteen" | "library";
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

function getParentMode(pathname: string, requestedMode: string | null): ParentMode {
  if (pathname.startsWith("/library")) return "library";
  if (
    pathname === "/menu" ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/pre-orders") ||
    pathname === "/cart"
  ) {
    return "canteen";
  }
  if (requestedMode === "library" || requestedMode === "canteen") {
    return requestedMode;
  }
  return "canteen";
}

function getActiveTab(pathname: string): string {
  if (pathname === "/library-showcase") return "showcase";
  if (["/settings", "/children", "/wallet", "/notifications", "/messaging-settings"].includes(pathname)) {
    return "settings";
  }
  if (pathname === "/controls") return "controls";
  if (pathname === "/orders" || pathname === "/pre-orders") return "orders";
  if (pathname === "/cart") return "cart";
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
  const [cartBounce, setCartBounce] = useState(false);
  const [showControlsSheet, setShowControlsSheet] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [walletDrawerOpen, setWalletDrawerOpen] = useState(false);
  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [libraryChatOpen, setLibraryChatOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [wallets, setWallets] = useState<WalletSnapshot[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [notifItems, setNotifItems] = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const { value: selectedCanteen, setValue: setSelectedCanteen } = usePersistedSelection(
    "certe:selected-canteen-id",
  );
  const { value: selectedLibrary, setValue: setSelectedLibrary } = usePersistedSelection(
    "certe:selected-library-id",
  );
  const prevCartCount = useRef(cartCount);

  const requestedMode = searchParams.get("mode");
  const parentMode = getParentMode(pathname, requestedMode);
  const activeTab = getActiveTab(pathname);
  const pageHasInlineContextSelector =
    pathname === "/menu" || pathname === "/library-history" || pathname === "/library-showcase";
  // Show context selector in header only where it adds value: order history + cart
  // Controls, settings, wallet, children, notifications — no canteen/library context needed
  const showHeaderContextSelector =
    !pageHasInlineContextSelector &&
    pathname === "/cart";

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

  /** Fetch notifications first, then open the drawer once loaded */
  const openNotificationDrawer = useCallback(async () => {
    blurFocusedElement();
    setNotifLoading(true);
    try {
      const res = await fetch("/api/parent/notifications?limit=30", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { notifications: NotificationItem[] };
        setNotifItems(data.notifications ?? []);
      }
    } finally {
      setNotifLoading(false);
      setNotificationDrawerOpen(true);
    }
  }, [blurFocusedElement]);

  const markNotifAsRead = useCallback(async (notificationId: string) => {
    setNotifItems((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    await fetch("/api/parent/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId }),
    });
  }, []);

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

  const notifUnreadCount = useMemo(
    () => notifItems.filter((n) => !n.readAt).length,
    [notifItems],
  );

  useEffect(() => {
    setMounted(true);
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

  // Keep header balance chip populated even when wallet icon is removed
  useEffect(() => {
    void fetchWallets();
  }, [fetchWallets]);

  useEffect(() => {
    if (!walletDrawerOpen) return;
    void fetchWallets();
  }, [fetchWallets, walletDrawerOpen]);

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
    setChatOpen(false);
    setLibraryChatOpen(false);
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

  const renderNotificationList = () => (
    <>
      {notifLoading ? (
        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground">
          Loading notifications...
        </div>
      ) : notifItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <Bell className="mx-auto h-6 w-6 text-muted-foreground/30" />
          <p className="mt-1.5 text-xs text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {notifItems.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => void markNotifAsRead(n.id)}
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
    if (parentMode === "canteen") {
      return [
        { key: "home" as const, href: "/menu", icon: UtensilsCrossed, label: "Menu", locked: false },
        { key: "orders" as const, href: "/orders", icon: ClipboardList, label: "Orders", locked: false },
        { key: "cart" as const, href: "/cart", icon: ShoppingCart, label: "Cart", locked: false },
        { key: "controls" as const, href: withParentMode("/controls"), icon: Shield, label: "Controls", locked: !certePlusActive },
        { key: "settings" as const, href: withParentMode("/settings"), icon: null, label: "Me", locked: false, isProfile: true },
      ];
    }
    return [
      { key: "showcase" as const, href: "/library-showcase", icon: Sparkles, label: "Showcase", locked: false },
      { key: "reader" as const, href: "/library-reader", icon: BookOpenText, label: "Reader", locked: !certePlusActive },
      { key: "home" as const, href: "/library-history", icon: BookOpen, label: "History", locked: false },
      { key: "controls" as const, href: withParentMode("/controls"), icon: Shield, label: "Controls", locked: !certePlusActive },
      { key: "settings" as const, href: withParentMode("/settings"), icon: null, label: "Me", locked: false, isProfile: true },
    ];
  }, [certePlusActive, parentMode, withParentMode]);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-6xl px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-6 md:py-2">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="flex min-w-0 items-center gap-1.5">
              <CerteLogo size={24} />
              <span className="hidden text-sm font-extrabold tracking-tight text-foreground sm:inline">
                certe
              </span>
              {certePlusActive && (
                <span className="text-base font-bold tracking-wide text-primary">
                  +
                </span>
              )}
            </Link>

            <div className="flex shrink-0 items-center gap-1.5">
              {/* Notification bubble */}
              <div className="flex items-center gap-0.5 rounded-xl border border-border/60 bg-muted/55 px-1 py-1 shadow-sm">
                <ParentNotificationBell
                  parentId={session?.user?.id}
                  externalUnreadCount={notifUnreadCount}
                  onClick={() => void openNotificationDrawer()}
                  className="h-10 w-10 rounded-lg"
                />
              </div>

              {/* AI Chat button — orange, always visible, mode-aware */}
              <button
                type="button"
                aria-label={parentMode === "library" ? "Open Library Assistant" : "Open AI assistant"}
                onClick={() => {
                  if (parentMode === "library") {
                    setLibraryChatOpen((v) => !v);
                  } else {
                    setChatOpen((v) => !v);
                  }
                }}
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition-all",
                  parentMode === "library"
                    ? libraryChatOpen
                      ? "bg-[#b87314] text-white"
                      : "bg-[#d4891a] text-white hover:bg-[#b87314]"
                    : chatOpen
                    ? "bg-[#b87314] text-white"
                    : "bg-[#d4891a] text-white hover:bg-[#b87314]",
                )}
              >
                <MessageSquareText className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            {/* Mode switcher — premium pill design */}
            <div className="flex items-center rounded-xl border border-border/60 bg-muted/55 p-1 shadow-sm">
              <Link
                href="/menu"
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition-all duration-200",
                  parentMode === "canteen"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <UtensilsCrossed className={cn("h-3.5 w-3.5 transition-colors", parentMode === "canteen" ? "text-primary" : "")} />
                <span>Canteen</span>
              </Link>

              <Link
                href="/library-history"
                className={cn(
                  "relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition-all duration-200",
                  parentMode === "library"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <BookOpen className={cn("h-3.5 w-3.5 transition-colors", parentMode === "library" ? "text-primary" : "")} />
                <span>Library</span>
                {overdueCount > 0 && (
                  <span className="absolute -right-1 -top-1 z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
                    {overdueCount}
                  </span>
                )}
              </Link>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              {showHeaderContextSelector && parentMode === "canteen" && pathname !== "/cart" && (
                <CanteenSelector
                  value={selectedCanteen}
                  onChange={setSelectedCanteen}
                  showAll
                  compact
                  className="w-[148px] sm:w-[180px]"
                />
              )}

              {showHeaderContextSelector && parentMode === "library" && (
                <LibrarySelector
                  value={selectedLibrary}
                  onChange={setSelectedLibrary}
                  showAll
                  compact
                  className="w-[148px] sm:w-[180px]"
                />
              )}

              <button
                type="button"
                onClick={() => {
                  blurFocusedElement();
                  setWalletDrawerOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-card/80 px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm transition-all hover:bg-card"
              >
                <IndianRupee className="h-3 w-3 text-primary" />
                <span>{totalWalletBalance.toFixed(0)}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="app-mobile-safe-bottom">
        {children}
      </div>

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
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
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
                        strokeWidth={isActive ? 2.5 : 1.8}
                        fill={isActive ? "currentColor" : "none"}
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
                      {getInitials(session?.user?.name)}
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
                  <ShoppingCart className="h-4 w-4 text-primary" />
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
                  <Wallet className="h-4 w-4 text-primary" />
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
                  <Sparkles className="h-4 w-4" />
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
                    <Bell className="h-4 w-4 text-orange-500" />
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
                    <ShoppingCart className="h-4 w-4 text-primary" />
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
                    <Wallet className="h-4 w-4 text-primary" />
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
                    <Sparkles className="h-4 w-4" />
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
                    <Bell className="h-4 w-4 text-orange-500" />
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
        </>
      )}

      <BottomSheet
        open={showControlsSheet}
        onClose={() => setShowControlsSheet(false)}
      >
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Shield className="h-7 w-7 text-primary" />
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

      <ChatAssistant open={chatOpen} onOpenChange={setChatOpen} />
      <LibraryChatAssistant open={libraryChatOpen} onOpenChange={setLibraryChatOpen} />
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

