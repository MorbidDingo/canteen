"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CerteLogo } from "@/components/certe-logo";
import { useSession } from "@/lib/auth-client";

function getDefaultRouteForRole(role?: string | null) {
  switch (role) {
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

export default function RootSplashPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isPending) return;
    if (session?.user) {
      router.replace(getDefaultRouteForRole(session.user.role));
      return;
    }
    router.replace("/landing");
  }, [session, isPending, router]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-4 px-4">
      <CerteLogo size={110} />
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
