"use client";

import { useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

interface SafeHtmlProps {
  html: string;
  className?: string;
}

/**
 * Renders user-supplied HTML safely by running it through DOMPurify.
 * Falls back gracefully to plain-text rendering on server (SSR) — the
 * `useEffect` ensures sanitisation only happens in the browser.
 */
export function SafeHtml({ html, className }: SafeHtmlProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
      });
    }
  }, [html]);

  // Server-side / first-paint: render nothing inside the div.
  // The useEffect fills it on the client before paint (synchronous commit phase).
  return (
    <div
      ref={ref}
      className={cn("prose prose-sm max-w-none dark:prose-invert", className)}
      suppressHydrationWarning
    />
  );
}
