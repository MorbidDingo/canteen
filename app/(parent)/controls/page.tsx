"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, Loader2, Save, X, AlertTriangle } from "lucide-react";
import { MENU_CATEGORY_LABELS, type MenuCategory } from "@/lib/constants";

type ChildControl = {
  childId: string;
  childName: string;
  dailySpendLimit: number | null;
  perOrderLimit: number | null;
  blockedCategories: string[];
  blockedItemIds: string[];
};

const ALL_CATEGORIES: MenuCategory[] = [
  "SNACKS",
  "MEALS",
  "DRINKS",
  "PACKED_FOOD",
];

export default function ControlsPage() {
  const [children, setChildren] = useState<ChildControl[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dailyLimit, setDailyLimit] = useState("");
  const [orderLimit, setOrderLimit] = useState("");
  const [blockedCategories, setBlockedCategories] = useState<string[]>([]);

  const fetchControls = useCallback(async () => {
    try {
      const res = await fetch("/api/controls");
      if (res.ok) {
        const data: ChildControl[] = await res.json();
        setChildren(data);
        if (data.length > 0 && !selectedChildId) {
          setSelectedChildId(data[0].childId);
          populateForm(data[0]);
        }
      }
    } catch {
      toast.error("Failed to load controls");
    } finally {
      setLoading(false);
    }
  }, [selectedChildId]);

  const populateForm = (ctrl: ChildControl) => {
    setDailyLimit(ctrl.dailySpendLimit?.toString() || "");
    setOrderLimit(ctrl.perOrderLimit?.toString() || "");
    setBlockedCategories(ctrl.blockedCategories || []);
  };

  useEffect(() => {
    fetchControls();
  }, [fetchControls]);

  useEffect(() => {
    const ctrl = children.find((c) => c.childId === selectedChildId);
    if (ctrl) populateForm(ctrl);
  }, [selectedChildId, children]);

  const toggleCategory = (cat: string) => {
    setBlockedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/controls", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId: selectedChildId,
          dailySpendLimit: dailyLimit ? parseFloat(dailyLimit) : null,
          perOrderLimit: orderLimit ? parseFloat(orderLimit) : null,
          blockedCategories,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save");
        return;
      }
      toast.success("Controls saved!");
      fetchControls();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="container mx-auto max-w-lg px-4 py-6">
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No children found. Add a child first to set spending controls.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-lg px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-[#1a3a8f]" />
          Spending Controls
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set daily limits and block food categories for your child
        </p>
      </div>

      {/* Child selector */}
      {children.length > 1 && (
        <Select value={selectedChildId} onValueChange={setSelectedChildId}>
          <SelectTrigger>
            <SelectValue placeholder="Select child" />
          </SelectTrigger>
          <SelectContent>
            {children.map((c) => (
              <SelectItem key={c.childId} value={c.childId}>
                {c.childName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Limits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Spending Limits</CardTitle>
          <CardDescription>Leave empty for no limit</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dailyLimit">Daily Spend Limit (₹)</Label>
            <Input
              id="dailyLimit"
              type="number"
              min="0"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              placeholder="e.g. 200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orderLimit">Per-Order Limit (₹)</Label>
            <Input
              id="orderLimit"
              type="number"
              min="0"
              value={orderLimit}
              onChange={(e) => setOrderLimit(e.target.value)}
              placeholder="e.g. 100"
            />
          </div>
        </CardContent>
      </Card>

      {/* Blocked Categories */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#f58220]" />
            Blocked Categories
          </CardTitle>
          <CardDescription>
            Your child will not be able to order items from blocked categories
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ALL_CATEGORIES.map((cat) => {
              const isBlocked = blockedCategories.includes(cat);
              return (
                <Button
                  key={cat}
                  variant={isBlocked ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => toggleCategory(cat)}
                  className="gap-1"
                >
                  {isBlocked && <X className="h-3 w-3" />}
                  {MENU_CATEGORY_LABELS[cat]}
                </Button>
              );
            })}
          </div>
          {blockedCategories.length > 0 && (
            <p className="text-xs text-[#e32726] mt-2">
              {blockedCategories.length} category(ies) blocked
            </p>
          )}
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full"
        size="lg"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <Save className="h-4 w-4 mr-2" />
        )}
        Save Controls
      </Button>
    </div>
  );
}
