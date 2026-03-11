"use client";

import { useState, useEffect } from "react";
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
import { Settings, Loader2, Save } from "lucide-react";

export default function LibrarySettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const res = await fetch("/api/management/library/settings");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setSettings(data.settings);
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/management/library/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
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
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6 text-[#1a3a8f]" />
            Library Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure library rules and policies
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          Save Settings
        </Button>
      </div>

      {/* Issue Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Issue Rules</CardTitle>
          <CardDescription>
            Control how books are issued to students
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Issue Duration (days)</Label>
              <Input
                type="number"
                min="1"
                max="365"
                value={settings.issue_duration_days || "7"}
                onChange={(e) =>
                  updateSetting("issue_duration_days", e.target.value)
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Number of days a book can be borrowed
              </p>
            </div>
            <div>
              <Label>Max Books Per Student</Label>
              <Input
                type="number"
                min="1"
                max="50"
                value={settings.max_books_per_student || "3"}
                onChange={(e) =>
                  updateSetting("max_books_per_student", e.target.value)
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximum books a student can borrow at once
              </p>
            </div>
            <div>
              <Label>Max Reissues</Label>
              <Input
                type="number"
                min="0"
                max="10"
                value={settings.max_reissues || "3"}
                onChange={(e) =>
                  updateSetting("max_reissues", e.target.value)
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                How many times a student can renew a book
              </p>
            </div>
            <div>
              <Label>Reissue Duration (days)</Label>
              <Input
                type="number"
                min="1"
                max="365"
                value={settings.reissue_duration_days || "7"}
                onChange={(e) =>
                  updateSetting("reissue_duration_days", e.target.value)
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Additional days granted per reissue
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Return Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Return Rules</CardTitle>
          <CardDescription>
            Control how book returns are handled
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleField
            label="Require Operator Confirmation for Returns"
            description="If enabled, student self-returns go to RETURN_PENDING and must be confirmed by the library operator"
            checked={settings.require_operator_return_confirmation === "true"}
            onChange={() =>
              toggleSetting("require_operator_return_confirmation")
            }
          />
          <Separator />
          <ToggleField
            label="Block New Issues If Student Has Overdue Books"
            description="Prevent students from borrowing new books until all overdue books are returned"
            checked={settings.block_issue_if_overdue === "true"}
            onChange={() => toggleSetting("block_issue_if_overdue")}
          />
        </CardContent>
      </Card>

      {/* Fine Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Fine Settings</CardTitle>
          <CardDescription>
            Overdue fine configuration — fines auto-deduct from wallet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Fine Per Day (₹)</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={settings.fine_per_day || "0"}
                onChange={(e) =>
                  updateSetting("fine_per_day", e.target.value)
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Set to 0 to disable fines
              </p>
            </div>
            <div>
              <Label>Max Fine Per Book (₹)</Label>
              <Input
                type="number"
                min="0"
                value={settings.max_fine_per_book || "100"}
                onChange={(e) =>
                  updateSetting("max_fine_per_book", e.target.value)
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Cap on total fine per single book
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Access Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Access Control</CardTitle>
          <CardDescription>
            Control self-service terminal behavior
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleField
            label="Allow Self-Service Issue"
            description="Let students issue books from the library kiosk terminal without operator intervention"
            checked={settings.allow_self_service_issue === "true"}
            onChange={() => toggleSetting("allow_self_service_issue")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// Simple toggle component
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
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
          checked ? "bg-[#1a3a8f]" : "bg-gray-200"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
