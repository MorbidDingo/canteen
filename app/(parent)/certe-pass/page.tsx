"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import {
  CERTE_PLUS_PLAN_LIST,
  CERTE_PLUS_PLANS,
  CERTE_PLUS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  IoSparkles,
  IoShieldCheckmark,
  IoBookOutline,
  IoWalletOutline,
  IoRestaurantOutline,
  IoChatbubblesOutline,
  IoAnalyticsOutline,
  IoLeafOutline,
} from "react-icons/io5";
import {
  Loader2,
  Check,
  ChevronRight,
  Sparkles,
  ArrowLeft,
} from "lucide-react";

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

const benefits = [
  {
    icon: IoChatbubblesOutline,
    title: "AI Personal Assistant",
    description: "Get instant help with orders, smart recommendations, and spending insights.",
    badge: "AI",
  },
  {
    icon: IoBookOutline,
    title: "Library Protection",
    description: `${CERTE_PLUS.LIBRARY_PENALTY_ALLOWANCE} late-return protections per cycle across your family.`,
  },
  {
    icon: IoRestaurantOutline,
    title: "Meal Pre-Orders",
    description: "Schedule meals ahead for faster pickups and planned spending.",
  },
  {
    icon: IoWalletOutline,
    title: "Wallet Safety Net",
    description: `Checkout even on low balance with overdraft up to ₹${CERTE_PLUS.WALLET_OVERDRAFT_LIMIT}.`,
    parentOnly: true,
  },
  {
    icon: IoShieldCheckmark,
    title: "Advanced Controls",
    description: "Spend limits, item restrictions, and family-level control.",
  },
  {
    icon: IoAnalyticsOutline,
    title: "AI Spending Insights",
    description: "Spot unusual spending patterns with proactive alerts.",
    badge: "AI",
  },
  {
    icon: IoLeafOutline,
    title: "Healthy Food Access",
    description: "Priority access when curated healthy menus launch.",
    comingSoon: true,
  },
];

export default function CertePassPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const certePlus = useCertePlusStore((s) => s.status);
  const refreshCertePlusStatus = useCertePlusStore((s) => s.refresh);
  const ensureCertePlusFresh = useCertePlusStore((s) => s.ensureFresh);
  const [selectedPlan, setSelectedPlan] = useState<string>("MONTHLY");
  const [subscribing, setSubscribing] = useState(false);
  const isGeneralAccount = session?.user?.role === "GENERAL";
  const certePlusResolved = certePlus !== null;
  const isActive = certePlus?.active === true;

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
          reject(new Error("Payment SDK not loaded. Please refresh and try again."));
          return;
        }
        const instance = new window.Razorpay({
          key: keyId,
          amount: amount * 100,
          currency: "INR",
          name: "certe",
          description: "Certe Pass subscription",
          order_id: razorpayOrderId,
          handler: (response) => resolve(response),
          prefill: {
            name: session?.user?.name || "",
            email: session?.user?.email || "",
          },
          theme: { color: "#0f172a" },
          modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
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
          body: JSON.stringify({ paymentMethod: "RAZORPAY", plan: selectedPlan }),
        });
        const startData = await startRes.json();
        if (!startRes.ok) { toast.error(startData.error || "Subscription failed"); return; }

        if (!startData.requiresPayment) {
          toast.success("Welcome to Certe Pass! Your subscription is now active.");
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
        if (!finalizeRes.ok) { toast.error(finalizeData.error || "Verification failed"); return; }

        toast.success("Welcome to Certe Pass! Your subscription is now active.");
        await refreshCertePlusStatus({ silent: true });
        return;
      }

      const res = await fetch("/api/certe-plus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: "WALLET", plan: selectedPlan }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Subscription failed"); return; }
      toast.success("Welcome to Certe Pass! Your subscription is now active.");
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

  const visibleBenefits = benefits.filter(
    (b) => !b.parentOnly || !isGeneralAccount,
  );

  return (
    <div className="mx-auto max-w-lg px-5 pb-32">
      {/* Hero */}
      <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white dark:from-slate-800 dark:via-slate-900 dark:to-black">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-sky-400/10 blur-3xl" />

        <div className="relative">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
              <Sparkles className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <h1 className="text-[22px] font-bold tracking-tight">Certe Pass</h1>
              <p className="text-[12px] text-white/50 font-medium">Premium Features & AI</p>
            </div>
          </div>

          {isActive ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3.5 py-2.5">
              <Check className="h-4 w-4 text-emerald-400" />
              <div>
                <p className="text-[13px] font-semibold text-emerald-300">Your pass is active</p>
                {certePlus?.subscription && (
                  <p className="text-[11px] text-emerald-300/60">
                    Expires {new Date(certePlus.subscription.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[14px] leading-relaxed text-white/60">
              Unlock AI assistance, spending controls, and premium features for your family.
            </p>
          )}
        </div>
      </div>

      {/* Benefits */}
      <div className="mb-8">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          What&apos;s included
        </p>
        <div className="space-y-3">
          {visibleBenefits.map((benefit, i) => {
            const Icon = benefit.icon;
            return (
              <div
                key={i}
                className="flex items-start gap-3.5 rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/50">
                  <Icon className="h-[18px] w-[18px] text-foreground/70" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[14px] font-semibold">{benefit.title}</p>
                    {benefit.badge && (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        {benefit.badge}
                      </span>
                    )}
                    {benefit.comingSoon && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                        SOON
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                    {benefit.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Plan selector — only show if not active */}
      {!isActive && (
        <>
          <div className="mb-6">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Choose your plan
            </p>
            <div className="grid grid-cols-2 gap-2">
              {CERTE_PLUS_PLAN_LIST.map((plan) => {
                const isSelected = selectedPlan === plan.key;
                return (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => setSelectedPlan(plan.key)}
                    className={cn(
                      "relative flex flex-col items-center gap-1 rounded-2xl border-2 p-4 transition-all active:scale-[0.98]",
                      isSelected
                        ? "border-slate-900 bg-slate-900/[0.03] dark:border-white dark:bg-white/[0.05]"
                        : "border-transparent bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
                    )}
                  >
                    <span className="text-[13px] font-bold">₹{plan.price}</span>
                    <span className="text-[11px] text-muted-foreground">{plan.label}</span>
                    {isSelected && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 dark:bg-white">
                        <Check className="h-3 w-3 text-white dark:text-slate-900" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subscribe button */}
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={subscribing || !certePlusResolved}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 text-[15px] font-bold text-white shadow-lg shadow-slate-900/20 transition-all active:scale-[0.98] disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:shadow-white/10"
          >
            {subscribing ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Get Certe Pass · ₹{currentPlanInfo.price}/{currentPlanInfo.label.toLowerCase()}
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}
