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
import Image from "next/image";

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
  const pathname = usePathname();
  const cartCount = useCartStore((s) => s.getItemCount());
  const [overdueCount, setOverdueCount] = useState(0);
  const [cartBounce, setCartBounce] = useState(false);
  const prevCartCount = useRef(cartCount);

  const parentMode = getParentMode(pathname);
  const isSettingsPage = ["/settings", "/children", "/wallet", "/controls"].includes(pathname);

  // Animate cart icon when items are added
  useEffect(() => {
    if (cartCount > prevCartCount.current) {
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
            <Image
              src="/cropped-logo-venus-1-2.png"
              alt="Logo"
              width={50}
              height={50}
            />
          </Link>

          {/* Right: cart + wallet + avatar */}
          <div className="flex items-center gap-2">
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
                <Link
                  href="/wallet"
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-full"
                >
                  <Wallet className="h-5 w-5" />
                </Link>
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
      <div className="pb-20">{children}</div>

      {/* ── Bottom tab bar (mobile-first) ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
          {/* Canteen */}
          <Link
            href="/menu"
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors",
              parentMode === "canteen" && !isSettingsPage
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            <UtensilsCrossed className="h-5 w-5" />
            <span className="text-[10px] font-medium">Canteen</span>
          </Link>

          {/* Orders */}
          <Link
            href="/orders"
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors",
              pathname === "/orders" || pathname === "/pre-orders"
                ? "text-foreground"
                : "text-muted-foreground",
            )}
          >
            <ClipboardList className="h-5 w-5" />
            <span className="text-[10px] font-medium">Orders</span>
          </Link>

          {/* Library */}
          <Link
            href="/library-history"
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors",
              parentMode === "library"
                ? "text-foreground"
                : "text-muted-foreground",
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
              "flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors",
              isSettingsPage
                ? "text-foreground"
                : "text-muted-foreground",
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
