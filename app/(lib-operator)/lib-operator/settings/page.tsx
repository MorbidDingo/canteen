"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Settings,
  Loader2,
  Save,
  BookOpen,
  RotateCcw,
  IndianRupee,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import { LibrarySelector } from "@/components/library-selector";
import { usePersistedSelection } from "@/lib/use-persisted-selection";

export default function LibOperatorSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fineMode = settings.fine_mode === "WEEK" ? "WEEK" : "DAY";

  const {
    value: selectedLibrary,
    setValue: setSelectedLibrary,
  } = usePersistedSelection("certe:selected-library-id");

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const url = selectedLibrary
        ? `/api/management/library/settings?libraryId=${encodeURIComponent(selectedLibrary)}`
        : "/api/management/library/settings";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setSettings(data.settings);
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [selectedLibrary]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/management/library/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings, libraryId: selectedLibrary }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to save settings");
        return;
      }

      setSettings(data.settings);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function updateSetting(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSetting(key: string) {
    setSettings((prev) => ({
      ...prev,
      [key]: prev[key] === "true" ? "false" : "true",
    }));
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#d4891a]" />
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="container mx-auto max-w-2xl px-4 pt-5">
        <div className="rounded-2xl border border-[#d4891a]/15 bg-white/70 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#d4891a] shadow-sm">
                <Settings className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold leading-none">Library Settings</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Configure issue, return, and fine rules
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/lib-operator/dashboard">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              </Link>
              <Button
                onClick={handleSave}
                disabled={saving}
                size="sm"
                className="bg-[#d4891a] shadow-sm hover:bg-[#d4891a]/90"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <LibrarySelector value={selectedLibrary} onChange={setSelectedLibrary} compact />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Settings apply to all libraries in this organization.
          </p>
        </div>
      </div>

      <div className="container mx-auto max-w-2xl space-y-4 px-4 py-6">
        {/* Issue Rules */}
        <Card className="border-[#d4891a]/15 shadow-sm overflow-hidden">
          <CardHeader className="pb-3 bg-gradient-to-r from-[#d4891a]/5 to-transparent border-b border-[#d4891a]/10">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-[#d4891a]/10 flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-[#d4891a]" />
              </div>
              <div>
                <CardTitle className="text-base">Issue Rules</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Control how books are issued to students
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup
                label="Issue Duration"
                hint="Days a book can be borrowed"
                suffix="days"
              >
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={settings.issue_duration_days || "7"}
                  onChange={(e) => updateSetting("issue_duration_days", e.target.value)}
                />
              </FieldGroup>
              <FieldGroup
                label="Max Books Per Student"
                hint="Maximum concurrent borrows"
              >
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={settings.max_books_per_student || "3"}
                  onChange={(e) => updateSetting("max_books_per_student", e.target.value)}
                />
              </FieldGroup>
              <FieldGroup
                label="Request Hold Duration"
                hint="Hours a book is held when requested via app"
                suffix="hours"
              >
                <Input
                  type="number"
                  min="1"
                  max="720"
                  value={settings.request_hold_hours || "48"}
                  onChange={(e) => updateSetting("request_hold_hours", e.target.value)}
                />
              </FieldGroup>
              <FieldGroup
                label="Max Reissues"
                hint="Renewal limit per book"
              >
                <Input
                  type="number"
                  min="0"
                  max="10"
                  value={settings.max_reissues || "3"}
                  onChange={(e) => updateSetting("max_reissues", e.target.value)}
                />
              </FieldGroup>
              <FieldGroup
                label="Reissue Duration"
                hint="Extra days per renewal"
                suffix="days"
              >
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={settings.reissue_duration_days || "7"}
                  onChange={(e) => updateSetting("reissue_duration_days", e.target.value)}
                />
              </FieldGroup>
            </div>
          </CardContent>
        </Card>

        {/* Return Rules */}
        <Card className="border-[#d4891a]/15 shadow-sm overflow-hidden">
          <CardHeader className="pb-3 bg-gradient-to-r from-[#d4891a]/5 to-transparent border-b border-[#d4891a]/10">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-[#d4891a]/10 flex items-center justify-center">
                <RotateCcw className="h-4 w-4 text-[#d4891a]" />
              </div>
              <div>
                <CardTitle className="text-base">Return Rules</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Control how book returns are handled
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <ToggleField
              label="Require Operator Confirmation for Returns"
              description="Student self-returns go to RETURN_PENDING and must be confirmed by you"
              checked={settings.require_operator_return_confirmation === "true"}
              onChange={() => toggleSetting("require_operator_return_confirmation")}
            />
            <Separator />
            <ToggleField
              label="Block New Issues If Student Has Overdue Books"
              description="Prevent students from borrowing new books until overdue books are returned"
              checked={settings.block_issue_if_overdue === "true"}
              onChange={() => toggleSetting("block_issue_if_overdue")}
            />
          </CardContent>
        </Card>

        {/* Fine Settings */}
        <Card className="border-[#d4891a]/15 shadow-sm overflow-hidden">
          <CardHeader className="pb-3 bg-gradient-to-r from-[#d4891a]/5 to-transparent border-b border-[#d4891a]/10">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-[#d4891a]/10 flex items-center justify-center">
                <IndianRupee className="h-4 w-4 text-[#d4891a]" />
              </div>
              <div>
                <CardTitle className="text-base">Fine Settings</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Overdue penalty - fines auto-deduct from wallet on return
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {/* Fine Mode segmented control */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Fine Mode
              </Label>
              <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-lg border border-input">
                {["DAY", "WEEK"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => updateSetting("fine_mode", mode)}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      fineMode === mode
                        ? "bg-[#d4891a] text-white"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    Per {mode === "DAY" ? "Day" : "Week"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldGroup
                label="Fine Per Day"
                hint={fineMode === "DAY" ? "Active" : "Inactive in weekly mode"}
              >
                <CurrencyInput
                  value={settings.fine_per_day || "0"}
                  onChange={(v) => updateSetting("fine_per_day", v)}
                  disabled={fineMode !== "DAY"}
                />
              </FieldGroup>
              <FieldGroup
                label="Fine Per Week"
                hint={fineMode === "WEEK" ? "Active" : "Inactive in daily mode"}
              >
                <CurrencyInput
                  value={settings.fine_per_week || "0"}
                  onChange={(v) => updateSetting("fine_per_week", v)}
                  disabled={fineMode !== "WEEK"}
                />
              </FieldGroup>
              <FieldGroup
                label="Max Fine Per Book"
                hint="Cap on total fine per book"
              >
                <CurrencyInput
                  value={settings.max_fine_per_book || "100"}
                  onChange={(v) => updateSetting("max_fine_per_book", v)}
                />
              </FieldGroup>
            </div>
          </CardContent>
        </Card>

        {/* Access Control */}
        <Card className="border-[#d4891a]/15 shadow-sm overflow-hidden">
          <CardHeader className="pb-3 bg-gradient-to-r from-[#d4891a]/5 to-transparent border-b border-[#d4891a]/10">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-[#d4891a]/10 flex items-center justify-center">
                <ShieldCheck className="h-4 w-4 text-[#d4891a]" />
              </div>
              <div>
                <CardTitle className="text-base">Access Control</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Control self-service terminal behavior
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <ToggleField
              label="Allow Self-Service Issue"
              description="Let students issue books from the kiosk terminal without operator intervention"
              checked={settings.allow_self_service_issue === "true"}
              onChange={() => toggleSetting("allow_self_service_issue")}
            />
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur sm:hidden">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-[#d4891a] hover:bg-[#d4891a]/90"
        >
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

function FieldGroup({
  label,
  hint,
  suffix,
  children,
}: {
  label: string;
  hint?: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {suffix && <span className="text-muted-foreground font-normal ml-1">({suffix})</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CurrencyInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex rounded-md border border-input overflow-hidden ${disabled ? "opacity-40" : ""}`}>
      <span className="flex items-center px-2.5 bg-muted border-r border-input text-sm text-muted-foreground select-none">
        Rs
      </span>
      <Input
        type="number"
        min="0"
        step="0.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4891a] focus-visible:ring-offset-2 ${
          checked ? "bg-[#d4891a]" : "bg-gray-200"
        }`}
      >
        <span
          className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
