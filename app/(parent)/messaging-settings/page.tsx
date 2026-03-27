"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  MessageCircle,
  Smartphone,
  Shield,
  ShoppingCart,
  Wallet,
  CreditCard,
  Ban,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface MessagingPreferences {
  id: string;
  parentId: string;
  phoneNumber: string | null;
  preferredChannel: "WHATSAPP" | "SMS" | "BOTH";
  fallbackEnabled: boolean;
  gateNotificationsEnabled: boolean;
  orderNotificationsEnabled: boolean;
  spendingNotificationsEnabled: boolean;
  cardNotificationsEnabled: boolean;
  blockedNotificationsEnabled: boolean;
  consentGivenAt: string | null;
  updatedAt: string;
}

type ChannelOption = {
  key: "WHATSAPP" | "SMS" | "BOTH";
  label: string;
  note: string;
  accent: string;
};

const CHANNEL_OPTIONS: ChannelOption[] = [
  {
    key: "WHATSAPP",
    label: "WhatsApp",
    note: "Rich and fast updates",
    accent:
      "border-emerald-400/70 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-950/30 dark:text-emerald-200",
  },
  {
    key: "SMS",
    label: "SMS",
    note: "Works on every phone",
    accent:
      "border-sky-400/70 bg-sky-50/80 text-sky-700 dark:border-sky-500/50 dark:bg-sky-950/30 dark:text-sky-200",
  },
  {
    key: "BOTH",
    label: "Both",
    note: "Primary + fallback",
    accent:
      "border-amber-400/70 bg-amber-50/80 text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/30 dark:text-amber-200",
  },
];

const PREMIUM_CARD =
  "rounded-3xl border border-amber-200/55 bg-[linear-gradient(130deg,rgba(255,255,255,0.9),rgba(255,245,219,0.74)_45%,rgba(255,233,176,0.46)_100%)] shadow-[0_12px_38px_rgba(161,108,0,0.14)] backdrop-blur-xl dark:border-amber-200/15 dark:bg-[linear-gradient(130deg,rgba(32,24,8,0.8),rgba(58,39,9,0.7)_45%,rgba(88,58,12,0.54)_100%)] dark:shadow-[0_10px_34px_rgba(0,0,0,0.4)]";

