"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save, Settings2 } from "lucide-react";

type AppSettings = Record<string, string>;

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings || {});
      }
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      toast.success("Settings saved successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Settings2 className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Subscription Settings</h1>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Pre-Order / Subscription Rules</CardTitle>
          <CardDescription>
            Configure minimum order values and duration limits for parent subscriptions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="min_order_value">Minimum Order Value (₹)</Label>
            <Input
              id="min_order_value"
              type="number"
              min={0}
              value={settings.subscription_min_order_value || "60"}
              onChange={(e) => updateSetting("subscription_min_order_value", e.target.value)}
              placeholder="60"
            />
            <p className="text-xs text-muted-foreground">
              Parents must order at least this amount for subscriptions. Defaults to ₹60 if not set.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min_days">Min Subscription Days</Label>
              <Input
                id="min_days"
                type="number"
                min={1}
                value={settings.subscription_min_days || "3"}
                onChange={(e) => updateSetting("subscription_min_days", e.target.value)}
                placeholder="3"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_days">Max Subscription Days</Label>
              <Input
                id="max_days"
                type="number"
                min={1}
                value={settings.subscription_max_days || "180"}
                onChange={(e) => updateSetting("subscription_max_days", e.target.value)}
                placeholder="180"
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              <><Save className="h-4 w-4 mr-2" /> Save Settings</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
