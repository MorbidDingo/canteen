"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
};

const CHANNEL_OPTIONS: ChannelOption[] = [
  { key: "WHATSAPP", label: "WhatsApp", note: "Rich & fast" },
  { key: "SMS", label: "SMS", note: "Every phone" },
  { key: "BOTH", label: "Both", note: "Primary + fallback" },
];

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
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const notificationOptions = [
    { id: "gate", label: "Gate Entry/Exit", note: "Know when your child enters or exits campus.", checked: gateEnabled, onChange: setGateEnabled, Icon: Shield },
    { id: "order", label: "Kiosk Orders", note: "Order placed, preparing, and ready-for-pickup.", checked: orderEnabled, onChange: setOrderEnabled, Icon: ShoppingCart },
    { id: "spending", label: "Wallet Transactions", note: "Top-up and spend alerts in real time.", checked: spendingEnabled, onChange: setSpendingEnabled, Icon: Wallet },
    { id: "card", label: "Card Issuance", note: "Permanent and temporary card issuance.", checked: cardEnabled, onChange: setCardEnabled, Icon: CreditCard },
    { id: "blocked", label: "Blocked Attempts", note: "When control rules block purchases.", checked: blockedEnabled, onChange: setBlockedEnabled, Icon: Ban },
  ] as const;

  return (
    <div className="app-shell-compact space-y-4 pb-6">
      {/* Header */}
      <div className="app-header-card bg-gradient-to-br from-amber-50/60 via-white to-orange-50/40 dark:from-amber-950/20 dark:via-background dark:to-orange-950/15">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="app-title">Messaging</h1>
            <p className="text-xs text-muted-foreground">WhatsApp & SMS notification preferences</p>
          </div>
        </div>
      </div>

      {/* Phone number */}
      <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card/80">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="phone" className="text-sm font-medium">Contact Number</Label>
          </div>
          <Input
            id="phone"
            type="tel"
            placeholder="9876543210 or +919876543210"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className={cn(
              "rounded-xl",
              phoneNumber && !validatePhone(phoneNumber)
                ? "border-red-500 focus-visible:ring-red-500"
                : "",
            )}
          />
          {phoneNumber && !validatePhone(phoneNumber) && (
            <p className="text-xs text-red-500">Invalid phone number format</p>
          )}
        </CardContent>
      </Card>

      {/* Channel selector */}
      <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card/80">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Delivery Channel</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {CHANNEL_OPTIONS.map((option) => {
              const selected = preferredChannel === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPreferredChannel(option.key)}
                  className={cn(
                    "rounded-xl border p-2.5 text-center transition-all",
                    selected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/60 hover:border-primary/30",
                  )}
                >
                  <p className={cn("text-xs font-semibold", selected && "text-primary")}>{option.label}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{option.note}</p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/50 p-3">
            <Checkbox
              id="fallback"
              checked={fallbackEnabled}
              onCheckedChange={(checked: boolean | string) =>
                setFallbackEnabled(checked as boolean)
              }
              disabled={preferredChannel === "BOTH"}
            />
            <label htmlFor="fallback" className="cursor-pointer text-xs">
              SMS fallback if WhatsApp fails
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Notification types */}
      <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card/80">
        <CardContent className="p-4 space-y-2">
          <span className="text-sm font-medium">Notification Types</span>
          <div className="space-y-1.5">
            {notificationOptions.map((option) => (
              <div
                key={option.id}
                className="flex items-center gap-3 rounded-xl border border-border/50 p-3"
              >
                <Checkbox
                  id={option.id}
                  checked={option.checked}
                  onCheckedChange={(checked: boolean | string) =>
                    option.onChange(checked as boolean)
                  }
                />
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <option.Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <label htmlFor={option.id} className="cursor-pointer min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-tight">{option.label}</span>
                  <span className="block text-[11px] text-muted-foreground leading-snug">{option.note}</span>
                </label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Consent */}
      <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card/80">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-border/50 p-3">
            <Checkbox
              id="consent"
              checked={consentGiven}
              onCheckedChange={(checked: boolean | string) =>
                setConsentGiven(checked as boolean)
              }
            />
            <label htmlFor="consent" className="cursor-pointer text-sm leading-relaxed">
              <span className="block font-medium">I consent to SMS & WhatsApp notifications</span>
              <span className="block text-[11px] text-muted-foreground">You can change this anytime.</span>
            </label>
          </div>

          {preferences?.consentGivenAt && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-300/50 bg-emerald-50/60 p-2.5 text-xs text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle className="h-3.5 w-3.5" />
              Consent recorded {new Date(preferences.consentGivenAt).toLocaleDateString()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || !phoneNumber || !validatePhone(phoneNumber) || saving}
          className="flex-1"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Preferences
        </Button>
        <Button
          onClick={handleReset}
          variant="outline"
          disabled={!hasChanges}
        >
          Reset
        </Button>
      </div>

      {!hasChanges && phoneNumber && (
        <Alert className="rounded-2xl border-emerald-300/40 bg-emerald-50/60 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-950/30 dark:text-emerald-200">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>Your messaging preferences are up to date.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
