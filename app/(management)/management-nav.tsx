"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut, useSession } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutGrid,
  CreditCard,
  BarChart3,
  GraduationCap,
  ScrollText,
  LogOut,
  Menu,
  ClipboardCheck,
  BookOpen,
  Upload,
  Users,
  ShieldCheck,
  MonitorCog,
  ChevronsLeft,
  ChevronsRight,
  Landmark,
  Route,
  HandCoins,
  Bell,
  ClipboardList,
  Receipt,
  Sun,
  FileCheck2,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OrgSwitcher } from "@/components/org-switcher";

const links = [
  { href: "/management", label: "Home", icon: LayoutGrid },
  { href: "/management/accounts", label: "Accounts", icon: ShieldCheck },
  { href: "/management/device-accounts", label: "Device Accounts", icon: MonitorCog },
  { href: "/management/parents", label: "Parents", icon: Users },
  { href: "/management/students", label: "Students", icon: GraduationCap },
  { href: "/management/cards", label: "Cards", icon: CreditCard },
  { href: "/management/bulk-upload", label: "Bulk Upload", icon: Upload },
  { href: "/management/notifications", label: "Notices", icon: Bell },
  { href: "/management/exams", label: "Exams", icon: FileCheck2 },
  { href: "/management/holidays", label: "Holidays", icon: Sun },
  { href: "/management/timetable", label: "Timetable", icon: CalendarClock },
  { href: "/management/statistics", label: "Statistics", icon: BarChart3 },
  { href: "/management/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/management/settlement-accounts", label: "Settlement Accounts", icon: Landmark },
  { href: "/management/payment-routing", label: "Payment Routing", icon: Route },
  { href: "/management/settlements", label: "Settlements", icon: HandCoins },
  { href: "/management/payment-events", label: "Payment Events", icon: Receipt },
  { href: "/management/audit", label: "Audit Log", icon: ScrollText },
  { href: "/management/content/permissions", label: "Content Permissions", icon: ClipboardList },
  { href: "/management/content/groups", label: "Content Groups", icon: Users },
  { href: "/management/library/books", label: "Library", icon: BookOpen },
];

function doSignOut() {
  signOut({
    fetchOptions: {
      onSuccess: () => {
        window.location.href = "/login";
      },
    },
  });
}

export function ManagementNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { data: session } = useSession();
  const userName = session?.user?.name;
  const initials = userName
    ? userName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "M";

  useEffect(() => {
    const stored = window.localStorage.getItem("management-nav-collapsed");
    setCollapsed(stored === "1");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("management-nav-collapsed", next ? "1" : "0");
      return next;
    });
  };

  const isLinkActive = (href: string) => {
    if (href.startsWith("/management/library")) return pathname.startsWith("/management/library");
    if (href === "/management") return pathname === "/management";
    return pathname.startsWith(href);
  };

  return (
    <>
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 border-b border-amber-200/70 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 backdrop-blur">
        <div className="h-full px-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xs font-bold shadow-sm">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-amber-600 font-medium leading-none">Management</p>
              {userName && (
                <p className="text-sm font-semibold text-amber-950 leading-tight truncate">{userName}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <OrgSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="border-amber-200 h-8 w-8">
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>Navigation</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {links.map(({ href, label, icon: Icon }) => (
                  <DropdownMenuItem key={href} asChild>
                    <Link href={href} className={cn("gap-2", isLinkActive(href) && "font-semibold")}>
                      <Icon className="h-4 w-4" />
                      {label}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={doSignOut} className="text-destructive focus:text-destructive gap-2">
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <div className="h-14 lg:hidden" />

      <aside
        className={cn(
          "hidden lg:flex fixed top-0 left-0 z-40 h-screen border-r border-amber-200/60 bg-gradient-to-b from-amber-50 to-orange-50/70 backdrop-blur transition-all duration-300",
          collapsed ? "w-20" : "w-64",
        )}
      >
        <div className="flex h-full w-full flex-col p-3">
          <div className="mb-3 flex items-center justify-between rounded-xl border border-amber-200/70 bg-white/60 px-2 py-2">
            {!collapsed && (
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xs font-bold shadow-sm">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-amber-500 font-semibold uppercase tracking-wide leading-none">Management</p>
                  {userName && (
                    <p className="text-sm font-semibold text-amber-950 leading-tight truncate">{userName}</p>
                  )}
                </div>
              </div>
            )}
            {collapsed && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white text-xs font-bold shadow-sm mx-auto">
                {initials}
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 shrink-0 text-amber-800 hover:text-amber-900 hover:bg-amber-100", collapsed && "ml-0")}
              onClick={toggleCollapsed}
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </Button>
          </div>

          {!collapsed && (
            <div className="mb-3 rounded-xl border border-amber-200/70 bg-white/60 p-2">
              <OrgSwitcher />
            </div>
          )}

          <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
            {links.map(({ href, label, icon: Icon }) => {
              const isActive = isLinkActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center rounded-xl px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-amber-900 hover:bg-amber-100",
                    collapsed && "justify-center px-2",
                  )}
                  title={collapsed ? label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={cn("ml-2 truncate", collapsed && "hidden")}>{label}</span>
                </Link>
              );
            })}
          </nav>

          <Button
            type="button"
            variant="ghost"
            className={cn(
              "mt-3 text-destructive hover:text-destructive hover:bg-red-50",
              collapsed ? "justify-center px-2" : "justify-start",
            )}
            onClick={doSignOut}
            title={collapsed ? "Sign Out" : undefined}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={cn("ml-2", collapsed && "hidden")}>Sign Out</span>
          </Button>
        </div>
      </aside>
    </>
  );
}
