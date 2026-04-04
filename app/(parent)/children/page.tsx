"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Loader2, ChevronRight } from "lucide-react";
import { BottomSheet } from "@/components/ui/motion";

type Child = {
  id: string;
  name: string;
  grNumber: string | null;
  className: string | null;
  section: string | null;
  rfidCardId: string | null;
  walletBalance: number;
};

export default function ChildrenPage() {
  const { data: session } = useSession();
  const isGeneralAccount = session?.user?.role === "GENERAL";
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    grNumber: "",
    className: "",
    section: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchChildren = useCallback(async () => {
    try {
      const res = await fetch("/api/children");
      if (res.ok) {
        const data = await res.json();
        setChildren(data);
      }
    } catch {
      toast.error("Failed to load members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  const resetForm = () => {
    setFormData({ name: "", grNumber: "", className: "", section: "" });
    setEditingChild(null);
  };

  const openAdd = () => {
    resetForm();
    setSheetOpen(true);
  };

  const openEdit = (child: Child) => {
    setEditingChild(child);
    setFormData({
      name: child.name,
      grNumber: child.grNumber || "",
      className: child.className || "",
      section: child.section || "",
    });
    setSheetOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      const url = editingChild
        ? `/api/children/${editingChild.id}`
        : "/api/children";
      const method = editingChild ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save");
        return;
      }

      toast.success(editingChild ? "Updated!" : "Member added!");
      setSheetOpen(false);
      resetForm();
      fetchChildren();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (isGeneralAccount) {
    return (
      <div className="px-5 pt-2">
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            General and teacher accounts do not use member profiles.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="px-5 space-y-5 pt-2">
      {/* Member list */}
      {children.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No members added yet. Tap &quot;+&quot; to add your first member.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => openEdit(child)}
              className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all active:scale-[0.98]"
            >
              {/* Avatar circle */}
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <span className="text-[13px] font-bold text-primary">
                  {getInitials(child.name)}
                </span>
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold truncate">{child.name}</p>
                <p className="text-[12px] text-muted-foreground truncate">
                  {[
                    child.className,
                    child.section ? `Sec ${child.section}` : null,
                    child.grNumber ? `GR: ${child.grNumber}` : null,
                  ]
                    .filter(Boolean)
                    .join(" Â· ") || "No details"}
                </p>
              </div>

              {/* Balance + chevron */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[14px] font-semibold tabular-nums text-emerald-600">
                  â‚¹{child.walletBalance.toFixed(0)}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Add member button */}
      <button
        type="button"
        onClick={openAdd}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-4 text-[14px] font-medium text-primary transition-colors hover:bg-primary/5"
      >
        <Plus className="h-4 w-4" />
        Add Member
      </button>

      {/* Add / Edit Sheet */}
      <BottomSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); resetForm(); }}
        snapPoints={[55]}
      >
        <div className="space-y-4 pb-4">
          <p className="text-base font-semibold">
            {editingChild ? "Edit Member" : "Add Member"}
          </p>

          <div className="space-y-2">
            <Label htmlFor="name">Full Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Arjun Sharma"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grNumber">GR Number</Label>
            <Input
              id="grNumber"
              value={formData.grNumber}
              onChange={(e) => setFormData({ ...formData, grNumber: e.target.value })}
              placeholder="e.g. GR-2024-001"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="className">Class</Label>
              <Input
                id="className"
                value={formData.className}
                onChange={(e) => setFormData({ ...formData, className: e.target.value })}
                placeholder="e.g. Class 5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="section">Section</Label>
              <Input
                id="section"
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                placeholder="e.g. A"
              />
            </div>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full h-12 rounded-xl text-[15px] font-semibold"
            variant="premium"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {editingChild ? "Update" : "Add Member"}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
