"use client";

import { useEffect, useState, useCallback } from "react";
import { Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function PwaRegister() {
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        // If SW registration fails, app still works in online mode.
      }
    };

    void register();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect iOS/iPadOS
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!isIOS) return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as unknown as { standalone: boolean }).standalone);

    // Only show prompt if NOT already in standalone PWA mode
    if (isStandalone) return;

    const dismissKey = "ios-pwa-prompt-dismissed";
    if (window.localStorage.getItem(dismissKey)) return;

    // Show after a short delay so the page loads first
    const timer = setTimeout(() => setShowIOSPrompt(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const dismissIOSPrompt = useCallback(() => {
    setShowIOSPrompt(false);
    window.localStorage.setItem("ios-pwa-prompt-dismissed", "1");
  }, []);

  return (
    <>
      {showIOSPrompt && (
        <Dialog open={showIOSPrompt} onOpenChange={setShowIOSPrompt}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-center text-base">
                Get instant notifications
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-center text-sm text-muted-foreground">
              <p>
                Add certe to your Home Screen to receive instant
                notifications about orders, gate entries, and more.
              </p>
              <ol className="text-left space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    1
                  </span>
                  <span>
                    Tap the{" "}
                    <Share
                      aria-hidden="true"
                      className="inline h-4 w-4 align-text-bottom"
                    />{" "}
                    <strong>Share</strong> button in Safari
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    2
                  </span>
                  <span>
                    Scroll down and tap{" "}
                    <strong>&quot;Add to Home Screen&quot;</strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    3
                  </span>
                  <span>Open the app from your Home Screen</span>
                </li>
              </ol>
              <p className="text-xs text-muted-foreground/70">
                Push notifications require iOS 16.4 or later.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={dismissIOSPrompt}
            >
              Got it
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
