"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BookOpen,
  FileText,
  LayoutDashboard,
  Upload,
  Settings,
  Menu,
  LogOut,
} from "lucide-react";
import { OrgSwitcher } from "@/components/org-switcher";


const links = [
  { href: "/lib-operator/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/lib-operator/books", label: "Books", icon: BookOpen },
  { href: "/lib-operator/digital-books", label: "Digital Books", icon: FileText },
  { href: "/lib-operator/bulk-upload", label: "Bulk Upload", icon: Upload },
  { href: "/lib-operator/settings", label: "Settings", icon: Settings },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/lib-operator/dashboard") {
    return pathname === href;
  }
  return pathname.startsWith(href);
}

function handleSignOut() {
  signOut({
    fetchOptions: {
      onSuccess: () => {
        window.location.href = "/login";
      },
    },
  });
}

export function LibOperatorNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#d4891a] shadow-sm">
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Librarian Console</p>
          </div>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          <OrgSwitcher />
          {links.map(({ href, label, icon: Icon }) => {
            const isActive = isActivePath(pathname, href);
            return (
              <Link key={href} href={href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  className={cn("gap-1.5", isActive && "font-semibold")}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="hidden gap-1.5 text-destructive md:inline-flex"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Library Navigation</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {links.map(({ href, label, icon: Icon }) => (
                <DropdownMenuItem key={href} asChild>
                  <Link href={href} className={cn(isActivePath(pathname, href) && "font-semibold")}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="border-t bg-background/80 md:hidden">
        <div className="container mx-auto flex flex-col gap-2 px-4 py-2">
          <div className="w-full">
            <OrgSwitcher />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
          {links.map(({ href, label, icon: Icon }) => {
            const isActive = isActivePath(pathname, href);
            return (
              <Link key={href} href={href}>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  className={cn("whitespace-nowrap gap-1.5", isActive && "font-semibold")}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              </Link>
            );
          })}
          </div>
        </div>
      </div>
    </header>
  );
}

