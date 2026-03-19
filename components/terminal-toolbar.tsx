"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrgSwitcher } from "@/components/org-switcher";
import { signOut } from "@/lib/auth-client";

type TerminalToolbarProps = {
  title: string;
  homeHref: string;
};

export function TerminalToolbar({ title, homeHref }: TerminalToolbarProps) {
  function handleSignOut() {
    signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/login";
        },
      },
    });
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 md:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold md:text-base">{title}</p>
        </div>
        <div className="flex items-center gap-2">
          <OrgSwitcher />
          <Button variant="outline" size="sm" asChild>
            <Link href={homeHref}>Home</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
}
