"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Save, Settings2, Plus, Trash2, Clock3, Sparkles, Store, Library, Pencil, X, Check, MapPin } from "lucide-react";
import {
  type BreakSlot,
  parseBreakSlots,
  serializeBreakSlots,
  timeToMinutes,
  DEFAULT_BREAK_SLOTS,
} from "@/lib/break-slots";

type AppSettings = Record<string, string>;

type CanteenEntity = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  status: string;
};

type LibraryEntity = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  status: string;
};

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

  // Canteen management state
  const [canteens, setCanteens] = useState<CanteenEntity[]>([]);
  const [canteensLoading, setCanteensLoading] = useState(true);
  const [editingCanteen, setEditingCanteen] = useState<string | null>(null);
  const [newCanteen, setNewCanteen] = useState({ name: "", description: "", location: "" });
  const [showNewCanteenForm, setShowNewCanteenForm] = useState(false);
  const [canteenSaving, setCanteenSaving] = useState(false);

  // Library management state
  const [libraries, setLibraries] = useState<LibraryEntity[]>([]);
  const [librariesLoading, setLibrariesLoading] = useState(true);
  const [editingLibrary, setEditingLibrary] = useState<string | null>(null);
  const [newLibrary, setNewLibrary] = useState({ name: "", description: "", location: "" });
  const [showNewLibraryForm, setShowNewLibraryForm] = useState(false);
  const [librarySaving, setLibrarySaving] = useState(false);

  // Inline edit buffers
  const [canteenEdits, setCanteenEdits] = useState<Record<string, { name: string; description: string; location: string }>>({});
  const [libraryEdits, setLibraryEdits] = useState<Record<string, { name: string; description: string; location: string }>>({});

  const fetchCanteens = useCallback(async () => {
    try {
      setCanteensLoading(true);
      const res = await fetch("/api/org/canteens");
      if (!res.ok) return;
      const data = await res.json();
      setCanteens(data.canteens ?? []);
    } finally {
      setCanteensLoading(false);
    }
  }, []);

  const fetchLibraries = useCallback(async () => {
    try {
      setLibrariesLoading(true);
      const res = await fetch("/api/org/libraries");
      if (!res.ok) return;
      const data = await res.json();
      setLibraries(data.libraries ?? []);
    } finally {
      setLibrariesLoading(false);
    }
  }, []);

  const createCanteen = async () => {
    if (!newCanteen.name.trim()) return toast.error("Canteen name is required");
    setCanteenSaving(true);
    try {
      const res = await fetch("/api/org/canteens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCanteen.name.trim(), description: newCanteen.description || undefined, location: newCanteen.location || undefined }),
      });
      if (!res.ok) throw new Error("Failed to create canteen");
      toast.success("Canteen created");
      setNewCanteen({ name: "", description: "", location: "" });
      setShowNewCanteenForm(false);
      void fetchCanteens();
    } catch {
      toast.error("Failed to create canteen");
    } finally {
      setCanteenSaving(false);
    }
  };

  const saveCanteenEdit = async (id: string) => {
    const edit = canteenEdits[id];
    if (!edit?.name?.trim()) return toast.error("Name is required");
    setCanteenSaving(true);
    try {
      const res = await fetch("/api/org/canteens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: edit.name.trim(), description: edit.description || undefined, location: edit.location || undefined }),
      });
      if (!res.ok) throw new Error("Failed to update canteen");
      toast.success("Canteen updated");
      setEditingCanteen(null);
      void fetchCanteens();
    } catch {
      toast.error("Failed to update canteen");
    } finally {
      setCanteenSaving(false);
    }
  };

  const toggleCanteenStatus = async (c: CanteenEntity) => {
    try {
      const res = await fetch("/api/org/canteens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, status: c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
      });
      if (!res.ok) throw new Error();
      void fetchCanteens();
    } catch {
      toast.error("Failed to update canteen status");
    }
  };

  const createLibrary = async () => {
    if (!newLibrary.name.trim()) return toast.error("Library name is required");
    setLibrarySaving(true);
    try {
      const res = await fetch("/api/org/libraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newLibrary.name.trim(), description: newLibrary.description || undefined, location: newLibrary.location || undefined }),
      });
      if (!res.ok) throw new Error("Failed to create library");
      toast.success("Library created");
      setNewLibrary({ name: "", description: "", location: "" });
      setShowNewLibraryForm(false);
      void fetchLibraries();
    } catch {
      toast.error("Failed to create library");
    } finally {
      setLibrarySaving(false);
    }
  };

  const saveLibraryEdit = async (id: string) => {
    const edit = libraryEdits[id];
    if (!edit?.name?.trim()) return toast.error("Name is required");
    setLibrarySaving(true);
    try {
      const res = await fetch("/api/org/libraries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: edit.name.trim(), description: edit.description || undefined, location: edit.location || undefined }),
      });
      if (!res.ok) throw new Error("Failed to update library");
      toast.success("Library updated");
      setEditingLibrary(null);
      void fetchLibraries();
    } catch {
      toast.error("Failed to update library");
    } finally {
      setLibrarySaving(false);
    }
  };

  const toggleLibraryStatus = async (l: LibraryEntity) => {
    try {
      const res = await fetch("/api/org/libraries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: l.id, status: l.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }),
      });
      if (!res.ok) throw new Error();
      void fetchLibraries();
    } catch {
      toast.error("Failed to update library status");
    }
  };

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
    void fetchCanteens();
    void fetchLibraries();
  }, [fetchSettings, fetchCanteens, fetchLibraries]);

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

      {/* ── Canteen Management ───────────────────────────── */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5 text-[#d4891a]" />
                Canteen Management
              </CardTitle>
              <CardDescription>Create and configure canteens for your organisation.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowNewCanteenForm((v) => !v)}
            >
              {showNewCanteenForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {showNewCanteenForm ? "Cancel" : "Add Canteen"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showNewCanteenForm && (
            <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Canteen</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input
                  placeholder="Name (e.g. North Block Canteen)"
                  value={newCanteen.name}
                  onChange={(e) => setNewCanteen((p) => ({ ...p, name: e.target.value }))}
                />
                <Input
                  placeholder="Description (optional)"
                  value={newCanteen.description}
                  onChange={(e) => setNewCanteen((p) => ({ ...p, description: e.target.value }))}
                />
                <Input
                  placeholder="Location (optional)"
                  value={newCanteen.location}
                  onChange={(e) => setNewCanteen((p) => ({ ...p, location: e.target.value }))}
                />
              </div>
              <Button size="sm" onClick={createCanteen} disabled={canteenSaving} className="gap-1.5 bg-[#f58220] hover:bg-[#e27417] text-white">
                {canteenSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save Canteen
              </Button>
            </div>
          )}

          {canteensLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : canteens.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No canteens yet. Add your first canteen above.</p>
          ) : (
            <div className="space-y-2">
              {canteens.map((c) => (
                <div key={c.id} className="rounded-xl border bg-card p-3">
                  {editingCanteen === c.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Input
                          value={canteenEdits[c.id]?.name ?? c.name}
                          onChange={(e) => setCanteenEdits((p) => ({ ...p, [c.id]: { name: e.target.value, description: p[c.id]?.description ?? (c.description ?? ""), location: p[c.id]?.location ?? (c.location ?? "") } }))}
                          placeholder="Name"
                        />
                        <Input
                          value={canteenEdits[c.id]?.description ?? (c.description || "")}
                          onChange={(e) => setCanteenEdits((p) => ({ ...p, [c.id]: { name: p[c.id]?.name ?? c.name, description: e.target.value, location: p[c.id]?.location ?? (c.location ?? "") } }))}
                          placeholder="Description"
                        />
                        <Input
                          value={canteenEdits[c.id]?.location ?? (c.location || "")}
                          onChange={(e) => setCanteenEdits((p) => ({ ...p, [c.id]: { name: p[c.id]?.name ?? c.name, description: p[c.id]?.description ?? (c.description ?? ""), location: e.target.value } }))}
                          placeholder="Location"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveCanteenEdit(c.id)} disabled={canteenSaving} className="gap-1 bg-[#f58220] hover:bg-[#e27417] text-white">
                          {canteenSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingCanteen(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{c.name}</span>
                          <Badge variant={c.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                            {c.status}
                          </Badge>
                        </div>
                        {(c.location || c.description) && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                            {c.location && <><MapPin className="h-2.5 w-2.5 shrink-0" />{c.location}</>}
                            {c.description && <span className="truncate">{c.description}</span>}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setCanteenEdits((p) => ({ ...p, [c.id]: { name: c.name, description: c.description ?? "", location: c.location ?? "" } }));
                            setEditingCanteen(c.id);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={`h-7 px-2 text-xs ${c.status === "ACTIVE" ? "text-orange-600 hover:text-orange-700" : "text-green-600 hover:text-green-700"}`}
                          onClick={() => toggleCanteenStatus(c)}
                        >
                          {c.status === "ACTIVE" ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Library Management ───────────────────────────── */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Library className="h-5 w-5 text-[#d4891a]" />
                Library Management
              </CardTitle>
              <CardDescription>Create and configure libraries for your organisation.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowNewLibraryForm((v) => !v)}
            >
              {showNewLibraryForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {showNewLibraryForm ? "Cancel" : "Add Library"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showNewLibraryForm && (
            <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Library</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input
                  placeholder="Name (e.g. Main Library)"
                  value={newLibrary.name}
                  onChange={(e) => setNewLibrary((p) => ({ ...p, name: e.target.value }))}
                />
                <Input
                  placeholder="Description (optional)"
                  value={newLibrary.description}
                  onChange={(e) => setNewLibrary((p) => ({ ...p, description: e.target.value }))}
                />
                <Input
                  placeholder="Location (optional)"
                  value={newLibrary.location}
                  onChange={(e) => setNewLibrary((p) => ({ ...p, location: e.target.value }))}
                />
              </div>
              <Button size="sm" onClick={createLibrary} disabled={librarySaving} className="gap-1.5 bg-[#f58220] hover:bg-[#e27417] text-white">
                {librarySaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save Library
              </Button>
            </div>
          )}

          {librariesLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : libraries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No libraries yet. Add your first library above.</p>
          ) : (
            <div className="space-y-2">
              {libraries.map((l) => (
                <div key={l.id} className="rounded-xl border bg-card p-3">
                  {editingLibrary === l.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Input
                          value={libraryEdits[l.id]?.name ?? l.name}
                          onChange={(e) => setLibraryEdits((p) => ({ ...p, [l.id]: { name: e.target.value, description: p[l.id]?.description ?? (l.description ?? ""), location: p[l.id]?.location ?? (l.location ?? "") } }))}
                          placeholder="Name"
                        />
                        <Input
                          value={libraryEdits[l.id]?.description ?? (l.description || "")}
                          onChange={(e) => setLibraryEdits((p) => ({ ...p, [l.id]: { name: p[l.id]?.name ?? l.name, description: e.target.value, location: p[l.id]?.location ?? (l.location ?? "") } }))}
                          placeholder="Description"
                        />
                        <Input
                          value={libraryEdits[l.id]?.location ?? (l.location || "")}
                          onChange={(e) => setLibraryEdits((p) => ({ ...p, [l.id]: { name: p[l.id]?.name ?? l.name, description: p[l.id]?.description ?? (l.description ?? ""), location: e.target.value } }))}
                          placeholder="Location"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveLibraryEdit(l.id)} disabled={librarySaving} className="gap-1 bg-[#f58220] hover:bg-[#e27417] text-white">
                          {librarySaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingLibrary(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{l.name}</span>
                          <Badge variant={l.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                            {l.status}
                          </Badge>
                        </div>
                        {(l.location || l.description) && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                            {l.location && <><MapPin className="h-2.5 w-2.5 shrink-0" />{l.location}</>}
                            {l.description && <span className="truncate">{l.description}</span>}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setLibraryEdits((p) => ({ ...p, [l.id]: { name: l.name, description: l.description ?? "", location: l.location ?? "" } }));
                            setEditingLibrary(l.id);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={`h-7 px-2 text-xs ${l.status === "ACTIVE" ? "text-orange-600 hover:text-orange-700" : "text-green-600 hover:text-green-700"}`}
                          onClick={() => toggleLibraryStatus(l)}
                        >
                          {l.status === "ACTIVE" ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
