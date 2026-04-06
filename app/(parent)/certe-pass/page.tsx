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
  Sparkles,
  Wallet,
  CreditCard,
  IndianRupee,
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
    description:
      "Get instant help with orders, smart recommendations, and spending insights.",
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
    description:
      "Schedule meals ahead for faster pickups and planned spending.",
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
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"WALLET" | "RAZORPAY">(
    "WALLET",
  );
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

  // Fetch wallet balance for parent accounts
  useEffect(() => {
    if (isGeneralAccount) return;
    fetch("/api/wallet", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: Array<{ balance: number }>) => {
        const total = data.reduce((sum, w) => sum + w.balance, 0);
        setWalletBalance(total);
      })
      .catch(() => null);
  }, [isGeneralAccount]);

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
      if (isGeneralAccount || paymentMethod === "RAZORPAY") {
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
          toast.success(
            "Welcome to Certe Pass! Your subscription is now active.",
          );
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
          toast.error(finalizeData.error || "Verification failed");
          return;
        }

        toast.success(
          "Welcome to Certe Pass! Your subscription is now active.",
        );
        await refreshCertePlusStatus({ silent: true });
        return;
      }

      // Wallet payment for parent accounts
      const res = await fetch("/api/certe-plus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: "WALLET", plan: selectedPlan }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Subscription failed");
        return;
      }
      toast.success("Welcome to Certe Pass! Your subscription is now active.");
      await refreshCertePlusStatus({ silent: true });
      // Refresh wallet balance
      if (!isGeneralAccount) {
        fetch("/api/wallet", { cache: "no-store" })
          .then((r) => r.json())
          .then((d: Array<{ balance: number }>) =>
            setWalletBalance(d.reduce((s, w) => s + w.balance, 0)),
          )
          .catch(() => null);
      }
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

  const canAffordWallet =
    walletBalance !== null && walletBalance >= currentPlanInfo.price;

  return (
    <div className="mx-auto max-w-lg px-5 pb-32 mt-7">
      {/* Status card — minimal */}
      {isActive ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3.5 dark:bg-emerald-950/20">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-emerald-700 dark:text-emerald-300">
              Your pass is active
            </p>
            {certePlus?.subscription && (
              <p className="text-[12px] text-emerald-600/70 dark:text-emerald-400/60">
                Expires{" "}
                {new Date(certePlus.subscription.endDate).toLocaleDateString(
                  "en-IN",
                  { day: "numeric", month: "short", year: "numeric" },
                )}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="mb-6 text-[14px] leading-relaxed text-muted-foreground">
          Unlock AI assistance, spending controls, and premium features for your
          whole family.
        </p>
      )}

      {/* Benefits */}
      <div className="mb-8">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          What&apos;s included
        </p>
        <div className="space-y-1.5">
          {visibleBenefits.map((benefit, i) => {
            const Icon = benefit.icon;
            return (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl px-3 py-3"
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    benefit.badge === "AI"
                      ? "bg-amber-100/80 dark:bg-amber-900/30"
                      : "bg-muted/50",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px]",
                      benefit.badge === "AI"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-foreground/60",
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[13px] font-semibold">{benefit.title}</p>
                    {benefit.badge && (
                      <span className="rounded bg-amber-100 px-1 py-px text-[8px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        {benefit.badge}
                      </span>
                    )}
                    {benefit.comingSoon && (
                      <span className="rounded bg-muted px-1 py-px text-[8px] font-bold uppercase tracking-wide text-muted-foreground">
                        Soon
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                    {benefit.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Plan selector + Payment — only show if not active */}
      {!isActive && (
        <>
          <div className="mb-5">
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
                      "relative flex flex-col items-center gap-0.5 rounded-2xl border-2 p-4 transition-all active:scale-[0.98]",
                      isSelected
                        ? "border-primary bg-primary/5 dark:bg-primary/10"
                        : "border-transparent bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[18px] font-bold",
                        isSelected ? "text-primary" : "",
                      )}
                    >
                      ₹{plan.price}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {plan.label}
                    </span>
                    {isSelected && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment method (parent accounts only) */}
          {!isGeneralAccount && (
            <div className="mb-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Pay with
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("WALLET")}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-all active:scale-[0.98]",
                    paymentMethod === "WALLET"
                      ? "border-primary bg-primary/5 dark:bg-primary/10"
                      : "border-transparent bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      paymentMethod === "WALLET"
                        ? "bg-primary/15"
                        : "bg-muted/50",
                    )}
                  >
                    <Wallet
                      className={cn(
                        "h-4 w-4",
                        paymentMethod === "WALLET"
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold">Wallet</p>
                    {walletBalance !== null ? (
                      <p
                        className={cn(
                          "text-[11px] font-medium flex items-center gap-0.5",
                          canAffordWallet
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-destructive",
                        )}
                      >
                        <IndianRupee className="h-2.5 w-2.5" />
                        {walletBalance.toFixed(0)}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Instant
                      </p>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("RAZORPAY")}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-all active:scale-[0.98]",
                    paymentMethod === "RAZORPAY"
                      ? "border-primary bg-primary/5 dark:bg-primary/10"
                      : "border-transparent bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      paymentMethod === "RAZORPAY"
                        ? "bg-primary/15"
                        : "bg-muted/50",
                    )}
                  >
                    <CreditCard
                      className={cn(
                        "h-4 w-4",
                        paymentMethod === "RAZORPAY"
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold">Card / UPI</p>
                    <p className="text-[11px] text-muted-foreground">
                      via Razorpay
                    </p>
                  </div>
                </button>
              </div>
              {paymentMethod === "WALLET" &&
                !canAffordWallet &&
                walletBalance !== null && (
                  <p className="mt-2 text-[12px] text-destructive">
                    Insufficient balance — need ₹
                    {(currentPlanInfo.price - walletBalance).toFixed(2)} more.
                    Top up or pay via card.
                  </p>
                )}
            </div>
          )}

          {/* Subscribe button */}
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={
              subscribing ||
              !certePlusResolved ||
              (!isGeneralAccount &&
                paymentMethod === "WALLET" &&
                !canAffordWallet)
            }
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-[15px] font-bold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {subscribing ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <>
                {paymentMethod === "WALLET" && !isGeneralAccount ? (
                  <Wallet className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Get Pass · ₹{currentPlanInfo.price}/
                {currentPlanInfo.label.toLowerCase()}
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}