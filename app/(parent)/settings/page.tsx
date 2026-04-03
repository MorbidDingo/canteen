"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  ChevronRight,
  Users,
  Wallet,
  MessageSquare,
  Sparkles,
  CheckCircle,
  Loader2,
  Shield,
  Check,
  Clock3,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  CERTE_PLUS_PLAN_LIST,
  CERTE_PLUS_PLANS,
  CERTE_PLUS,
} from "@/lib/constants";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { useSession, signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { ThemeSelector } from "@/components/theme-toggle";

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  close: () => void;
}

const settingItems = [
  {
    href: "/children",
    label: "Children",
    description: "Manage child profiles and cards",
    icon: Users,
  },
  {
    href: "/wallet",
    label: "Wallet",
    description: "Top up and view transactions",
    icon: Wallet,
  },
  {
    href: "/controls",
    label: "Controls",
    description: "Set spending limits and block items",
    icon: Shield,
  },
  {
    href: "/notifications",
    label: "Notifications",
    description: "Search and review activity alerts",
    icon: Bell,
  },
  {
    href: "/messaging-settings",
    label: "Messaging",
    description: "WhatsApp and SMS notification preferences",
    icon: MessageSquare,
  },
];

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const certePlus = useCertePlusStore((s) => s.status);
  const refreshCertePlusStatus = useCertePlusStore((s) => s.refresh);
  const ensureCertePlusFresh = useCertePlusStore((s) => s.ensureFresh);
  const [subscribing, setSubscribing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>("MONTHLY");
  const [certePlusExpanded, setCertePlusExpanded] = useState(false);
  const isGeneralAccount = session?.user?.role === "GENERAL";
  const parentMode = searchParams.get("mode") === "library" ? "library" : "canteen";

  const withParentMode = useCallback(
    (href: string) => {
      const separator = href.includes("?") ? "&" : "?";
      return `${href}${separator}mode=${parentMode}`;
    },
    [parentMode],
  );

  useEffect(() => {
    void ensureCertePlusFresh(45_000);
  }, [ensureCertePlusFresh]);

  useEffect(() => {
    if (typeof window !== "undefined" && !window.Razorpay) {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const openRazorpay = useCallback(
    ({
      razorpayOrderId,
      amount,
      keyId,
    }: {
      razorpayOrderId: string;
      amount: number;
      keyId: string;
    }) =>
      new Promise<RazorpayResponse>((resolve, reject) => {
        if (!window.Razorpay) {
          reject(
            new Error("Payment SDK not loaded. Please refresh and try again."),
          );
          return;
        }

        const instance = new window.Razorpay({
          key: keyId,
          amount: amount * 100,
          currency: "INR",
          name: "certe",
          description: "Certe+ subscription",
          order_id: razorpayOrderId,
          handler: (response) => resolve(response),
          prefill: {
            name: session?.user?.name || "",
            email: session?.user?.email || "",
          },
          theme: { color: "#d97706" },
          modal: {
            ondismiss: () => reject(new Error("Payment cancelled")),
          },
        });

        instance.open();
      }),
    [session?.user?.email, session?.user?.name],
  );

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      if (isGeneralAccount) {
        const startRes = await fetch("/api/certe-plus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentMethod: "RAZORPAY",
            plan: selectedPlan,
          }),
        });
        const startData = await startRes.json();
        if (!startRes.ok) {
          toast.error(startData.error || "Subscription failed");
          return;
        }

        if (!startData.requiresPayment) {
          toast.success("Welcome to Certe+! Your subscription is now active.");
          await refreshCertePlusStatus({ silent: true });
          return;
        }

        const payment = await openRazorpay({
          razorpayOrderId: startData.razorpayOrderId,
          amount: startData.amount,
          keyId: startData.keyId,
        });

        const finalizeRes = await fetch("/api/certe-plus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentMethod: "RAZORPAY",
            plan: selectedPlan,
            razorpay_payment_id: payment.razorpay_payment_id,
            razorpay_order_id: payment.razorpay_order_id,
            razorpay_signature: payment.razorpay_signature,
          }),
        });
        const finalizeData = await finalizeRes.json();
        if (!finalizeRes.ok) {
          toast.error(finalizeData.error || "Subscription verification failed");
          return;
        }

        toast.success("Welcome to Certe+! Your subscription is now active.");
        await refreshCertePlusStatus({ silent: true });
        return;
      }

      const res = await fetch("/api/certe-plus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: "WALLET",
          plan: selectedPlan,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Subscription failed");
        return;
      }
      toast.success("Welcome to Certe+! Your subscription is now active.");
      await refreshCertePlusStatus({ silent: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Payment cancelled") {
        toast.info("Payment cancelled");
      } else {
        toast.error("Failed to subscribe");
      }
    } finally {
      setSubscribing(false);
    }
  };

  const currentPlanInfo =
    CERTE_PLUS_PLANS[selectedPlan as keyof typeof CERTE_PLUS_PLANS] ??
    CERTE_PLUS_PLANS.MONTHLY;
  const penaltyUsedByChild =
    certePlus?.subscription?.libraryPenaltiesUsedByChild ?? {};
  const totalPenaltyUsed = Object.values(penaltyUsedByChild).reduce(
    (sum, value) => sum + value,
    0,
  );
  const totalPenaltyAllowance = CERTE_PLUS.LIBRARY_PENALTY_ALLOWANCE;
  const totalPenaltyLeft = Math.max(
    0,
    totalPenaltyAllowance - totalPenaltyUsed,
  );
  const certePlusResolved = certePlus !== null;
  const visibleSettingItems = settingItems;
  const certePlusBenefits = [
    {
      title: "AI-powered personal assistant",
      description:
        "Get instant help with orders, spending insights, and smart recommendations via the AI chat.",
    },
    {
      title: `${CERTE_PLUS.LIBRARY_PENALTY_ALLOWANCE} library late-return protections`,
      description:
        "Reduce surprise library penalties across your family during the active cycle.",
    },
    {
      title: "Scheduled meal pre-orders",
      description:
        "Pre-book meals for school days with faster pickups and planned spending.",
    },
    {
      title: `Wallet safety net up to INR ${CERTE_PLUS.WALLET_OVERDRAFT_LIMIT}`,
      description:
        "Allow checkout even on low balance so children are not blocked at the counter.",
      parentOnly: true,
    },
    {
      title: "Advanced controls for canteen and library",
      description:
        "Apply spend limits and item restrictions with better family-level control.",
    },
    {
      title: "AI spending insights & anomaly detection",
      description:
        "Automatically spot unusual spending patterns and get proactive alerts.",
    },
    {
      title: "Healthy Food access",
      description: "Priority rollout when curated healthy menus go live.",
      comingSoon: true,
    },
  ];
  const visibleCertePlusBenefits = certePlusBenefits.filter(
    (benefit) => !benefit.parentOnly || !isGeneralAccount,
  );

  return (
    <div className="app-shell-compact space-y-4">
      <div className="pt-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Family, preferences & premium
        </p>
      </div>

      {/* Certe+ Subscription Card */}
      <Card className="overflow-hidden rounded-2xl border border-border/40 bg-card p-5">
        <button
            type="button"
            className="flex w-full items-center justify-between"
            onClick={() => setCertePlusExpanded((s) => !s)}
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-foreground flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-background" />
              </div>
              <div>
                <h3 className="font-semibold text-sm tracking-tight">Certe+</h3>
                <p className="text-[11px] text-muted-foreground">
                  {certePlus?.active
                    ? "Active"
                    : "From ₹79/week"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {certePlusResolved ? (
                certePlus?.active ? (
                  <Badge className="border-green-200/60 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-950/40 dark:text-green-300">
                    <CheckCircle className="mr-1 h-3 w-3" /> Active
                  </Badge>
                ) : null
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                </Badge>
              )}
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  certePlusExpanded && "rotate-180",
                )}
              />
            </div>
          </button>

          {certePlusExpanded && (
            <div className="mt-4 border-t border-border/30 pt-4">
          {!certePlusResolved ? (
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Syncing status...
            </div>
          ) : certePlus?.active && certePlus.subscription ? (
            <div className="space-y-3">
              <div
                className={cn(
                  "grid gap-2",
                  isGeneralAccount ? "grid-cols-2" : "grid-cols-3",
                )}
              >
                <div className="rounded-xl bg-muted/40 p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">Expires</p>
                  <p className="text-xs font-medium">
                    {new Date(certePlus.subscription.endDate).toLocaleDateString()}
                  </p>
                </div>
                {!isGeneralAccount && (
                  <div className="rounded-xl bg-muted/40 p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">Overdraft</p>
                    <p className="text-xs font-medium">
                      {(
                        CERTE_PLUS.WALLET_OVERDRAFT_LIMIT -
                        certePlus.subscription.walletOverdraftUsed
                      ).toFixed(0)}{" "}
                      left
                    </p>
                  </div>
                )}
                <div className="rounded-xl bg-muted/40 p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">Late returns</p>
                  <p className="text-xs font-medium">{totalPenaltyLeft} left</p>
                </div>
              </div>

              <ul className="space-y-1.5 pt-1">
                {visibleCertePlusBenefits.map((benefit) => (
                  <li key={benefit.title} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                        benefit.comingSoon
                          ? "bg-muted text-muted-foreground"
                          : "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                      }`}
                    >
                      {benefit.comingSoon ? (
                        <Clock3 className="h-2.5 w-2.5" />
                      ) : (
                        <Check className="h-2.5 w-2.5" />
                      )}
                    </span>
                    <div>
                      <p className="text-[11px] font-medium text-foreground">
                        {benefit.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {benefit.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-1.5">
                {visibleCertePlusBenefits.map((benefit) => (
                  <li key={benefit.title} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                        benefit.comingSoon
                          ? "bg-muted text-muted-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {benefit.comingSoon ? (
                        <Clock3 className="h-2.5 w-2.5" />
                      ) : (
                        <Check className="h-2.5 w-2.5" />
                      )}
                    </span>
                    <div>
                      <p className="text-[11px] font-medium text-foreground">
                        {benefit.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        {benefit.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Plan Selection */}
              <p className="text-[11px] font-medium text-foreground pt-1">
                Choose a plan
              </p>
              <div className="grid grid-cols-2 gap-2">
                {CERTE_PLUS_PLAN_LIST.map((plan) => (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => setSelectedPlan(plan.key)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      selectedPlan === plan.key
                        ? "border-foreground bg-muted/60 ring-1 ring-foreground/20"
                        : "border-border/50 bg-muted/25 hover:border-border",
                    )}
                  >
                    <p className="text-xs font-medium">{plan.label}</p>
                    <p className="text-sm font-semibold">
                      ₹{plan.price}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {plan.duration}
                    </p>
                  </button>
                ))}
              </div>

              <Button
                size="sm"
                className="w-full"
                onClick={handleSubscribe}
                disabled={subscribing}
              >
                {subscribing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />{" "}
                    Subscribing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    {isGeneralAccount ? "Subscribe Online" : "Subscribe"} -{" "}
                    {currentPlanInfo.price} credits / {currentPlanInfo.label}
                  </>
                )}
              </Button>
              <p className="text-[10px] text-center text-muted-foreground">
                {isGeneralAccount
                  ? "Payment will be collected using Razorpay."
                  : "Payment will be deducted from your family wallet balance."}{" "}
                <span className="font-medium">1 credit = INR 1</span>
              </p>
            </div>
          )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border border-border/40 bg-card p-5">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">Theme</h3>
          </div>
          <ThemeSelector />
        </div>
      </Card>

      <CardContent className="overflow-hidden rounded-2xl border border-border/40 bg-card p-0">
        <div className="flex flex-1 flex-col justify-around">
          {visibleSettingItems.map(
            ({ href, label, description, icon: Icon }) => (
              <Link
                key={href}
                href={withParentMode(href)}
                className="flex items-center gap-3 border-b border-border/30 px-4 py-3.5 transition-colors hover:bg-muted/40 last:border-b-0"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/50">
                  <Icon className="h-4 w-4 text-foreground/70" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-none">{label}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              </Link>
            ),
          )}
        </div>
      </CardContent>

      <Card className="overflow-hidden rounded-2xl border border-border/40 bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Sign out</h3>
            <p className="text-xs text-muted-foreground">
              Securely sign out from this device.
            </p>
          </div>
          <Button
            variant="destructive"
            className="gap-2"
            onClick={() =>
              signOut({
                fetchOptions: {
                  onSuccess: () => {
                    window.location.href = "/login";
                  },
                },
              })
            }
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}

