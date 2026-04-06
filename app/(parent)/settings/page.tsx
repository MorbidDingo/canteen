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
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  CERTE_PLUS_PLAN_LIST,
  CERTE_PLUS_PLANS,
  CERTE_PLUS,
} from "@/lib/constants";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { useSession } from "@/lib/auth-client";
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
      <div className="app-header-card bg-[linear-gradient(120deg,rgba(251,146,60,0.14),rgba(251,191,36,0.06)_45%,transparent_100%)]">
        <h1 className="app-title">Settings</h1>
        <p className="app-subtitle">
          Manage family controls, communication preferences, and premium features.
        </p>
      </div>

      {/* Certe+ Subscription Card */}
      <Card className="overflow-hidden rounded-2xl border border-amber-200/40 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/60 shadow-[0_4px_24px_rgba(180,120,0,0.08)] dark:border-amber-200/15 dark:from-amber-950/25 dark:via-background dark:to-orange-950/20 dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        <CardContent className="p-5">
          <button
            type="button"
            className="flex w-full items-center justify-between"
            onClick={() => setCertePlusExpanded((s) => !s)}
          >
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-sm tracking-tight">Certe+</h3>
                <p className="text-[11px] text-muted-foreground">
                  {certePlus?.active
                    ? "Your premium benefits"
                    : "Premium features & AI"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {certePlusResolved ? (
                certePlus?.active ? (
                  <Badge className="border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <CheckCircle className="mr-1 h-3 w-3" /> Active
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-300/60 text-amber-700 dark:border-amber-400/30 dark:text-amber-300"
                  >
                    From 79/week
                  </Badge>
                )
              ) : (
                <Badge
                  variant="outline"
                  className="border-slate-300 text-slate-600"
                >
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Checking
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
            <div className="mt-4 border-t border-amber-200/25 dark:border-amber-500/15 pt-4">
          {!certePlusResolved ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200/40 bg-white/60 px-3 py-2.5 text-xs text-muted-foreground dark:bg-white/5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Syncing your Certe+ status...
            </div>
          ) : certePlus?.active && certePlus.subscription ? (
            <div className="space-y-3">
              <div
                className={cn(
                  "grid gap-2",
                  isGeneralAccount ? "grid-cols-2" : "grid-cols-3",
                )}
              >
                <div className="rounded-xl border border-amber-200/30 bg-white/60 p-2.5 text-center dark:bg-white/5">
                  <p className="text-[10px] text-muted-foreground">Expires</p>
                  <p className="text-xs font-semibold">
                    {new Date(certePlus.subscription.endDate).toLocaleDateString()}
                  </p>
                </div>
                {!isGeneralAccount && (
                  <div className="rounded-xl border border-amber-200/30 bg-white/60 p-2.5 text-center dark:bg-white/5">
                    <p className="text-[10px] text-muted-foreground">Overdraft</p>
                    <p className="text-xs font-semibold">
                      {(
                        CERTE_PLUS.WALLET_OVERDRAFT_LIMIT -
                        certePlus.subscription.walletOverdraftUsed
                      ).toFixed(0)}{" "}
                      left
                    </p>
                  </div>
                )}
                <div className="rounded-xl border border-amber-200/30 bg-white/60 p-2.5 text-center dark:bg-white/5">
                  <p className="text-[10px] text-muted-foreground">Late returns</p>
                  <p className="text-xs font-semibold">{totalPenaltyLeft} left</p>
                </div>
              </div>

              <ul className="space-y-1.5 pt-1">
                {visibleCertePlusBenefits.map((benefit) => (
                  <li key={benefit.title} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                        benefit.comingSoon
                          ? "bg-muted text-muted-foreground"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
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
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
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
                      "rounded-xl border p-2.5 text-left transition-all",
                      selectedPlan === plan.key
                        ? "border-amber-400 bg-amber-50/80 ring-1 ring-amber-400/50 dark:bg-amber-900/25"
                        : "border-amber-200/40 bg-white/60 hover:border-amber-300 dark:border-amber-200/15 dark:bg-white/5",
                    )}
                  >
                    <p className="text-xs font-semibold">{plan.label}</p>
                    <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                      {plan.price} credits
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {plan.duration}
                    </p>
                  </button>
                ))}
              </div>

              <Button
                size="sm"
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-sm"
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

      <Card className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-4">
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Theme</h3>
            <p className="text-xs text-muted-foreground">
              Choose your preferred app appearance.
            </p>
          </div>
          <ThemeSelector />
        </div>
      </Card>

      <CardContent className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-0">
        <div className="flex flex-1 flex-col justify-around">
          {visibleSettingItems.map(
            ({ href, label, description, icon: Icon }) => (
              <Link
                key={href}
                href={withParentMode(href)}
                className="flex items-center gap-3 border-b border-border/50 px-4 py-3 transition-colors hover:bg-muted/50 last:border-b-0"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/80">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-none">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {description}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ),
          )}
        </div>
      </CardContent>
    </div>
  );
}

