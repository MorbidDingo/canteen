"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, ChevronRight, Shield, Users, Wallet, Sparkles, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CERTE_PLUS_PLAN_LIST, CERTE_PLUS_PLANS, CERTE_PLUS } from "@/lib/constants";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { useSession } from "@/lib/auth-client";

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
    description: "Set limits and blocked categories",
    icon: Shield,
  },
  {
    href: "/notifications",
    label: "Notifications",
    description: "Search and review activity alerts",
    icon: Bell,
  },
];

type ChildInfo = {
  id: string;
  name: string;
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const certePlus = useCertePlusStore((s) => s.status);
  const refreshCertePlusStatus = useCertePlusStore((s) => s.refresh);
  const ensureCertePlusFresh = useCertePlusStore((s) => s.ensureFresh);
  const [subscribing, setSubscribing] = useState(false);
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>("MONTHLY");
  const isGeneralAccount = session?.user?.role === "GENERAL";

  const fetchChildren = useCallback(async () => {
    try {
      const res = await fetch("/api/children");
      if (res.ok) {
        const data = await res.json();
        const kids = data.children || data;
        setChildren(kids);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    void ensureCertePlusFresh(45_000);
    void fetchChildren();
  }, [ensureCertePlusFresh, fetchChildren]);

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

  const currentPlanInfo = CERTE_PLUS_PLANS[selectedPlan as keyof typeof CERTE_PLUS_PLANS] ?? CERTE_PLUS_PLANS.MONTHLY;
  const penaltyUsedByChild = certePlus?.subscription?.libraryPenaltiesUsedByChild ?? {};
  const totalPenaltyUsed = Object.values(penaltyUsedByChild).reduce((sum, value) => sum + value, 0);
  const totalPenaltyAllowance = CERTE_PLUS.LIBRARY_PENALTY_ALLOWANCE;
  const totalPenaltyLeft = Math.max(0, totalPenaltyAllowance - totalPenaltyUsed);
  const certePlusResolved = certePlus !== null;
  const visibleSettingItems = isGeneralAccount
    ? settingItems.filter((item) => item.href === "/notifications")
    : settingItems;

  return (
    <div className="container mx-auto max-w-xl px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>

      {/* Certe+ Subscription Card */}
      <Card className="overflow-hidden rounded-2xl border-2 border-amber-200/50">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Certe+</h3>
                <p className="text-[11px] text-muted-foreground">Premium subscription</p>
              </div>
            </div>
            {certePlusResolved ? (
              certePlus?.active ? (
                <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">
                  <CheckCircle className="mr-1 h-3 w-3" /> Active
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-300 text-amber-700">
                  From 79 credits/week
                </Badge>
              )
            ) : (
              <Badge variant="outline" className="border-slate-300 text-slate-600">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Checking
              </Badge>
            )}
          </div>

          {!certePlusResolved ? (
            <div className="flex items-center gap-2 rounded-lg border border-white/40 bg-white/50 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Syncing your Certe+ status...
            </div>
          ) : certePlus?.active && certePlus.subscription ? (
            <div className="space-y-2">
              {!isGeneralAccount && children.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Family plan active for {children.length} child{children.length === 1 ? "" : "ren"}. Benefits are shared across all children.
                </p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-white/60 dark:bg-white/10 p-2 text-center">
                  <p className="text-xs text-muted-foreground">Expires</p>
                  <p className="text-xs font-semibold">{new Date(certePlus.subscription.endDate).toLocaleDateString()}</p>
                </div>
                <div className="rounded-lg bg-white/60 dark:bg-white/10 p-2 text-center">
                  <p className="text-xs text-muted-foreground">Overdraft</p>
                  <p className="text-xs font-semibold">{(CERTE_PLUS.WALLET_OVERDRAFT_LIMIT - certePlus.subscription.walletOverdraftUsed).toFixed(0)} cr left</p>
                </div>
                <div className="rounded-lg bg-white/60 dark:bg-white/10 p-2 text-center">
                  <p className="text-xs text-muted-foreground">Late returns</p>
                  <p className="text-xs font-semibold">{totalPenaltyLeft} left</p>
                </div>
              </div>
              <ul className="text-[11px] text-muted-foreground space-y-0.5 pt-1 border-t border-amber-200/40">
                <li className="flex items-center gap-1"><span className="text-emerald-600">✓</span> {CERTE_PLUS.LIBRARY_PENALTY_ALLOWANCE} late book return penalties</li>
                <li className="flex items-center gap-1"><span className="text-emerald-600">✓</span> Pre-ordering meals (wallet only, min 1 week)</li>
                {!isGeneralAccount && <li className="flex items-center gap-1"><span className="text-emerald-600">✓</span> Overdraft up to ₹{CERTE_PLUS.WALLET_OVERDRAFT_LIMIT} · 1 credit = ₹1</li>}
                <li className="flex items-center gap-1"><span className="text-emerald-600">✓</span> Controls on library and canteen</li>
                <li className="flex items-center gap-1 text-muted-foreground/50"><span>⏳</span> Access to Healthy Food (coming soon)</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-3">
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>✓ {CERTE_PLUS.LIBRARY_PENALTY_ALLOWANCE} late book return penalties</li>
                <li>✓ Pre-ordering meals (wallet payment, min 1 week)</li>
                {!isGeneralAccount && <li>✓ Overdraft up to ₹{CERTE_PLUS.WALLET_OVERDRAFT_LIMIT} if balance is low at kiosk</li>}
                <li>✓ Controls on library and canteen</li>
                <li className="text-muted-foreground/60">⏳ Access to Healthy Food (coming soon)</li>
              </ul>

              {/* Plan Selection */}
              <div className="grid grid-cols-2 gap-2">
                {CERTE_PLUS_PLAN_LIST.map((plan) => (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => setSelectedPlan(plan.key)}
                    className={`rounded-lg border p-2 text-left transition-all ${
                      selectedPlan === plan.key
                        ? "border-amber-500 bg-amber-100/80 dark:bg-amber-900/30 ring-1 ring-amber-400"
                        : "border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-white/5 hover:border-amber-300"
                    }`}
                  >
                    <p className="text-xs font-semibold">{plan.label}</p>
                    <p className="text-sm font-bold text-amber-700 dark:text-amber-400">{plan.price} credits</p>
                    <p className="text-[10px] text-muted-foreground">{plan.duration}</p>
                  </button>
                ))}
              </div>

              <Button
                size="sm"
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                onClick={handleSubscribe}
                disabled={subscribing}
              >
                {subscribing ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Subscribing...</>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    {isGeneralAccount ? "Subscribe Online" : "Subscribe"} - {currentPlanInfo.price} credits / {currentPlanInfo.label}
                  </>
                )}
              </Button>
              <p className="text-[10px] text-center text-muted-foreground">
                {isGeneralAccount
                  ? "Payment will be collected using Razorpay."
                  : "Payment will be deducted from your family wallet balance."}
                {" "}<span className="font-medium">1 credit = ₹1</span>
              </p>
            </div>
          )}
        </div>
      </Card>

      <CardContent className="p-0">
        <div className="flex flex-col flex-1 justify-around">
          {visibleSettingItems.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-none">{label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </CardContent>
    </div>
  );
}
