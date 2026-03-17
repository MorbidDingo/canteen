"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, ChevronRight, Shield, Users, Wallet, Sparkles, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CERTE_PLUS_PLAN_LIST, CERTE_PLUS_PLANS } from "@/lib/constants";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";

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
  const certePlus = useCertePlusStore((s) => s.status);
  const refreshCertePlusStatus = useCertePlusStore((s) => s.refresh);
  const ensureCertePlusFresh = useCertePlusStore((s) => s.ensureFresh);
  const [subscribing, setSubscribing] = useState(false);
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [selectedPlan, setSelectedPlan] = useState<string>("MONTHLY");

  const fetchChildren = useCallback(async () => {
    try {
      const res = await fetch("/api/children");
      if (res.ok) {
        const data = await res.json();
        const kids = data.children || data;
        setChildren(kids);
        if (kids.length > 0 && !selectedChildId) {
          setSelectedChildId(kids[0].id);
        }
      }
    } catch {
      // silently fail
    }
  }, [selectedChildId]);

  useEffect(() => {
    void ensureCertePlusFresh(45_000);
    void fetchChildren();
  }, [ensureCertePlusFresh, fetchChildren]);

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const res = await fetch("/api/certe-plus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: "WALLET",
          childId: selectedChildId || undefined,
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
    } catch {
      toast.error("Failed to subscribe");
    } finally {
      setSubscribing(false);
    }
  };

  const currentPlanInfo = CERTE_PLUS_PLANS[selectedPlan as keyof typeof CERTE_PLUS_PLANS] ?? CERTE_PLUS_PLANS.MONTHLY;
  const selectedChildName = children.find((c) => c.id === selectedChildId)?.name;
  const penaltyUsedByChild = certePlus?.subscription?.libraryPenaltiesUsedByChild ?? {};
  const selectedChildPenaltyUsed = selectedChildId ? penaltyUsedByChild[selectedChildId] ?? 0 : 0;
  const selectedChildPenaltyLeft = Math.max(0, 5 - selectedChildPenaltyUsed);
  const certePlusResolved = certePlus !== null;

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
                  From Rs79/week
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
              {children.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">View subscription for child</p>
                  <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                    <SelectTrigger className="h-8 text-xs bg-white/70 dark:bg-white/10">
                      <SelectValue placeholder="Select child" />
                    </SelectTrigger>
                    <SelectContent>
                      {children.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedChildName && (
                    <p className="text-[11px] text-muted-foreground">
                      {selectedChildName} is covered under your Certe+ plan. Penalty waivers are tracked per child.
                    </p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-white/60 dark:bg-white/10 p-2 text-center">
                  <p className="text-xs text-muted-foreground">Expires</p>
                  <p className="text-xs font-semibold">{new Date(certePlus.subscription.endDate).toLocaleDateString()}</p>
                </div>
                <div className="rounded-lg bg-white/60 dark:bg-white/10 p-2 text-center">
                  <p className="text-xs text-muted-foreground">Overdraft</p>
                  <p className="text-xs font-semibold">Rs{(200 - certePlus.subscription.walletOverdraftUsed).toFixed(0)} left</p>
                </div>
                <div className="rounded-lg bg-white/60 dark:bg-white/10 p-2 text-center">
                  <p className="text-xs text-muted-foreground">
                    Penalties {selectedChildName ? `(${selectedChildName})` : "(per child)"}
                  </p>
                  <p className="text-xs font-semibold">{selectedChildPenaltyLeft} left</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>Use food subscriptions (pre-order daily meals)</li>
                <li>Rs200 wallet overdraft if balance is low at kiosk</li>
                <li>5 free library late-return penalties per child per active plan</li>
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
                    <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Rs{plan.price}</p>
                    <p className="text-[10px] text-muted-foreground">{plan.duration}</p>
                  </button>
                ))}
              </div>

              {/* Child selector for wallet payment */}
              {children.length > 1 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Pay from wallet of</p>
                  <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select child" />
                    </SelectTrigger>
                    <SelectContent>
                      {children.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button
                size="sm"
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                onClick={handleSubscribe}
                disabled={subscribing}
              >
                {subscribing ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Subscribing...</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5 mr-1" /> Subscribe - Rs{currentPlanInfo.price} / {currentPlanInfo.label}</>
                )}
              </Button>
              <p className="text-[10px] text-center text-muted-foreground">
                Payment will be deducted from your family wallet balance.
              </p>
            </div>
          )}
        </div>
      </Card>

      <CardContent className="p-0">
        <div className="flex flex-col flex-1 justify-around">
          {settingItems.map(({ href, label, description, icon: Icon }) => (
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
