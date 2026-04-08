"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

type OrgContextDevice = {
  id: string;
  deviceType: "GATE" | "KIOSK" | "LIBRARY";
};

const BRAND_TEXT = "Certe";

function getDefaultRouteForRole(role?: string | null) {
  switch (role) {
    case "OWNER":
      return "/owner";
    case "ADMIN":
      return "/admin/orders";
    case "OPERATOR":
      return "/operator/topup";
    case "MANAGEMENT":
      return "/management";
    case "LIB_OPERATOR":
      return "/lib-operator/dashboard";
    case "ATTENDANCE":
      return "/attendance";
    default:
      return "/menu";
  }
}

function getTerminalRoute(devices: OrgContextDevice[]): string | null {
  if (devices.some((d) => d.deviceType === "GATE")) {
    return "/gate";
  }

  if (devices.some((d) => d.deviceType === "LIBRARY")) {
    return "/library";
  }

  if (devices.some((d) => d.deviceType === "KIOSK")) {
    return "/kiosk";
  }

  return null;
}

export default function RootSplashPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [visibleChars, setVisibleChars] = useState(1);
  const [minimumDelayDone, setMinimumDelayDone] = useState(false);
  const revealIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    revealIntervalRef.current = setInterval(() => {
      setVisibleChars((prev) => {
        if (prev >= BRAND_TEXT.length) {
          if (revealIntervalRef.current) {
            clearInterval(revealIntervalRef.current);
            revealIntervalRef.current = null;
          }
          return prev;
        }
        return prev + 1;
      });
    }, 180);

    const minimumDelayTimeout = setTimeout(() => {
      setMinimumDelayDone(true);
      setVisibleChars(BRAND_TEXT.length);
      if (revealIntervalRef.current) {
        clearInterval(revealIntervalRef.current);
        revealIntervalRef.current = null;
      }
    }, 1500);

    return () => {
      if (revealIntervalRef.current) {
        clearInterval(revealIntervalRef.current);
        revealIntervalRef.current = null;
      }
      clearTimeout(minimumDelayTimeout);
    };
  }, []);

  useEffect(() => {
    if (!minimumDelayDone || isPending) return;
    if (session?.user) {
      const resolveAndRedirect = async () => {
        const role = session.user.role;
        if (["OPERATOR", "LIB_OPERATOR", "ATTENDANCE", "DEVICE"].includes(role || "")) {
          try {
            const res = await fetch("/api/org/context", { cache: "no-store" });
            if (res.ok) {
              const data = (await res.json()) as { devices?: OrgContextDevice[] };
              const terminalRoute = getTerminalRoute(data.devices || []);
              if (terminalRoute) {
                router.replace(terminalRoute);
                return;
              }
            }
          } catch {
            // Fall back to role route when org context is unavailable.
          }
        }

        router.replace(getDefaultRouteForRole(session.user.role));
      };

      void resolveAndRedirect();
      return;
    }
    router.replace("/landing");
  }, [session, isPending, minimumDelayDone, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <span className="font-[var(--font-brand)] text-6xl font-black tracking-[-0.04em] text-primary md:text-7xl">
        {BRAND_TEXT.slice(0, visibleChars)}
      </span>
    </div>
  );
}
