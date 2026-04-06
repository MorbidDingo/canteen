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
  ClipboardList,
  LogOut,
  LayoutDashboard,
  Menu,
  X,
  CalendarClock,
  BookOpen,
  Settings,
  Wallet,
  Brain,
  History,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { Badge } from "@/components/ui/badge";
import { CerteWordmark } from "@/components/certe-logo";
import { CanteenSelector } from "@/components/canteen-selector";
import { LibrarySelector } from "@/components/library-selector";
import { usePersistedSelection } from "@/lib/use-persisted-selection";

const canteenLinks = [
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/orders", label: "My Orders", icon: ClipboardList },
  { href: "/pre-orders", label: "Pre-Orders", icon: CalendarClock },
];

const libraryLinks = [
  { href: "/library-reader", label: "Reader", icon: BookOpen },
  { href: "/library-history", label: "History", icon: BookOpen },
];

const adminCanteenLinks = [
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/metrics", label: "Metrics", icon: Gauge },
  { href: "/admin/history", label: "History", icon: History },
  { href: "/admin/analytics", label: "Analytics", icon: Brain },
  { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
];

type ParentMode = "canteen" | "library";

function getParentMode(pathname: string): ParentMode {
  if (pathname.startsWith("/library")) return "library";
  return "canteen";
}

export function Navbar() {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const cartCount = useCartStore((s) => s.getItemCount());
  const [overdueCount, setOverdueCount] = useState(0);
  const [cartBounce, setCartBounce] = useState(false);
  const { value: selectedCanteen, setValue: setSelectedCanteen } = usePersistedSelection(
    "certe:selected-canteen-id",
  );
  const { value: selectedLibrary, setValue: setSelectedLibrary } = usePersistedSelection(
    "certe:selected-library-id",
  );
  const prevCartCount = useRef(cartCount);

  // Animate cart icon when items are added
  useEffect(() => {
    if (cartCount > prevCartCount.current) {
      const start = setTimeout(() => setCartBounce(true), 0);
      const stop = setTimeout(() => setCartBounce(false), 400);
      return () => {
        clearTimeout(start);
        clearTimeout(stop);
      };
    }
    prevCartCount.current = cartCount;
  }, [cartCount]);

  const role = session?.user?.role;
  const isParent = role === "PARENT" || (role && !["ADMIN", "OPERATOR", "MANAGEMENT", "LIB_OPERATOR"].includes(role));
  const isAdmin = role === "ADMIN";
  const isParentAreaPath = [
    "/menu",
    "/cart",
    "/orders",
    "/pre-orders",
    "/library-reader",
    "/library-history",
    "/library-showcase",
    "/settings",
    "/children",
    "/wallet",
    "/controls",
    "/notifications",
    "/assignments",
    "/calendar",
    "/timetable",
    "/certe-pass",
    "/content",
    "/events",
    "/messaging-settings",
  ].some((p) => pathname.startsWith(p));

  const parentMode = getParentMode(pathname);


  // Fetch overdue count for parent users
  useEffect(() => {
    if (!isParent) return;
    fetch("/api/library/history")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.overdueCount) setOverdueCount(data.overdueCount);
      })
      .catch(() => {});
  }, [isParent]);

  // Operator, Management, Library Operator have their own layouts with built-in nav
  // Parent users (and parent area paths) also have a dedicated layout with bottom tabs
  if (isPending && isParentAreaPath) return null;
  if (role === "OPERATOR" || role === "MANAGEMENT" || role === "LIB_OPERATOR") return null;
  if (isParent || isParentAreaPath) return null;

  // Kiosk has its own layout — no navbar
  if (pathname.startsWith("/kiosk") || pathname.startsWith("/library/")) return null;

  const links = isAdmin
    ? adminCanteenLinks
    : parentMode === "library" ? libraryLinks : canteenLinks;

  const getInitials = (name?: string | null) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const isSettingsPage = ["/settings", "/children", "/wallet", "/controls"].includes(pathname);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60",
        )}
      >
        <div className="container mx-auto flex h-14 md:h-16 items-center justify-between px-4 md:px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <CerteWordmark className="text-2xl" />
          </Link>

          {/* Desktop: Mode toggle for parents */}
          {/* Mode toggle — visible on all screen sizes */}
          {session && isParent && (
            <div className="flex items-center bg-muted rounded-lg p-1 gap-0.5">
              <Link href="/menu">
                <Button
                  variant={parentMode === "canteen" ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-1.5 rounded-md h-8 px-2.5 md:px-3",
                    parentMode === "canteen" && "shadow-sm",
                  )}
                >
                  <UtensilsCrossed className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline text-sm">Canteen</span>
                </Button>
              </Link>
              <Link href="/library-reader">
                <Button
                  variant={parentMode === "library" ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-1.5 rounded-md h-8 px-2.5 md:px-3 relative",
                    parentMode === "library" && "shadow-sm",
                  )}
                >
                  <BookOpen className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline text-sm">Library</span>
                  {overdueCount > 0 && (
                    <Badge variant="destructive" className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center">
                      {overdueCount}
                    </Badge>
                  )}
                </Button>
              </Link>
            </div>
          )}

          {/* Show canteen/library name for parents */}
          {session && isParent && parentMode === "canteen" && (
            <CanteenSelector value={selectedCanteen} onChange={setSelectedCanteen} showAll compact />
          )}
          {session && isParent && parentMode === "library" && (
            <LibrarySelector value={selectedLibrary} onChange={setSelectedLibrary} showAll compact />
          )}



          {/* Desktop Nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {session &&
              links.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <Button
                    variant={pathname === href ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "gap-2 relative",
                      pathname === href && "font-semibold",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                </Link>
              ))}
            {/* Desktop: Cart link with badge */}
            {session && isParent && parentMode === "canteen" && (
              <>
              <Link href="/cart">
                <Button
                  variant={pathname === "/cart" ? "secondary" : "ghost"}
                  size="sm"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Cart
                  {cartCount > 0 && (
                    <Badge className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center">
                      {cartCount}
                    </Badge>
                  )}
                </Button>
              </Link>
                                </>
            )}
            {/* Desktop: Settings links */}
            {session && isParent && (
              <>
              <Link href="/settings">
                <Button
                  variant={isSettingsPage ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-2 relative",
                    isSettingsPage && "font-semibold",
                  )}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Button>
              </Link>
              <Link href="/wallet">
                <Button
                  variant={isSettingsPage ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-2 relative",
                    isSettingsPage && "font-semibold",
                  )}
                >
                  <Wallet className="h-4 w-4" />
                  Wallet
                </Button>
                </Link>
                </>
            )}
                
          </nav>
          

          {/* Right side: cart + auth */}
          <div className="flex items-center gap-1 rounded-2xl border border-border/50 bg-muted/50 px-1.5 py-1 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
            {/* Mobile cart icon — canteen only */}
            {/* Mobile cart icon — canteen only */}
            {session && isParent && parentMode === "canteen" && (
              <Link
                href="/cart"
                className="md:hidden relative inline-flex h-8 w-8 items-center justify-center rounded-full"
              >
                <ShoppingCart className={cn("h-5 w-5", cartBounce && "animate-bounce")} />
                {cartCount > 0 && (
                  <span
                    className={cn(
                      "absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center transition-transform",
                      cartBounce && "scale-125",
                    )}
                  >
                    {cartCount}
                  </span>
                )}
              </Link>
            )}
            {isPending ? (
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            ) : session ? (
              <>
                {/* Admin keeps the avatar dropdown + hamburger */}
                {isAdmin && (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-full">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
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
                        <DropdownMenuItem asChild>
                          <Link href="/admin/orders" className="gap-2">
                            <LayoutDashboard className="h-4 w-4" />
                            Admin Dashboard
                          </Link>
                        </DropdownMenuItem>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="md:hidden"
                      onClick={() => setMobileOpen(!mobileOpen)}
                    >
                      {mobileOpen ? (
                        <X className="h-5 w-5" />
                      ) : (
                        <Menu className="h-5 w-5" />
                      )}
                    </Button>
                  </>
                )}

                {/* Parent mobile: circle with initials (replaces hamburger) */}
                {isParent && (
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
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm">Register</Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Admin mobile nav (existing behavior) */}
        {mobileOpen && session && isAdmin && (
          <nav className="border-t md:hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="container mx-auto flex flex-col gap-1 px-4 py-2">
              {links.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
                  <Button
                    variant={pathname === href ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start gap-2",
                      pathname === href && "font-semibold",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>
    </>
  );
}
