"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/management", label: "Home", icon: LayoutGrid },
  { href: "/management/cards", label: "Cards", icon: CreditCard },
  { href: "/management/students", label: "Students", icon: GraduationCap },
  { href: "/management/parents", label: "Parents", icon: Users },
  { href: "/management/bulk-upload", label: "Bulk Upload", icon: Upload },
  { href: "/management/statistics", label: "Statistics", icon: BarChart3 },
  { href: "/management/audit", label: "Audit Log", icon: ScrollText },
  { href: "/management/library/books", label: "Library", icon: BookOpen },
];

export function ManagementNav() {
  const pathname = usePathname();

  return (
    <div className="border-b bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
          <Settings className="h-5 w-5 text-[#1a3a8f] mr-2 shrink-0" />
          <span className="font-bold text-lg hidden sm:inline shrink-0">Management</span>
          <nav className="flex items-center gap-1 ml-4">
            {links.map(({ href, label, icon: Icon }) => {
              const isActive =
                href === "/management/library/books"
                  ? pathname.startsWith("/management/library")
                  : pathname === href;
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
