"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle, Loader2, MessageCircle, Smartphone } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

  // Fetch preferences on mount
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

    fetchPreferences();
  }, []);

  const validatePhone = (phone: string): boolean => {
    if (!phone) return true; // Optional
    const cleaned = phone.replace(/[\s\-\(\)]/g, "");
    return /^(\+91|91)?[6-9]\d{9}$/.test(cleaned);
  };

  const handleSave = useCallback(async () => {
    if (phoneNumber && !validatePhone(phoneNumber)) {
      toast.error("Invalid phone number format. Use 10-digit Indian number.");
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
  }, [phoneNumber, preferredChannel, fallbackEnabled, gateEnabled, orderEnabled, spendingEnabled, cardEnabled, blockedEnabled, consentGiven]);

  const handleReset = () => {
    if (preferences) {
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
    }
  };

  // Track changes
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
  }, [phoneNumber, preferredChannel, fallbackEnabled, gateEnabled, orderEnabled, spendingEnabled, cardEnabled, blockedEnabled, consentGiven, preferences]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Messaging & Notifications</h1>
        <p className="text-muted-foreground mt-2">
          Manage how you receive SMS and WhatsApp notifications about your child's activities
        </p>
      </div>

      <Alert className="border-blue-200 bg-blue-50">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-900">
          We send time-critical notifications for gate entry/exit and card issuance via WhatsApp or SMS to ensure you stay informed instantly.
        </AlertDescription>
      </Alert>

      {/* Phone Number Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Phone Number
          </CardTitle>
          <CardDescription>
            Where we'll send your WhatsApp and SMS notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="9876543210 or +919876543210"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className={phoneNumber && !validatePhone(phoneNumber) ? "border-red-500" : ""}
            />
            <p className="text-xs text-muted-foreground">
              Enter a 10-digit Indian phone number. We'll add +91 prefix automatically.
            </p>
            {phoneNumber && !validatePhone(phoneNumber) && (
              <p className="text-xs text-red-500">Invalid phone number format</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Channel Preference Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Notification Channel
          </CardTitle>
          <CardDescription>
            Choose how you'd like to receive notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className={`relative flex cursor-pointer items-center space-x-3 rounded-lg border-2 p-4 transition-colors ${
                preferredChannel === "WHATSAPP"
                  ? "border-green-500 bg-green-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setPreferredChannel("WHATSAPP")}
            >
              <input
                type="radio"
                name="channel"
                value="WHATSAPP"
                checked={preferredChannel === "WHATSAPP"}
                onChange={() => setPreferredChannel("WHATSAPP")}
                className="h-4 w-4"
              />
              <div>
                <p className="font-medium">WhatsApp</p>
                <p className="text-xs text-muted-foreground">Rich messages, faster</p>
              </div>
            </div>

            <div
              className={`relative flex cursor-pointer items-center space-x-3 rounded-lg border-2 p-4 transition-colors ${
                preferredChannel === "SMS"
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setPreferredChannel("SMS")}
            >
              <input
                type="radio"
                name="channel"
                value="SMS"
                checked={preferredChannel === "SMS"}
                onChange={() => setPreferredChannel("SMS")}
                className="h-4 w-4"
              />
              <div>
                <p className="font-medium">SMS</p>
                <p className="text-xs text-muted-foreground">Works on any phone</p>
              </div>
            </div>

            <div
              className={`relative flex cursor-pointer items-center space-x-3 rounded-lg border-2 p-4 transition-colors ${
                preferredChannel === "BOTH"
                  ? "border-purple-500 bg-purple-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              onClick={() => setPreferredChannel("BOTH")}
            >
              <input
                type="radio"
                name="channel"
                value="BOTH"
                checked={preferredChannel === "BOTH"}
                onChange={() => setPreferredChannel("BOTH")}
                className="h-4 w-4"
              />
              <div>
                <p className="font-medium">Both (Fallback)</p>
                <p className="text-xs text-muted-foreground">WhatsApp + SMS backup</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 rounded-lg border border-gray-200 p-3">
            <Checkbox
              id="fallback"
              checked={fallbackEnabled}
              onCheckedChange={(checked: boolean | string) => setFallbackEnabled(checked as boolean)}
              disabled={preferredChannel === "BOTH"}
            />
            <label
              htmlFor="fallback"
              className="flex-1 text-sm cursor-pointer"
            >
              Enable fallback: If WhatsApp fails, send SMS as backup
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Notification Type Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Types</CardTitle>
          <CardDescription>
            Choose which types of notifications to receive
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <Checkbox
                id="gate"
                checked={gateEnabled}
                onCheckedChange={(checked: boolean | string) => setGateEnabled(checked as boolean)}
              />
              <label htmlFor="gate" className="flex-1 cursor-pointer">
                <p className="font-medium text-sm">Gate Entry/Exit</p>
                <p className="text-xs text-muted-foreground">
                  Notified when your child enters or exits the campus
                </p>
              </label>
            </div>

            <div className="flex items-center space-x-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <Checkbox
                id="order"
                checked={orderEnabled}
                onCheckedChange={(checked: boolean | string) => setOrderEnabled(checked as boolean)}
              />
              <label htmlFor="order" className="flex-1 cursor-pointer">
                <p className="font-medium text-sm">Kiosk Orders</p>
                <p className="text-xs text-muted-foreground">
                  Order placed, preparing, and ready for pickup
                </p>
              </label>
            </div>

            <div className="flex items-center space-x-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <Checkbox
                id="spending"
                checked={spendingEnabled}
                onCheckedChange={(checked: boolean | string) => setSpendingEnabled(checked as boolean)}
              />
              <label htmlFor="spending" className="flex-1 cursor-pointer">
                <p className="font-medium text-sm">Wallet Transactions</p>
                <p className="text-xs text-muted-foreground">
                  Wallet top-ups and spending updates
                </p>
              </label>
            </div>

            <div className="flex items-center space-x-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <Checkbox
                id="card"
                checked={cardEnabled}
                onCheckedChange={(checked: boolean | string) => setCardEnabled(checked as boolean)}
              />
              <label htmlFor="card" className="flex-1 cursor-pointer">
                <p className="font-medium text-sm">Card Issuance</p>
                <p className="text-xs text-muted-foreground">
                  New permanent or temporary cards issued
                </p>
              </label>
            </div>

            <div className="flex items-center space-x-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <Checkbox
                id="blocked"
                checked={blockedEnabled}
                onCheckedChange={(checked: boolean | string) => setBlockedEnabled(checked as boolean)}
              />
              <label htmlFor="blocked" className="flex-1 cursor-pointer">
                <p className="font-medium text-sm">Blocked Attempts</p>
                <p className="text-xs text-muted-foreground">
                  When purchases are blocked per your spending controls
                </p>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Consent Section */}
      <Card>
        <CardHeader>
          <CardTitle>Consent & Compliance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start space-x-3 rounded-lg border border-gray-200 p-4">
            <Checkbox
              id="consent"
              checked={consentGiven}
              onCheckedChange={(checked: boolean | string) => setConsentGiven(checked as boolean)}
              className="mt-1"
            />
            <label htmlFor="consent" className="flex-1 cursor-pointer">
              <p className="font-medium text-sm">I consent to receive SMS and WhatsApp notifications</p>
              <p className="text-xs text-muted-foreground mt-2">
                By checking this box, you explicitly consent to receive SMS and WhatsApp messages about your child's activities. You can modify or opt-out at any time from this page.
              </p>
            </label>
          </div>

          {preferences?.consentGivenAt && (
            <div className="flex items-center gap-2 text-xs text-green-600 rounded-lg bg-green-50 p-2">
              <CheckCircle className="h-4 w-4" />
              Consent given on {new Date(preferences.consentGivenAt).toLocaleDateString()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || !phoneNumber || !validatePhone(phoneNumber) || saving}
          size="lg"
          className="flex-1 md:flex-none"
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Preferences
        </Button>
        <Button
          onClick={handleReset}
          variant="outline"
          disabled={!hasChanges}
          size="lg"
          className="flex-1 md:flex-none"
        >
          Reset
        </Button>
      </div>

      {!hasChanges && phoneNumber && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-900">
            Your messaging preferences are up to date.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
