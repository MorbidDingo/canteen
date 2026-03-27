"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  UtensilsCrossed,
  ShoppingCart,
  BookOpen,
  Settings,
  Wallet,
  LogOut,
  ClipboardList,
  Shield,
  IndianRupee,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { CerteLogo } from "@/components/certe-logo";
import { ParentNotificationBell } from "@/components/parent-notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { motion, BottomSheet } from "@/components/ui/motion";
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

function getParentMode(pathname: string): ParentMode {
  if (pathname.startsWith("/library")) return "library";
  return "canteen";
}

const TABS = [
  { key: "canteen", href: "/menu", icon: UtensilsCrossed, label: "Menu" },
  { key: "orders", href: "/orders", icon: ClipboardList, label: "Orders" },
  { key: "library", href: "/library-history", icon: BookOpen, label: "Library" },
  { key: "controls", href: "/controls", icon: Shield, label: "Controls" },
  { key: "settings", href: "/settings", icon: Settings, label: "Settings" },
] as const;

function getActiveTab(pathname: string, parentMode: ParentMode): string {
  if (["/settings", "/children", "/wallet", "/notifications", "/messaging-settings"].includes(pathname)) {
    return "settings";
  }
  if (pathname === "/controls") return "controls";
  if (pathname === "/orders" || pathname === "/pre-orders") return "orders";
  if (parentMode === "library") return "library";
  return "canteen";
}

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const isGeneralAccount = session?.user?.role === "GENERAL";
  const pathname = usePathname();
  const router = useRouter();

  const cartItems = useCartStore((s) => s.items);
  const cartCount = useCartStore((s) => s.getItemCount());
  const clearCart = useCartStore((s) => s.clearCart);

  const [overdueCount, setOverdueCount] = useState(0);
  const certePlusActive = useCertePlusStore((s) => s.status?.active === true);
  const ensureCertePlusFresh = useCertePlusStore((s) => s.ensureFresh);

  const [cartBounce, setCartBounce] = useState(false);
  const [showControlsSheet, setShowControlsSheet] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [walletDrawerOpen, setWalletDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [wallets, setWallets] = useState<WalletSnapshot[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const prevCartCount = useRef(cartCount);

  const parentMode = getParentMode(pathname);
  const activeTab = getActiveTab(pathname, parentMode);

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

  useEffect(() => {
    if (!walletDrawerOpen || isGeneralAccount) return;
    void fetchWallets();
  }, [fetchWallets, isGeneralAccount, walletDrawerOpen]);

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

  const tabs = useMemo(
    () =>
      TABS.map((tab) => ({
        ...tab,
        locked: tab.key === "controls" && !certePlusActive,
      })),
    [certePlusActive],
  );

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="relative mx-auto flex h-14 max-w-lg items-center justify-between px-4 md:h-16 md:max-w-4xl md:px-6 lg:max-w-6xl">
          <Link href="/" className="flex items-center gap-1">
            <CerteLogo size={24} />
            <span className="text-sm font-extrabold tracking-tight text-foreground">
              certe
            </span>
            {certePlusActive && (
              <span className="text-lg font-bold tracking-wide text-primary">+</span>
            )}
          </Link>

          <div className="flex items-center gap-1 rounded-2xl border border-border/50 bg-muted/60 px-1.5 py-1 shadow-sm backdrop-blur-sm">
            <ThemeToggle />

            <ParentNotificationBell
              parentId={session?.user?.id}
              className="h-9 w-9 rounded-xl"
            />

            {parentMode === "canteen" && (
              <>
                <button
                  type="button"
                  aria-label="Open cart drawer"
                  onClick={() => setCartDrawerOpen(true)}
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-accent"
                >
                  <ShoppingCart
                    className={cn(
                      "h-[17px] w-[17px] text-foreground/80",
                      cartBounce && "animate-bounce",
                    )}
                  />
                  {cartCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                    >
                      {cartCount}
                    </motion.span>
                  )}
                </button>

                {!isGeneralAccount && (
                  <button
                    type="button"
                    aria-label="Open wallet drawer"
                    onClick={() => setWalletDrawerOpen(true)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-accent"
                  >
                    <Wallet className="h-[17px] w-[17px] text-foreground/80" />
                  </button>
                )}
              </>
            )}

            {session && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-accent">
                    <Avatar className="h-7 w-7 ring-1 ring-primary/20">
                      <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                        {getInitials(session.user?.name)}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-2xl">
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold">{session.user?.name}</p>
                    <p className="text-xs text-muted-foreground">{session.user?.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      signOut({
                        fetchOptions: {
                          onSuccess: () => {
                            window.location.href = "/login";
                          },
                        },
                      })
                    }
                    className="mx-1 gap-2 rounded-xl text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-lg px-4 pb-2 md:max-w-4xl lg:max-w-6xl">
          <div className="relative flex items-center justify-around gap-1 rounded-[26px] border border-border/50 bg-background/95 px-2 py-2 shadow-lg backdrop-blur-xl">
            {tabs.map((tab) => {
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
                  className="relative flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2"
                >
                  {isActive && (
                    <motion.div
                      layoutId="tab-pill"
                      className="absolute inset-x-1 inset-y-0.5 rounded-2xl bg-primary/10 dark:bg-primary/15"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <motion.div
                    whileTap={{ scale: 0.85 }}
                    className="relative z-10 flex flex-col items-center gap-0.5"
                  >
                    <Icon
                      className={cn(
                        "h-[20px] w-[20px] transition-colors duration-200",
                        isActive ? "text-primary" : "text-muted-foreground",
                      )}
                      strokeWidth={isActive ? 2.5 : 1.8}
                    />
                    <span
                      className={cn(
                        "text-[11px] leading-tight transition-colors duration-200",
                        isActive
                          ? "font-semibold text-primary"
                          : "font-medium text-muted-foreground",
                      )}
                    >
                      {tab.label}
                    </span>
                  </motion.div>

                  {tab.key === "library" && overdueCount > 0 && (
                    <span className="absolute right-[18%] top-0.5 z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
                      {overdueCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
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
                    void router.push("/wallet");
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  Open Wallet
                </Button>
              </div>
            </div>
          </BottomSheet>
        </>
      ) : (
        <>
          <Sheet open={cartDrawerOpen} onOpenChange={setCartDrawerOpen}>
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

          <Sheet open={walletDrawerOpen} onOpenChange={setWalletDrawerOpen}>
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
                      void router.push("/wallet");
                    }}
                  >
                    <Sparkles className="h-4 w-4" />
                    Open Wallet
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
              void router.push("/settings");
            }}
          >
            Upgrade to Certe+
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
