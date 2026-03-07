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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Users,
  Plus,
  CreditCard,
  Wallet,
  Loader2,
  User,
  Pencil,
} from "lucide-react";

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
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
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
      toast.error("Failed to load children");
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

  const openAddDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (child: Child) => {
    setEditingChild(child);
    setFormData({
      name: child.name,
      grNumber: child.grNumber || "",
      className: child.className || "",
      section: child.section || "",
    });
    setDialogOpen(true);
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

      toast.success(editingChild ? "Child updated!" : "Child added!");
      setDialogOpen(false);
      resetForm();
      fetchChildren();
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

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-[#1a3a8f]" />
            My Children
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your children&apos;s profiles and view their wallet balance
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Child
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingChild ? "Edit Child" : "Add Child"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g. Arjun Sharma"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grNumber">GR Number</Label>
                <Input
                  id="grNumber"
                  value={formData.grNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, grNumber: e.target.value })
                  }
                  placeholder="e.g. GR-2024-001"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="className">Class</Label>
                  <Input
                    id="className"
                    value={formData.className}
                    onChange={(e) =>
                      setFormData({ ...formData, className: e.target.value })
                    }
                    placeholder="e.g. Class 5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="section">Section</Label>
                  <Input
                    id="section"
                    value={formData.section}
                    onChange={(e) =>
                      setFormData({ ...formData, section: e.target.value })
                    }
                    placeholder="e.g. A"
                  />
                </div>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={saving}
                className="w-full"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingChild ? "Update" : "Add Child"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {children.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No children added yet. Add your first child to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {children.map((child) => (
            <Card key={child.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <User className="h-5 w-5 text-[#1a3a8f]" />
                    {child.name}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(child)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>
                  {child.className}
                  {child.section ? ` — Section ${child.section}` : ""}{" "}
                  {child.grNumber ? `• GR: ${child.grNumber}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Separator className="mb-3" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Wallet className="h-4 w-4 text-[#2eab57]" />
                    <span className="text-muted-foreground">Balance:</span>
                    <span className="font-bold text-[#2eab57]">
                      ₹{child.walletBalance.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {child.rfidCardId ? (
                      <Badge className="bg-[#2eab57]/15 text-[#1e7a3c] gap-1">
                        <CreditCard className="h-3 w-3" />
                        Card Linked
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground gap-1"
                      >
                        <CreditCard className="h-3 w-3" />
                        No Card
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
