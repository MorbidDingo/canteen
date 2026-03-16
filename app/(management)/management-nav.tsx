"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutGrid,
  CreditCard,
  BarChart3,
  GraduationCap,
  ScrollText,
  LogOut,
  Settings,
  Users,
  Upload,
  BookOpen,
  Menu,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/management", label: "Home", icon: LayoutGrid },
  { href: "/management/cards", label: "Cards", icon: CreditCard },
  { href: "/management/students", label: "Students", icon: GraduationCap },
  { href: "/management/parents", label: "Parents", icon: Users },
  { href: "/management/bulk-upload", label: "Bulk Upload", icon: Upload },
  { href: "/management/statistics", label: "Statistics", icon: BarChart3 },
  { href: "/management/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/management/audit", label: "Audit Log", icon: ScrollText },
  { href: "/management/library/books", label: "Library", icon: BookOpen },
];

const mobileGroups = [
  {
    label: "Organisational",
    links: [
      { href: "/management", label: "Home", icon: LayoutGrid },
      { href: "/management/cards", label: "Cards", icon: CreditCard },
      { href: "/management/students", label: "Students", icon: GraduationCap },
      { href: "/management/parents", label: "Parents", icon: Users },
      { href: "/management/bulk-upload", label: "Bulk Upload", icon: Upload },
    ],
  },
  {
    label: "Statistics & Logs",
    links: [
      { href: "/management/statistics", label: "Statistics", icon: BarChart3 },
      { href: "/management/attendance", label: "Attendance", icon: ClipboardCheck },
      { href: "/management/audit", label: "Audit Log", icon: ScrollText },
    ],
  },
  {
    label: "Library",
    links: [
      { href: "/management/library/books", label: "Books", icon: BookOpen },
      { href: "/management/library/bulk-upload", label: "Bulk Upload", icon: Upload },
      { href: "/management/library/statistics", label: "Statistics", icon: BarChart3 },
    ],
  },
];

export function ManagementNav() {
  const pathname = usePathname();

  const isLinkActive = (href: string) => {
    if (href.startsWith("/management/library")) {
      return pathname.startsWith("/management/library");
    }
    return pathname === href;
  };

  return (
    <div className="border-b bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-1 min-w-0">
          <Settings className="h-5 w-5 text-[#1a3a8f] mr-2 shrink-0" />
          <span className="font-bold text-lg hidden sm:inline shrink-0">Management</span>
          <nav className="hidden md:flex items-center gap-1 ml-4">
            {links.map(({ href, label, icon: Icon }) => {
              const isActive = isLinkActive(href);
              return (
                <Link key={href} href={href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "gap-1.5 text-xs sm:text-sm",
                      isActive && "font-semibold",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </Button>
                </Link>
              );
            })}
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="md:hidden ml-2">
                <Menu className="h-4 w-4" />
                Menu
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Management Navigation</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {mobileGroups.map((group) => (
                <DropdownMenuSub key={group.label}>
                  <DropdownMenuSubTrigger>{group.label}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    {group.links.map(({ href, label, icon: Icon }) => (
                      <DropdownMenuItem key={href} asChild>
                        <Link href={href} className={cn(isLinkActive(href) && "font-semibold")}>
                          <Icon className="h-4 w-4" />
                          {label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            signOut({
              fetchOptions: {
                onSuccess: () => {
                  window.location.href = "/login";
                },
              },
            })
          }
          className="gap-2 text-destructive"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </Button>
      </div>
    </div>
  );
}
