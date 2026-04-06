"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList,
  Search,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react";

type Permission = {
  id: string;
  userId: string;
  scope: string;
  grantedBy: string;
  grantedAt: string;
  userName: string;
  userEmail: string;
};

type OrgMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
};

const SCOPE_OPTIONS = [
  { value: "BOTH", label: "Both (Assignments & Notes)" },
  { value: "ASSIGNMENT", label: "Assignments Only" },
  { value: "NOTE", label: "Notes Only" },
];

function scopeBadgeVariant(scope: string) {
  switch (scope) {
    case "BOTH":
      return "default" as const;
    case "ASSIGNMENT":
      return "secondary" as const;
    case "NOTE":
      return "outline" as const;
    default:
      return "default" as const;
  }
}

export default function ContentPermissionsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<OrgMember[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null);
  const [selectedScope, setSelectedScope] = useState("BOTH");
  const [granting, setGranting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/management/content/permissions");
      if (!res.ok) throw new Error("Failed to load permissions");
      const data = await res.json();
      setPermissions(data.permissions);
    } catch {
      toast.error("Failed to load content permissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Debounced member search
  useEffect(() => {
    if (memberSearch.length < 2) {
      setMemberResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setMemberSearching(true);
      try {
        const res = await fetch(
          `/api/management/content/permissions/members?q=${encodeURIComponent(memberSearch)}`,
        );
        if (res.ok) {
          const data = await res.json();
          // Filter out users that already have a permission
          const existingUserIds = new Set(permissions.map((p) => p.userId));
          setMemberResults(
            data.members.filter((m: OrgMember) => !existingUserIds.has(m.userId)),
          );
        }
      } catch {
        // ignore
      } finally {
        setMemberSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [memberSearch, permissions]);

  async function handleGrant() {
    if (!selectedMember) return;
    setGranting(true);
    try {
      const res = await fetch("/api/management/content/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedMember.userId, scope: selectedScope }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to grant permission");
      }
      toast.success(`Permission granted to ${selectedMember.name}`);
      setGrantDialogOpen(false);
      setSelectedMember(null);
      setMemberSearch("");
      setSelectedScope("BOTH");
      fetchPermissions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to grant permission");
    } finally {
      setGranting(false);
    }
  }

  async function handleUpdateScope(permissionId: string, newScope: string) {
    setEditingId(permissionId);
    try {
      const res = await fetch(`/api/management/content/permissions/${permissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: newScope }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Permission scope updated");
      fetchPermissions();
    } catch {
      toast.error("Failed to update permission scope");
    } finally {
      setEditingId(null);
    }
  }

  async function handleRevoke(permissionId: string, userName: string) {
    if (!confirm(`Revoke content permission for ${userName}?`)) return;
    try {
      const res = await fetch(`/api/management/content/permissions/${permissionId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to revoke");
      toast.success("Permission revoked");
      fetchPermissions();
    } catch {
      toast.error("Failed to revoke permission");
    }
  }

  return (
    <div className="container mx-auto max-w-4xl py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Content Permissions
              </CardTitle>
              <CardDescription>
                Grant and manage who can post assignments and notes
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={fetchPermissions} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Dialog open={grantDialogOpen} onOpenChange={(open) => {
                setGrantDialogOpen(open);
                if (!open) {
                  setSelectedMember(null);
                  setMemberSearch("");
                  setMemberResults([]);
                }
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Grant Permission
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Grant Content Permission</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    {!selectedMember ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search members by name or email..."
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            className="pl-9"
                          />
                        </div>
                        {memberSearching && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Searching...
                          </div>
                        )}
                        {memberResults.length > 0 && (
                          <div className="border rounded-md max-h-48 overflow-y-auto">
                            {memberResults.map((member) => (
                              <button
                                key={member.userId}
                                className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between text-sm"
                                onClick={() => setSelectedMember(member)}
                              >
                                <div>
                                  <div className="font-medium">{member.name}</div>
                                  <div className="text-muted-foreground text-xs">{member.email}</div>
                                </div>
                                <Badge variant="outline" className="text-xs">{member.role}</Badge>
                              </button>
                            ))}
                          </div>
                        )}
                        {memberSearch.length >= 2 && !memberSearching && memberResults.length === 0 && (
                          <p className="text-sm text-muted-foreground py-2">No members found</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="border rounded-md p-3 flex items-center justify-between">
                          <div>
                            <div className="font-medium">{selectedMember.name}</div>
                            <div className="text-sm text-muted-foreground">{selectedMember.email}</div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedMember(null)}>
                            Change
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Permission Scope</label>
                          <Select value={selectedScope} onValueChange={setSelectedScope}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SCOPE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          className="w-full"
                          onClick={handleGrant}
                          disabled={granting}
                        >
                          {granting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Grant Permission
                        </Button>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : permissions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No content permissions granted yet</p>
              <p className="text-sm">Grant permissions to allow users to post assignments and notes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {permissions.map((perm) => (
                <div
                  key={perm.id}
                  className="flex items-center justify-between border rounded-md p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{perm.userName}</div>
                    <div className="text-sm text-muted-foreground truncate">{perm.userEmail}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Granted {new Date(perm.grantedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Select
                      value={perm.scope}
                      onValueChange={(val) => handleUpdateScope(perm.id, val)}
                      disabled={editingId === perm.id}
                    >
                      <SelectTrigger className="w-[180px]">
                        <Badge variant={scopeBadgeVariant(perm.scope)}>{perm.scope}</Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {SCOPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRevoke(perm.id, perm.userName)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
