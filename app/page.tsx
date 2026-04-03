"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CerteWordmark } from "@/components/certe-logo";
import { useSession } from "@/lib/auth-client";

type OrgContextDevice = {
  id: string;
  deviceType: "GATE" | "KIOSK" | "LIBRARY";
};

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

  useEffect(() => {
    if (isPending) return;
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
  }, [session, isPending, router]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-4 px-4">
      <CerteWordmark className="text-5xl" />
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
