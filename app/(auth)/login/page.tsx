"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signOut, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, EyeOff, Loader2, Monitor, Smartphone, Globe, X } from "lucide-react";
import { toast } from "sonner";
import { CerteLogo, CerteWordmark } from "@/components/certe-logo";

type DeviceSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDeviceDialog, setShowDeviceDialog] = useState(false);
  const [deviceSessions, setDeviceSessions] = useState<DeviceSession[]>([]);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  const getDefaultRouteForRole = useCallback((role?: string | null) => {
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
      case "DEVICE":
        return "/";
      default:
        return "/menu";
    }
  }, []);

  async function initializeActiveOrganization() {
    try {
      await fetch("/api/org/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      // Ignore if user has no org memberships (e.g. parent account)
    }
  }

  const resolvePostLoginRoute = useCallback(async (role?: string | null) => {
    if (role === "OWNER") {
      try {
        const platformRes = await fetch("/api/platform/me", { cache: "no-store" });
        if (platformRes.ok) {
          return "/platform";
        }
      } catch {
        // Ignore and fallback to org/default route
      }
    }

    return getDefaultRouteForRole(role);
  }, [getDefaultRouteForRole]);

  const hasActiveOrganizationMembership = useCallback(async () => {
    try {
      const membershipsRes = await fetch("/api/org/memberships", { cache: "no-store" });
      if (!membershipsRes.ok) return false;
      const data = (await membershipsRes.json()) as { memberships?: Array<{ organizationId: string }> };
      return (data.memberships?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }, []);

  const enforceOrganizationLinkOrSignOut = useCallback(async (role?: string | null) => {
    if (role === "OWNER") return true;

    const hasMembership = await hasActiveOrganizationMembership();
    if (hasMembership) return true;

    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/login";
        },
      },
    });
    return false;
  }, [hasActiveOrganizationMembership]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await authClient.getSession();
      if (cancelled || !session?.data?.user) return;

      const allowed = await enforceOrganizationLinkOrSignOut(session.data.user.role);
      if (!allowed || cancelled) {
        toast.error("This account is not linked to an active organization. Contact your organization admin.");
        return;
      }

      await initializeActiveOrganization();
      const nextRoute = await resolvePostLoginRoute(session.data.user.role);
      router.replace(nextRoute);
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [router, enforceOrganizationLinkOrSignOut, resolvePostLoginRoute]);

  async function resolveRoleWithRetry() {
    for (let attempt = 0; attempt < 4; attempt++) {
      const session = await authClient.getSession();
      const role = session?.data?.user?.role;
      if (role) return role;
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    const { error } = await signIn.email({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      // Session limit reached — user is already logged in on max devices
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("session") || error.status === 403) {
        // Fetch active sessions so user can choose which to revoke
        try {
          const res = await fetch("/api/auth/device-sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          if (res.ok) {
            const data = await res.json();
            setDeviceSessions(data.sessions ?? []);
            setShowDeviceDialog(true);
          } else {
            toast.error("You are already logged in on the maximum number of devices. Please log out from another device first.");
          }
        } catch {
          toast.error("You are already logged in on the maximum number of devices. Please log out from another device first.");
        }
      } else {
        toast.error(error.message || "Invalid email or password");
      }
      return;
    }

    toast.success("Signed in successfully!");

    await initializeActiveOrganization();
    const role = await resolveRoleWithRetry();

    const allowed = await enforceOrganizationLinkOrSignOut(role);
    if (!allowed) {
      toast.error("This account is not linked to an active organization. Contact your organization admin.");
      return;
    }
    const nextRoute = await resolvePostLoginRoute(role);
    router.push(nextRoute);
    router.refresh();
  };

  async function handleRevokeSession(sessionId: string) {
    setRevokingSessionId(sessionId);
    try {
      const res = await fetch("/api/auth/device-sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, sessionId }),
      });
      if (!res.ok) {
        toast.error("Failed to revoke session");
        return;
      }
      toast.success("Device logged out. Signing you in...");
      setShowDeviceDialog(false);
      setDeviceSessions([]);
      // Retry login
      await handleSubmit(new Event("submit") as unknown as React.FormEvent);
    } catch {
      toast.error("Failed to revoke session");
    } finally {
      setRevokingSessionId(null);
    }
  }

  function parseDeviceName(ua: string | null): { icon: "mobile" | "desktop" | "unknown"; label: string } {
    if (!ua) return { icon: "unknown", label: "Unknown device" };
    const lower = ua.toLowerCase();
    if (lower.includes("mobile") || lower.includes("android") || lower.includes("iphone")) {
      return { icon: "mobile", label: "Mobile device" };
    }
    // Extract browser name
    if (lower.includes("chrome")) return { icon: "desktop", label: "Chrome browser" };
    if (lower.includes("firefox")) return { icon: "desktop", label: "Firefox browser" };
    if (lower.includes("safari")) return { icon: "desktop", label: "Safari browser" };
    if (lower.includes("edge")) return { icon: "desktop", label: "Edge browser" };
    return { icon: "desktop", label: "Desktop device" };
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md animate-scale-in">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2">
            <CerteLogo size={60} />
          </div>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in to your <CerteWordmark /> account
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="parent@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-primary transition-colors"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="text-right">
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full active:scale-[0.98] transition-transform mt-2"
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
            <p className="text-sm text-muted-foreground">
              Need tenant onboarding or staff access?{" "}
              <Link href="/register" className="font-medium text-primary hover:underline">
                Request Access
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>

      {/* Device limit dialog */}
      <Dialog open={showDeviceDialog} onOpenChange={setShowDeviceDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Device Limit Reached</DialogTitle>
            <DialogDescription>
              You&apos;re logged in on {deviceSessions.length} device{deviceSessions.length !== 1 ? "s" : ""}. Log out from one to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {deviceSessions.map((session) => {
              const device = parseDeviceName(session.userAgent);
              const loginDate = new Date(session.createdAt);
              return (
                <div
                  key={session.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    {device.icon === "mobile" ? (
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                    ) : device.icon === "desktop" ? (
                      <Monitor className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Globe className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{device.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.ipAddress && `${session.ipAddress} · `}
                      {loginDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                    disabled={revokingSessionId === session.id}
                    onClick={() => handleRevokeSession(session.id)}
                  >
                    {revokingSessionId === session.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Log out"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
