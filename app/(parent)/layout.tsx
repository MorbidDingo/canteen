"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { CerteLogo, CerteWordmark } from "@/components/certe-logo";
import { ParentNotificationBell } from "@/components/parent-notification-bell";

type ParentMode = "canteen" | "library";

function getParentMode(pathname: string): ParentMode {
  if (pathname.startsWith("/library")) return "library";
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
  const cartCount = useCartStore((s) => s.getItemCount());
  const [overdueCount, setOverdueCount] = useState(0);
  const certePlusActive = useCertePlusStore((s) => s.status?.active === true);
  const ensureCertePlusFresh = useCertePlusStore((s) => s.ensureFresh);
  const [cartBounce, setCartBounce] = useState(false);
  const [navDimmed, setNavDimmed] = useState(false);
  const [activeOrganizationName, setActiveOrganizationName] = useState("");
  const prevCartCount = useRef(cartCount);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parentMode = getParentMode(pathname);
  const isSettingsPage = ["/settings", "/children", "/wallet", "/controls", "/notifications"].includes(pathname);
  const isOrdersPage = pathname === "/orders" || pathname === "/pre-orders";

  // Animate cart icon when items are added
  useEffect(() => {
    if (cartCount > prevCartCount.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCartBounce(true);
      const t = setTimeout(() => setCartBounce(false), 400);
      return () => clearTimeout(t);
    }
    prevCartCount.current = cartCount;
  }, [cartCount]);

  // Fetch overdue count
  useEffect(() => {
    fetch("/api/library/history")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.overdueCount) setOverdueCount(data.overdueCount);
      })
      .catch(() => {});
  }, []);

  // Keep Certe+ status warm for all parent screens.
  useEffect(() => {
    void ensureCertePlusFresh(45_000);
  }, [ensureCertePlusFresh]);

  // Resolve active organization name for visibility in the parent UI.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [membershipsRes, activeRes] = await Promise.all([
          fetch("/api/org/memberships", { cache: "no-store" }),
          fetch("/api/org/active", { cache: "no-store" }),
        ]);

        if (!membershipsRes.ok || !activeRes.ok || cancelled) return;

        const membershipsData = (await membershipsRes.json()) as {
          memberships?: Array<{ organizationId: string; organizationName: string }>;
        };
        const activeData = (await activeRes.json()) as { activeOrganizationId: string | null };

        const memberships = membershipsData.memberships ?? [];
        const activeId = activeData.activeOrganizationId ?? memberships[0]?.organizationId;
        const active = memberships.find((m) => m.organizationId === activeId) ?? memberships[0];

        if (!cancelled) {
          setActiveOrganizationName(active?.organizationName ?? "");
        }
      } catch {
        // Keep UI functional even if org lookup fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Dim content area below bottom nav while scrolling
  useEffect(() => {
    const handleScroll = () => {
      setNavDimmed(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => setNavDimmed(false), 800);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  const getInitials = (name?: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <>
      {/* ── Minimal top header ── */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <CerteLogo size={36} />
            <div className="flex flex-col leading-tight">
              <CerteWordmark className="text-lg" showPlus={certePlusActive} />
              {activeOrganizationName && (
                <span className="text-[10px] font-medium text-muted-foreground truncate max-w-[200px]">
                  {activeOrganizationName}
                </span>
              )}
            </div>
          </Link>

          {/* Right: cart + wallet + avatar */}
          <div className="flex items-center gap-2">
            <ParentNotificationBell parentId={session?.user?.id} />

            {parentMode === "canteen" && (
              <>
                <Link
                  href="/cart"
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-full"
                >
                  <ShoppingCart
                    className={cn("h-5 w-5", cartBounce && "animate-bounce")}
                  />
                  {cartCount > 0 && (
                    <span
                      className={cn(
                        "absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] font-bold bg-foreground text-background rounded-full flex items-center justify-center transition-transform",
                        cartBounce && "scale-125",
                      )}
                    >
                      {cartCount}
                    </span>
                  )}
                </Link>
                {!isGeneralAccount && (
                  <Link
                    href="/wallet"
                    className="relative inline-flex h-9 w-9 items-center justify-center rounded-full"
                  >
                    <Wallet className="h-5 w-5" />
                  </Link>
                )}
              </>
            )}

            {session && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs font-semibold">
                        {getInitials(session.user?.name)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{session.user?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.user?.email}
                    </p>
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
                    className="gap-2 text-destructive focus:text-destructive"
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

      {/* ── Page content ── */}
      <div className="relative pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {children}
        {/* Scroll dim overlay — dims content area near the bottom nav */}
        <div
          className={cn(
            "pointer-events-none fixed bottom-0 left-0 right-0 h-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 transition-opacity duration-300",
            navDimmed ? "opacity-100" : "opacity-0",
          )}
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.10) 0%, transparent 100%)" }}
        />
      </div>

      {/* ── iOS-like floating bottom tab bar ── */}
      <nav className="fixed bottom-3 left-3 right-3 z-50 rounded-2xl border border-white/20 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] supports-backdrop-filter:bg-white/50 dark:supports-backdrop-filter:bg-gray-900/50 ios-bottom-nav">
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2">
          {/* Canteen */}
          <Link
            href="/menu"
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition-all",
              parentMode === "canteen" && !isSettingsPage && !isOrdersPage
                ? "text-foreground bg-white/50 dark:bg-white/10 shadow-sm"
                : "text-muted-foreground hover:text-foreground/70",
            )}
          >
            <UtensilsCrossed className="h-5 w-5" />
            <span className="text-[10px] font-medium">Canteen</span>
          </Link>

          {/* Orders */}
          <Link
            href="/orders"
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition-all",
              pathname === "/orders" || pathname === "/pre-orders"
                ? "text-foreground bg-white/50 dark:bg-white/10 shadow-sm"
                : "text-muted-foreground hover:text-foreground/70",
            )}
          >
            <ClipboardList className="h-5 w-5" />
            <span className="text-[10px] font-medium">Orders</span>
          </Link>

          {/* Library */}
          <Link
            href="/library-history"
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition-all",
              parentMode === "library"
                ? "text-foreground bg-white/50 dark:bg-white/10 shadow-sm"
                : "text-muted-foreground hover:text-foreground/70",
            )}
          >
            <BookOpen className="h-5 w-5" />
            <span className="text-[10px] font-medium">Library</span>
            {overdueCount > 0 && (
              <span className="absolute top-0 right-1/4 h-4 min-w-4 px-1 text-[9px] font-bold bg-destructive text-white rounded-full flex items-center justify-center">
                {overdueCount}
              </span>
            )}
          </Link>

          {/* Settings */}
          <Link
            href="/settings"
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-2 transition-all",
              isSettingsPage
                ? "text-foreground bg-white/50 dark:bg-white/10 shadow-sm"
                : "text-muted-foreground hover:text-foreground/70",
            )}
          >
            <Settings className="h-5 w-5" />
            <span className="text-[10px] font-medium">Settings</span>
          </Link>
        </div>
        {/* Safe area spacer for notched phones */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </>
  );
}
