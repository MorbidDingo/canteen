"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, ChevronRight, Shield, Users, Wallet, Sparkles, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

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

type CertePlusStatus = {
  active: boolean;
  subscription?: {
    endDate: string;
    walletOverdraftUsed: number;
    libraryPenaltiesUsed: number;
  };
};

export default function SettingsPage() {
  const [certePlus, setCertePlus] = useState<CertePlusStatus | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  const fetchCertePlusStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/certe-plus");
      if (res.ok) {
        const data = await res.json();
        setCertePlus(data);
      }
    } catch {
      setCertePlus({ active: false });
    }
  }, []);

  useEffect(() => {
    fetchCertePlusStatus();
  }, [fetchCertePlusStatus]);

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const res = await fetch("/api/certe-plus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: "WALLET" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Subscription failed");
        return;
      }
      toast.success("Welcome to Certe+! Your subscription is now active.");
      fetchCertePlusStatus();
    } catch {
      toast.error("Failed to subscribe");
    } finally {
      setSubscribing(false);
    }
  };

  return (
      <div className="container mx-auto max-w-xl px-4 py-6 space-y-4">
                      <h1 className="text-2xl font-bold mb-[10]">Settings</h1>

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
              {certePlus?.active ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  <CheckCircle className="h-3 w-3 mr-1" /> Active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-700 border-amber-300">
                  ₹99/month
                </Badge>
              )}
            </div>

            {certePlus?.active && certePlus.subscription ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-white/60 dark:bg-white/10 p-2 text-center">
                    <p className="text-xs text-muted-foreground">Expires</p>
                    <p className="text-xs font-semibold">{new Date(certePlus.subscription.endDate).toLocaleDateString()}</p>
                  </div>
                  <div className="rounded-lg bg-white/60 dark:bg-white/10 p-2 text-center">
                    <p className="text-xs text-muted-foreground">Overdraft</p>
                    <p className="text-xs font-semibold">₹{(200 - certePlus.subscription.walletOverdraftUsed).toFixed(0)} left</p>
                  </div>
                  <div className="rounded-lg bg-white/60 dark:bg-white/10 p-2 text-center">
                    <p className="text-xs text-muted-foreground">Penalties</p>
                    <p className="text-xs font-semibold">{5 - certePlus.subscription.libraryPenaltiesUsed} left</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Use food subscriptions (pre-order daily meals)</li>
                  <li>• ₹200 wallet overdraft if balance is low at kiosk</li>
                  <li>• 5 free library late-return penalties/month</li>
                </ul>
                <Button
                  size="sm"
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                  onClick={handleSubscribe}
                  disabled={subscribing}
                >
                  {subscribing ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Subscribing...</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5 mr-1" /> Subscribe for ₹99/month</>
                  )}
                </Button>
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
