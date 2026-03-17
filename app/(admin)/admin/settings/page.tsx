"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save, Settings2, Plus, Trash2, Clock3, Sparkles } from "lucide-react";
import {
  type BreakSlot,
  parseBreakSlots,
  serializeBreakSlots,
  timeToMinutes,
  DEFAULT_BREAK_SLOTS,
} from "@/lib/break-slots";

type AppSettings = Record<string, string>;

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function validateBreakSlots(slots: BreakSlot[]): string | null {
  if (slots.length === 0) return "Add at least one break slot.";

  const seenNames = new Set<string>();
  for (const slot of slots) {
    const name = slot.name.trim();
    if (!name) return "Every break needs a name.";
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) return `Duplicate break name: ${name}`;
    seenNames.add(nameKey);

    if (!isValidTime(slot.startTime) || !isValidTime(slot.endTime)) {
      return `Invalid time for ${name}. Use HH:mm.`;
    }
    if (timeToMinutes(slot.endTime) <= timeToMinutes(slot.startTime)) {
      return `${name}: end time must be later than start time.`;
    }
  }

  const sorted = [...slots].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const current = sorted[i];
    if (timeToMinutes(current.startTime) < timeToMinutes(prev.endTime)) {
      return `Time overlap between "${prev.name}" and "${current.name}".`;
    }
  }

  return null;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [breakSlots, setBreakSlots] = useState<BreakSlot[]>([...DEFAULT_BREAK_SLOTS]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      const loaded = (data.settings || {}) as AppSettings;
      setSettings(loaded);
      setBreakSlots(parseBreakSlots(loaded.subscription_breaks_json));
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateBreakSlot = (index: number, patch: Partial<BreakSlot>) => {
    setBreakSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
  };

  const addBreakSlot = () => {
    const fallback = DEFAULT_BREAK_SLOTS[breakSlots.length % DEFAULT_BREAK_SLOTS.length];
    setBreakSlots((prev) => [
      ...prev,
      {
        name: `Break ${prev.length + 1}`,
        startTime: fallback.startTime,
        endTime: fallback.endTime,
      },
    ]);
  };

  const removeBreakSlot = (index: number) => {
    setBreakSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const timelineSlots = useMemo(
    () =>
      [...breakSlots].sort(
        (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
      ),
    [breakSlots],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const validationError = validateBreakSlots(breakSlots);
      if (validationError) throw new Error(validationError);

      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            ...settings,
            subscription_breaks_json: serializeBreakSlots(breakSlots),
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      toast.success("Subscription settings updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      <Card className="overflow-hidden border-0 shadow-sm bg-gradient-to-br from-[#f58220] via-[#e27417] to-[#c45f0d] text-white">
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white/10 p-2.5">
              <Sparkles className="h-5 w-5 text-[#f5c862]" />
            </div>
            <div>
              <p className="text-sm text-white/80">Admin Control Center</p>
              <h1 className="text-2xl font-bold tracking-tight">Subscription Experience Settings</h1>
              <p className="text-sm text-white/75 mt-1">
                Configure premium pre-order rules and break windows used by parents and kiosk automation.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Subscription Rules
          </CardTitle>
          <CardDescription>
            Values applied during pre-order creation and edit validation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min_order_value">Minimum Order Value (Rs)</Label>
              <Input
                id="min_order_value"
                type="number"
                min={0}
                value={settings.subscription_min_order_value || "60"}
                onChange={(e) => updateSetting("subscription_min_order_value", e.target.value)}
              />
            </div>

            <div className="rounded-xl border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Applied policy</p>
              <p className="text-sm font-medium mt-1">
                Existing subscriptions remain valid. New/food edits use current minimum.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min_days">Min School Days</Label>
              <Input
                id="min_days"
                type="number"
                min={1}
                value={settings.subscription_min_days || "3"}
                onChange={(e) => updateSetting("subscription_min_days", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_days">Max School Days</Label>
              <Input
                id="max_days"
                type="number"
                min={1}
                value={settings.subscription_max_days || "180"}
                onChange={(e) => updateSetting("subscription_max_days", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-[#d4891a]" />
            Break Schedule
          </CardTitle>
          <CardDescription>
            Set break name and time window. Kiosk places pre-orders only for the active break.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {breakSlots.map((slot, index) => (
            <div key={`${index}-${slot.name}`} className="rounded-xl border p-3 bg-card">
              <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-end">
                <div className="space-y-1">
                  <Label>Break Name</Label>
                  <Input
                    value={slot.name}
                    onChange={(e) => updateBreakSlot(index, { name: e.target.value })}
                    placeholder="Lunch Break"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Start</Label>
                  <Input
                    type="time"
                    value={slot.startTime}
                    onChange={(e) => updateBreakSlot(index, { startTime: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>End</Label>
                  <Input
                    type="time"
                    value={slot.endTime}
                    onChange={(e) => updateBreakSlot(index, { endTime: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-red-600 hover:text-red-700"
                  onClick={() => removeBreakSlot(index)}
                  disabled={breakSlots.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" onClick={addBreakSlot} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Break
          </Button>

          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground mb-2">Timeline Preview</p>
            <div className="flex flex-wrap gap-2">
              {timelineSlots.map((slot) => (
                <span
                  key={`${slot.name}-${slot.startTime}-${slot.endTime}`}
                  className="inline-flex items-center rounded-full border bg-background px-2.5 py-1 text-xs"
                >
                  {slot.name} ({slot.startTime}-{slot.endTime})
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-11 text-base bg-[#f58220] hover:bg-[#e27417]"
      >
        {saving ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
        ) : (
          <><Save className="h-4 w-4 mr-2" /> Save Subscription Settings</>
        )}
      </Button>
    </div>
  );
}
