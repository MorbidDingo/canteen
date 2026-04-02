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
  Users,
  Search,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  UserPlus,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";

type Group = {
  id: string;
  name: string;
  description: string | null;
  createdByName: string;
  createdAt: string;
  memberCount: number;
};

type GroupMember = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string;
};

type OrgMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
};

export default function ContentGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Detail view
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Add members
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<OrgMember[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/management/content/groups");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGroups(data.groups);
    } catch {
      toast.error("Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const fetchMembers = useCallback(async (groupId: string) => {
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/management/content/groups/${groupId}/members`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMembers(data.members);
    } catch {
      toast.error("Failed to load members");
    } finally {
      setMembersLoading(false);
    }
  }, []);

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
          const existingIds = new Set(members.map((m) => m.userId));
          setMemberResults(
            data.members.filter((m: OrgMember) => !existingIds.has(m.userId)),
          );
        }
      } catch {
        // ignore
      } finally {
        setMemberSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [memberSearch, members]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/management/content/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDescription || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create group");
      }
      toast.success("Group created");
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      fetchGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteGroup(groupId: string, groupName: string) {
    if (!confirm(`Delete group "${groupName}" and remove all its members?`)) return;
    try {
      const res = await fetch(`/api/management/content/groups/${groupId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Group deleted");
      if (selectedGroup?.id === groupId) setSelectedGroup(null);
      fetchGroups();
    } catch {
      toast.error("Failed to delete group");
    }
  }

  async function handleAddMembers() {
    if (!selectedGroup || selectedUserIds.size === 0) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/management/content/groups/${selectedGroup.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selectedUserIds) }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`Added ${data.added} member(s)`);
      setAddMemberOpen(false);
      setSelectedUserIds(new Set());
      setMemberSearch("");
      fetchMembers(selectedGroup.id);
      fetchGroups();
    } catch {
      toast.error("Failed to add members");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember(userId: string, userName: string) {
    if (!selectedGroup) return;
    if (!confirm(`Remove ${userName} from this group?`)) return;
    try {
      const res = await fetch(
        `/api/management/content/groups/${selectedGroup.id}/members?userId=${userId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      toast.success("Member removed");
      fetchMembers(selectedGroup.id);
      fetchGroups();
    } catch {
      toast.error("Failed to remove member");
    }
  }

  function toggleUserId(uid: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  // Detail view for a selected group
  if (selectedGroup) {
    return (
      <div className="container mx-auto max-w-4xl py-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedGroup(null)} className="mb-2">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back to Groups
                </Button>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {selectedGroup.name}
                </CardTitle>
                {selectedGroup.description && (
                  <CardDescription>{selectedGroup.description}</CardDescription>
                )}
              </div>
              <Dialog open={addMemberOpen} onOpenChange={(open) => {
                setAddMemberOpen(open);
                if (!open) {
                  setMemberSearch("");
                  setMemberResults([]);
                  setSelectedUserIds(new Set());
                }
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Members
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Members to {selectedGroup.name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or email..."
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
                            className={`w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between text-sm ${
                              selectedUserIds.has(member.userId) ? "bg-muted" : ""
                            }`}
                            onClick={() => toggleUserId(member.userId)}
                          >
                            <div>
                              <div className="font-medium">{member.name}</div>
                              <div className="text-muted-foreground text-xs">{member.email}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{member.role}</Badge>
                              {selectedUserIds.has(member.userId) && (
                                <Badge className="text-xs">Selected</Badge>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {memberSearch.length >= 2 && !memberSearching && memberResults.length === 0 && (
                      <p className="text-sm text-muted-foreground py-2">No members found</p>
                    )}
                    {selectedUserIds.size > 0 && (
                      <Button className="w-full" onClick={handleAddMembers} disabled={adding}>
                        {adding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Add {selectedUserIds.size} Member{selectedUserIds.size > 1 ? "s" : ""}
                      </Button>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {membersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded-md" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No members in this group yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between border rounded-md p-3"
                  >
                    <div>
                      <div className="font-medium">{member.userName}</div>
                      <div className="text-sm text-muted-foreground">{member.userEmail}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveMember(member.userId, member.userName)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Groups list view
  return (
    <div className="container mx-auto max-w-4xl py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Content Groups
              </CardTitle>
              <CardDescription>
                Create and manage groups for targeting content to specific users
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={fetchGroups} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    New Group
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Content Group</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Name</label>
                      <Input
                        placeholder="e.g. Teaching Staff, Grade 5 Teachers"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Description (optional)</label>
                      <Input
                        placeholder="Brief description of this group"
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleCreate}
                      disabled={creating || !newName.trim()}
                    >
                      {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Create Group
                    </Button>
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
          ) : groups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No groups created yet</p>
              <p className="text-sm">Create groups to organize users for content targeting</p>
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between border rounded-md p-3 hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    setSelectedGroup(group);
                    fetchMembers(group.id);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{group.name}</div>
                    {group.description && (
                      <div className="text-sm text-muted-foreground truncate">
                        {group.description}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {group.memberCount} member{group.memberCount !== 1 ? "s" : ""} · Created by {group.createdByName}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteGroup(group.id, group.name);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