export default function MessagingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<MessagingPreferences | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [preferredChannel, setPreferredChannel] = useState<"WHATSAPP" | "SMS" | "BOTH">("BOTH");
  const [fallbackEnabled, setFallbackEnabled] = useState(true);
  const [gateEnabled, setGateEnabled] = useState(true);
  const [orderEnabled, setOrderEnabled] = useState(true);
  const [spendingEnabled, setSpendingEnabled] = useState(true);
  const [cardEnabled, setCardEnabled] = useState(true);
  const [blockedEnabled, setBlockedEnabled] = useState(true);
  const [consentGiven, setConsentGiven] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const res = await fetch("/api/messaging/preferences");
        if (!res.ok) throw new Error("Failed to fetch preferences");
        const data = await res.json();
        const prefs = data.preferences;

        setPreferences(prefs);
        setPhoneNumber(prefs.phoneNumber || "");
        setPreferredChannel(prefs.preferredChannel);
        setFallbackEnabled(prefs.fallbackEnabled);
        setGateEnabled(prefs.gateNotificationsEnabled);
        setOrderEnabled(prefs.orderNotificationsEnabled);
        setSpendingEnabled(prefs.spendingNotificationsEnabled);
        setCardEnabled(prefs.cardNotificationsEnabled);
        setBlockedEnabled(prefs.blockedNotificationsEnabled);
        setConsentGiven(!!prefs.consentGivenAt);
      } catch (error) {
        console.error("Failed to load preferences:", error);
        toast.error("Failed to load messaging preferences");
      } finally {
        setLoading(false);
      }
    };

    void fetchPreferences();
  }, []);

  const validatePhone = (phone: string): boolean => {
    if (!phone) return true;
    const cleaned = phone.replace(/[\s\-\(\)]/g, "");
    return /^(\+91|91)?[6-9]\d{9}$/.test(cleaned);
  };

  const handleSave = useCallback(async () => {
    if (phoneNumber && !validatePhone(phoneNumber)) {
      toast.error("Invalid phone number format. Use a 10-digit Indian number.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/messaging/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          preferredChannel,
          fallbackEnabled,
          gateNotificationsEnabled: gateEnabled,
          orderNotificationsEnabled: orderEnabled,
          spendingNotificationsEnabled: spendingEnabled,
          cardNotificationsEnabled: cardEnabled,
          blockedNotificationsEnabled: blockedEnabled,
          consentGiven,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save preferences");
      }

      const data = await res.json();
      setPreferences(data.preferences);
      setHasChanges(false);
      toast.success("Messaging preferences saved successfully");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to save preferences";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [
    phoneNumber,
    preferredChannel,
    fallbackEnabled,
    gateEnabled,
    orderEnabled,
    spendingEnabled,
    cardEnabled,
    blockedEnabled,
    consentGiven,
  ]);

  const handleReset = () => {
    if (!preferences) return;
    setPhoneNumber(preferences.phoneNumber || "");
    setPreferredChannel(preferences.preferredChannel);
    setFallbackEnabled(preferences.fallbackEnabled);
    setGateEnabled(preferences.gateNotificationsEnabled);
    setOrderEnabled(preferences.orderNotificationsEnabled);
    setSpendingEnabled(preferences.spendingNotificationsEnabled);
    setCardEnabled(preferences.cardNotificationsEnabled);
    setBlockedEnabled(preferences.blockedNotificationsEnabled);
    setConsentGiven(!!preferences.consentGivenAt);
    setHasChanges(false);
  };

  useEffect(() => {
    if (!preferences) return;
    const changed =
      phoneNumber !== (preferences.phoneNumber || "") ||
      preferredChannel !== preferences.preferredChannel ||
      fallbackEnabled !== preferences.fallbackEnabled ||
      gateEnabled !== preferences.gateNotificationsEnabled ||
      orderEnabled !== preferences.orderNotificationsEnabled ||
      spendingEnabled !== preferences.spendingNotificationsEnabled ||
      cardEnabled !== preferences.cardNotificationsEnabled ||
      blockedEnabled !== preferences.blockedNotificationsEnabled ||
      consentGiven !== !!preferences.consentGivenAt;
    setHasChanges(changed);
  }, [
    phoneNumber,
    preferredChannel,
    fallbackEnabled,
    gateEnabled,
    orderEnabled,
    spendingEnabled,
    cardEnabled,
    blockedEnabled,
    consentGiven,
    preferences,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const notificationOptions = [
    {
      id: "gate",
      label: "Gate Entry/Exit",
      note: "Instantly know when your child enters or exits the campus.",
      checked: gateEnabled,
      onChange: setGateEnabled,
      Icon: Shield,
    },
    {
      id: "order",
      label: "Kiosk Orders",
      note: "Order placed, preparing, and ready-for-pickup updates.",
      checked: orderEnabled,
      onChange: setOrderEnabled,
      Icon: ShoppingCart,
    },
    {
      id: "spending",
      label: "Wallet Transactions",
      note: "Top-up and spend alerts in real time.",
      checked: spendingEnabled,
      onChange: setSpendingEnabled,
      Icon: Wallet,
    },
    {
      id: "card",
      label: "Card Issuance",
      note: "Permanent and temporary card issuance alerts.",
      checked: cardEnabled,
      onChange: setCardEnabled,
      Icon: CreditCard,
    },
    {
      id: "blocked",
      label: "Blocked Attempts",
      note: "Get notified when control rules block purchases.",
      checked: blockedEnabled,
      onChange: setBlockedEnabled,
      Icon: Ban,
    },
  ] as const;

  return (
    <div className="relative space-y-5 pb-4">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(100%_55%_at_20%_0%,rgba(245,158,11,0.17),transparent_55%),radial-gradient(80%_40%_at_100%_0%,rgba(250,204,21,0.12),transparent_52%)]" />

      <Card className={PREMIUM_CARD}>
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge className="mb-3 border-amber-300/70 bg-amber-100/70 text-amber-800 dark:border-amber-400/40 dark:bg-amber-900/40 dark:text-amber-200">
                Premium Messaging
              </Badge>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Messaging & Notifications
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Manage WhatsApp and SMS updates with a premium alert experience.
              </p>
            </div>
            <div className="hidden h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/60 bg-amber-100/70 text-amber-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:flex dark:border-amber-400/30 dark:bg-amber-900/35 dark:text-amber-200">
              <MessageCircle className="h-5 w-5" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Alert className="rounded-2xl border-amber-300/65 bg-amber-50/80 text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/35 dark:text-amber-100">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Time-critical gate and card alerts are sent instantly through your selected channel.
        </AlertDescription>
      </Alert>

      <Card className={PREMIUM_CARD}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Smartphone className="h-5 w-5 text-primary" />
            Contact Number
          </CardTitle>
          <CardDescription>
            This number receives your WhatsApp and SMS notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="9876543210 or +919876543210"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className={
              phoneNumber && !validatePhone(phoneNumber)
                ? "border-red-500 focus-visible:ring-red-500"
                : "border-amber-300/60 bg-white/85 dark:bg-amber-950/20"
            }
          />
          <p className="text-xs text-muted-foreground">
            Enter a valid 10-digit Indian number. +91 prefix is supported.
          </p>
          {phoneNumber && !validatePhone(phoneNumber) && (
            <p className="text-xs text-red-500">Invalid phone number format</p>
          )}
        </CardContent>
      </Card>

      <Card className={PREMIUM_CARD}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <MessageCircle className="h-5 w-5 text-primary" />
            Delivery Channel
          </CardTitle>
          <CardDescription>
            Pick how notifications should be delivered.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {CHANNEL_OPTIONS.map((option) => {
              const selected = preferredChannel === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPreferredChannel(option.key)}
                  className={`rounded-2xl border p-3 text-left transition-all duration-200 ${
                    selected
                      ? `${option.accent} shadow-[0_6px_20px_rgba(180,120,0,0.14)]`
                      : "border-amber-200/60 bg-white/70 hover:border-amber-300/80 dark:border-amber-200/20 dark:bg-white/[0.03]"
                  }`}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="mt-1 text-xs opacity-80">{option.note}</p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-amber-200/65 bg-white/65 p-3 dark:border-amber-200/20 dark:bg-white/[0.03]">
            <Checkbox
              id="fallback"
              checked={fallbackEnabled}
              onCheckedChange={(checked: boolean | string) =>
                setFallbackEnabled(checked as boolean)
              }
              disabled={preferredChannel === "BOTH"}
            />
            <label htmlFor="fallback" className="cursor-pointer text-sm">
              Use SMS fallback if WhatsApp delivery fails.
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className={PREMIUM_CARD}>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Notification Types</CardTitle>
          <CardDescription>
            Choose exactly which events you want to be alerted about.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {notificationOptions.map((option) => (
            <div
              key={option.id}
              className="flex items-start gap-3 rounded-2xl border border-amber-200/65 bg-white/65 p-3 dark:border-amber-200/20 dark:bg-white/[0.03]"
            >
              <Checkbox
                id={option.id}
                checked={option.checked}
                onCheckedChange={(checked: boolean | string) =>
                  option.onChange(checked as boolean)
                }
                className="mt-0.5"
              />
              <label htmlFor={option.id} className="flex flex-1 cursor-pointer gap-3">
                <span className="mt-0.5 rounded-xl border border-amber-300/60 bg-amber-100/70 p-1.5 text-amber-700 dark:border-amber-400/30 dark:bg-amber-900/35 dark:text-amber-200">
                  <option.Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{option.note}</span>
                </span>
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className={PREMIUM_CARD}>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Consent & Compliance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200/65 bg-white/65 p-4 dark:border-amber-200/20 dark:bg-white/[0.03]">
            <Checkbox
              id="consent"
              checked={consentGiven}
              onCheckedChange={(checked: boolean | string) =>
                setConsentGiven(checked as boolean)
              }
              className="mt-0.5"
            />
            <label htmlFor="consent" className="cursor-pointer text-sm leading-relaxed">
              <span className="block font-medium">I consent to SMS and WhatsApp notifications</span>
              <span className="mt-1.5 block text-xs text-muted-foreground">
                You can modify this anytime from this page.
              </span>
            </label>
          </div>

          {preferences?.consentGivenAt && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-300/50 bg-emerald-50/75 p-2 text-xs text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle className="h-4 w-4" />
              Consent recorded on {new Date(preferences.consentGivenAt).toLocaleDateString()}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || !phoneNumber || !validatePhone(phoneNumber) || saving}
          size="lg"
          variant="premium"
          className="sm:min-w-[190px]"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Preferences
        </Button>
        <Button
          onClick={handleReset}
          variant="outline"
          disabled={!hasChanges}
          size="lg"
          className="border-amber-300/60 bg-white/70 hover:bg-amber-50/70 dark:border-amber-200/20 dark:bg-white/[0.03]"
        >
          Reset
        </Button>
      </div>

      {!hasChanges && phoneNumber && (
        <Alert className="rounded-2xl border-emerald-300/55 bg-emerald-50/75 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-950/30 dark:text-emerald-200">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>Your messaging preferences are up to date.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
