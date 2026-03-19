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
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CerteLogo, CerteWordmark } from "@/components/certe-logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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
      toast.error(error.message || "Invalid email or password");
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
    </div>
  );
}
