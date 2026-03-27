"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={cn("h-8 w-8", className)} />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative flex h-8 w-8 items-center justify-center rounded-full",
        "text-muted-foreground hover:text-foreground",
        "transition-colors duration-200",
        className,
      )}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Sun className={cn(
        "h-4 w-4 absolute transition-all duration-300",
        isDark ? "scale-0 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
      )} />
      <Moon className={cn(
        "h-4 w-4 absolute transition-all duration-300",
        isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 -rotate-90 opacity-0",
      )} />
    </button>
  );
}
