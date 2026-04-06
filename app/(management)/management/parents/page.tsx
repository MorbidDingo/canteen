"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Search,
  Plus,
  Trash2,
  KeyRound,
  Loader2,
  RefreshCw,
  User,
  Wallet,
  GraduationCap,
} from "lucide-react";

interface ChildInfo {
  id: string;
  name: string;
  grNumber: string | null;
  walletBalance: number | null;
}

interface Parent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
  children: ChildInfo[];
}

interface ParentOption {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

export default function ManagementParentsPage() {
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Create form
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // Password change
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Parent | null>(null);
  const [deleteChildren, setDeleteChildren] = useState<ChildInfo[]>([]);
  const [reassignSearch, setReassignSearch] = useState("");
  const [reassignOptions, setReassignOptions] = useState<ParentOption[]>([]);
  const [reassignParent, setReassignParent] = useState<ParentOption | null>(null);
  const [reassignLoading, setReassignLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchParents = useCallback(async (q?: string) => {
    try {
      setLoading(true);
      const url = q && q.length >= 2
        ? `/api/management/parents?all&q=${encodeURIComponent(q)}`
        : "/api/management/parents?all";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setParents(data.parents);
    } catch {
      toast.error("Failed to load parents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchParents(); }, [fetchParents]);

  useEffect(() => {
    if (searchQuery.length === 0) { fetchParents(); return; }
    if (searchQuery.length < 2) return;
    const timer = setTimeout(() => fetchParents(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchParents]);

  // Reassign parent search
  useEffect(() => {
    if (reassignSearch.length < 2) { setReassignOptions([]); return; }
    setReassignLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/management/parents?surname=${encodeURIComponent(reassignSearch)}`);
        if (res.ok) {
          const data = await res.json();
          // Exclude the parent being deleted
          setReassignOptions(data.parents.filter((p: ParentOption) => p.id !== deleteTarget?.id));
        }
      } catch { /* ignore */ }
      finally { setReassignLoading(false); }
    }, 300);
    return () => { clearTimeout(timer); setReassignLoading(false); };
  }, [reassignSearch, deleteTarget?.id]);

  const resetCreateForm = () => {
    setFormName(""); setFormEmail(""); setFormPhone(""); setFormPassword("");
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formEmail.trim() || !formPassword) {
      toast.error("Name, email, and password are required");
      return;
    }
    if (formPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/management/parents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim(),
          phone: formPhone.trim() || undefined,
          password: formPassword,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create");
      }
      toast.success("Parent account created");
      setCreateOpen(false);
      resetCreateForm();
      fetchParents(searchQuery || undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!selectedParent) return;
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch(`/api/management/parents/${selectedParent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to change password");
      }
      toast.success(`Password changed for ${selectedParent.name}`);
      setPasswordOpen(false);
      setSelectedParent(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  };

  const initiateDelete = (parent: Parent) => {
    setDeleteTarget(parent);
    setDeleteChildren(parent.children);
    setReassignSearch("");
    setReassignOptions([]);
    setReassignParent(null);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    if (deleteChildren.length > 0 && !reassignParent) {
      toast.error("Please select a parent to reassign children to");
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/management/parents/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newParentId: reassignParent?.id,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "CHILDREN_EXIST") {
          setDeleteChildren(data.children);
          toast.error("Please reassign children first");
          return;
        }
        throw new Error(data.error || "Failed to delete");
      }

      toast.success(`Parent "${deleteTarget.name}" deleted`);
      setDeleteOpen(false);
      setDeleteTarget(null);
      fetchParents(searchQuery || undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const totalBalance = (children: ChildInfo[]) =>
    children.reduce((sum, c) => sum + (c.walletBalance ?? 0), 0);

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Parents
          </h1>
          <p className="text-muted-foreground text-sm">
            Manage parent accounts, passwords, and data
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => fetchParents(searchQuery || undefined)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" /> Add Parent
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Parent Account</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pName">Full Name *</Label>
                  <Input id="pName" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Parent's full name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pEmail">Email *</Label>
                  <Input id="pEmail" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="parent@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pPhone">Phone</Label>
                  <Input id="pPhone" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="Phone number" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pPassword">Password *</Label>
                  <Input id="pPassword" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Min 8 characters" />
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={saving}>
                  {saving ? "Creating..." : "Create Account"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search parents by name..." className="pl-10" />
      </div>

      {/* Password Dialog */}
      <Dialog open={passwordOpen} onOpenChange={(open) => { setPasswordOpen(open); if (!open) { setSelectedParent(null); setNewPassword(""); setConfirmPassword(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          {selectedParent && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{selectedParent.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedParent.email}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>New Password *</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" />
              </div>
              <div className="space-y-2">
                <Label>Confirm Password *</Label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" />
              </div>
              <p className="text-xs text-muted-foreground">
                This will log the parent out of all active sessions.
              </p>
              <Button className="w-full" onClick={handleChangePassword} disabled={changingPassword}>
                {changingPassword ? "Changing..." : "Change Password"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) { setDeleteTarget(null); setDeleteChildren([]); setReassignParent(null); setReassignSearch(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete Parent Account</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-2 border rounded-md bg-destructive/10">
                <User className="h-4 w-4 text-destructive" />
                <div>
                  <p className="text-sm font-medium">{deleteTarget.name}</p>
                  <p className="text-xs text-muted-foreground">{deleteTarget.email}</p>
                </div>
              </div>

              {deleteChildren.length > 0 ? (
                <>
                  <div className="border rounded-md p-3 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1">
                      <GraduationCap className="h-4 w-4" />
                      Children ({deleteChildren.length})
                    </p>
                    {deleteChildren.map((c) => (
                      <div key={c.id} className="flex items-center justify-between text-sm pl-5">
                        <span>{c.name}</span>
                        <Badge variant="outline" className="text-xs gap-1">
                          <Wallet className="h-3 w-3" />
                          ₹{(c.walletBalance ?? 0).toFixed(2)}
                        </Badge>
                      </div>
                    ))}
                    <div className="border-t pt-2 flex items-center justify-between text-sm font-medium pl-5">
                      <span>Total wallet balance</span>
                      <span>₹{totalBalance(deleteChildren).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Reassign children to *</Label>
                    <p className="text-xs text-muted-foreground">
                      Children and their wallet balances will be transferred to the selected parent.
                    </p>
                    {reassignParent ? (
                      <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{reassignParent.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{reassignParent.email}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => { setReassignParent(null); setReassignSearch(""); }}>
                          Change
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input value={reassignSearch} onChange={(e) => setReassignSearch(e.target.value)} placeholder="Search parent by name..." className="pl-9" />
                          {reassignLoading && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
                        </div>
                        {reassignOptions.length > 0 && (
                          <div className="border rounded-md max-h-32 overflow-y-auto">
                            {reassignOptions.map((p) => (
                              <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors text-sm" onClick={() => { setReassignParent(p); setReassignOptions([]); }}>
                                <p className="font-medium">{p.name}</p>
                                <p className="text-xs text-muted-foreground">{p.email}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This parent has no children. The account will be permanently deleted.
                </p>
              )}

              <Button variant="destructive" className="w-full" onClick={handleDelete} disabled={deleting || (deleteChildren.length > 0 && !reassignParent)}>
                {deleting ? "Deleting..." : "Delete Parent Account"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Parent list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      ) : parents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mb-2 opacity-40" />
            <p>{searchQuery ? "No parents found" : "No parent accounts yet"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {parents.map((parent, index) => (
            <Card key={parent.id} className="animate-fade-in-up" style={{ animationDelay: `${index * 30}ms` }}>
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{parent.name}</span>
                    {parent.children.length > 0 && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <GraduationCap className="h-2.5 w-2.5" />
                        {parent.children.length} {parent.children.length === 1 ? "child" : "children"}
                      </Badge>
                    )}
                    {totalBalance(parent.children) > 0 && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Wallet className="h-2.5 w-2.5" />
                        ₹{totalBalance(parent.children).toFixed(2)}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="truncate">{parent.email}</span>
                    {parent.phone && <span>· {parent.phone}</span>}
                  </div>
                  {parent.children.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {parent.children.map((c) => (
                        <span key={c.id} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                          {c.name}{c.grNumber ? ` (${c.grNumber})` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Change password"
                    onClick={() => { setSelectedParent(parent); setPasswordOpen(true); }}
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    title="Delete parent"
                    onClick={() => initiateDelete(parent)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
