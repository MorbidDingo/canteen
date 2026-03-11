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
  BarChart3,
  Users,
  Wallet,
  Shield,
  CalendarClock,
  BookOpen,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

const canteenLinks = [
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/cart", label: "Cart", icon: ShoppingCart },
  { href: "/orders", label: "My Orders", icon: ClipboardList },
  { href: "/children", label: "Children", icon: Users },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/controls", label: "Controls", icon: Shield },
  { href: "/pre-orders", label: "Pre-Orders", icon: CalendarClock },
];

const libraryLinks = [
  { href: "/library-history", label: "Library", icon: BookOpen },
];

const adminLinks = [
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/admin/statistics", label: "Statistics", icon: BarChart3 },
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

  const role = session?.user?.role;
  const isParent = role === "PARENT" || (role && !["ADMIN", "OPERATOR", "MANAGEMENT", "LIB_OPERATOR"].includes(role));
  const isAdmin = role === "ADMIN";

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

  // Operator, Management, and Library Operator have their own layouts with built-in nav
  if (role === "OPERATOR" || role === "MANAGEMENT" || role === "LIB_OPERATOR") return null;

  // Kiosk has its own layout — no navbar
  if (pathname.startsWith("/kiosk") || pathname.startsWith("/library/")) return null;

  const links = isAdmin ? adminLinks : parentMode === "library" ? libraryLinks : canteenLinks;

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
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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

          {/* Desktop: Mode toggle for parents */}
          {session && isParent && (
            <div className="hidden md:flex items-center bg-muted rounded-lg p-1">
              <Link href="/menu">
                <Button
                  variant={parentMode === "canteen" ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-1.5 rounded-md text-sm",
                    parentMode === "canteen" && "shadow-sm",
                  )}
                >
                  <UtensilsCrossed className="h-4 w-4" />
                  Canteen
                </Button>
              </Link>
              <Link href="/library-history">
                <Button
                  variant={parentMode === "library" ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "gap-1.5 rounded-md text-sm relative",
                    parentMode === "library" && "shadow-sm",
                  )}
                >
                  <BookOpen className="h-4 w-4" />
                  Library
                  {overdueCount > 0 && (
                    <Badge variant="destructive" className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center">
                      {overdueCount}
                    </Badge>
                  )}
                </Button>
              </Link>
            </div>
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
                    {href === "/cart" && cartCount > 0 && (
                      <Badge className="absolute -top-1.5 -right-1.5 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center">
                        {cartCount}
                      </Badge>
                    )}
                  </Button>
                </Link>
              ))}
          </nav>

          {/* Right side: auth */}
          <div className="flex items-center gap-2">
            {isPending ? (
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            ) : session ? (
              <>
                {/* Admin keeps the avatar dropdown */}
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

                {/* Parent: hamburger contains user info + signout */}
                {isParent && (
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
                )}

                {/* Desktop parent: just a small avatar with signout dropdown */}
                {isParent && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full hidden md:inline-flex">
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

        {/* Mobile slide-down nav (inside hamburger for parents) */}
        {mobileOpen && session && isParent && (
          <nav className="border-t md:hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="container mx-auto flex flex-col gap-1 px-4 py-2">
              {/* User info */}
              <div className="flex items-center gap-3 px-2 py-2 mb-1">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="text-xs">
                    {getInitials(session.user?.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{session.user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{session.user?.email}</p>
                </div>
              </div>
              <div className="border-b mb-1" />

              {/* Nav links for current mode */}
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

              <div className="border-b my-1" />
              {/* Sign out */}
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                onClick={() => {
                  setMobileOpen(false);
                  signOut({
                    fetchOptions: {
                      onSuccess: () => {
                        window.location.href = "/login";
                      },
                    },
                  });
                }}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
          </nav>
        )}

        {/* Admin mobile nav (existing behavior) */}
        {mobileOpen && session && isAdmin && (
          <nav className="border-t md:hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="container mx-auto flex flex-col gap-1 px-4 py-2">
              {adminLinks.map(({ href, label, icon: Icon }) => (
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

      {/* Mobile bottom tab bar for parents — Canteen / Library toggle */}
      {session && isParent && (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex">
            <Link
              href="/menu"
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors",
                parentMode === "canteen"
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              <UtensilsCrossed className="h-5 w-5" />
              <span className="text-[11px] font-medium">Canteen</span>
            </Link>
            <Link
              href="/library-history"
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors relative",
                parentMode === "library"
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              <BookOpen className="h-5 w-5" />
              <span className="text-[11px] font-medium">Library</span>
              {overdueCount > 0 && (
                <Badge variant="destructive" className="absolute top-1 right-1/4 h-4 min-w-4 px-1 text-[9px] flex items-center justify-center">
                  {overdueCount}
                </Badge>
              )}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
