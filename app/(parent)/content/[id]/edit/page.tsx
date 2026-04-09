"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { hapticSuccess, hapticError } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Loader2,
  Plus,
  X,
  Upload,
  Paperclip,
  Globe,
  GraduationCap,
  User,
  Users,
  Trash2,
  Eye,
  Send,
  Lock,
  FileText,
  Save,
  ChevronDown,
} from "lucide-react";

type Tag = { id: string; name: string; color: string | null };
type Group = { id: string; name: string; memberCount: number };
type ClassInfo = { className: string; sections: string[] };
type Attachment = {
  id: string;
  storageBackend: string;
  storageKey: string;
  mimeType: string;
  size: number;
};

type AudienceRow = {
  audienceType: "ALL_ORG" | "CLASS" | "SECTION" | "USER" | "GROUP";
  className?: string;
  section?: string;
  userId?: string;
  groupId?: string;
  label: string;
};

type OrgMember = { userId: string; name: string; email: string; role: string };

export default function EditPostPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [postType, setPostType] = useState<"ASSIGNMENT" | "NOTE">("ASSIGNMENT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED" | "CLOSED">("DRAFT");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [audiences, setAudiences] = useState<AudienceRow[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Lookups
  const [tags, setTags] = useState<Tag[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);

  // Inline tag creation
  const [newTagName, setNewTagName] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);

  // Audience builder
  const [audienceDialogOpen, setAudienceDialogOpen] = useState(false);
  const [audienceMode, setAudienceMode] = useState<"ALL_ORG" | "CLASS" | "SECTION" | "USER" | "GROUP">("ALL_ORG");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<OrgMember[]>([]);
  const [userSearching, setUserSearching] = useState(false);

  const fetchPost = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/content/posts/${postId}`);
      if (!res.ok) {
        toast.error("Post not found");
        router.push("/content");
        return;
      }
      const data = await res.json();
      const post = data.post;
      setPostType(post.type);
      setTitle(post.title);
      setBody(post.body);
      setStatus(post.status);
      if (post.dueAt) {
        const dt = new Date(post.dueAt);
        setDueAt(dt.toISOString().slice(0, 16));
      }
      setExistingAttachments(data.attachments || []);

      // Set tags
      if (data.tags) {
        setSelectedTagIds(data.tags.map((t: Tag) => t.id));
      }

      // Set audiences
      if (data.audiences) {
        const rows: AudienceRow[] = data.audiences.map((a: {
          audienceType: string;
          className?: string;
          section?: string;
          userId?: string;
          groupId?: string;
        }) => {
          let label = a.audienceType;
          if (a.audienceType === "ALL_ORG") label = "Entire Organization";
          else if (a.audienceType === "CLASS") label = `Class: ${a.className}`;
          else if (a.audienceType === "SECTION") label = `${a.className} - ${a.section}`;
          else if (a.audienceType === "USER") label = `User: ${a.userId?.slice(0, 8)}...`;
          else if (a.audienceType === "GROUP") label = `Group: ${a.groupId?.slice(0, 8)}...`;
          return {
            audienceType: a.audienceType as AudienceRow["audienceType"],
            className: a.className,
            section: a.section,
            userId: a.userId,
            groupId: a.groupId,
            label,
          };
        });
        setAudiences(rows);
      }
    } catch {
      toast.error("Failed to load post");
    } finally {
      setLoading(false);
    }
  }, [postId, router]);

  const fetchLookups = useCallback(async () => {
    const [tagsRes, groupsRes, classesRes] = await Promise.all([
      fetch("/api/content/tags"),
      fetch("/api/content/groups"),
      fetch("/api/content/classes"),
    ]);
    if (tagsRes.ok) setTags((await tagsRes.json()).tags);
    if (groupsRes.ok) setGroups((await groupsRes.json()).groups);
    if (classesRes.ok) setClasses((await classesRes.json()).classes);
  }, []);

  useEffect(() => {
    fetchPost();
    fetchLookups();
  }, [fetchPost, fetchLookups]);

  // User search debounce
  useEffect(() => {
    if (userSearch.length < 2) {
      setUserResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setUserSearching(true);
      try {
        const res = await fetch(
          `/api/management/content/permissions/members?q=${encodeURIComponent(userSearch)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setUserResults(data.members || []);
        }
      } catch { /* ignore */ } finally {
        setUserSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [userSearch]);

  function addAudience() {
    if (audienceMode === "ALL_ORG") {
      setAudiences([{ audienceType: "ALL_ORG", label: "Entire Organization" }]);
      setAudienceDialogOpen(false);
      return;
    }
    if (audienceMode === "CLASS" && selectedClass) {
      if (audiences.some((a) => a.audienceType === "CLASS" && a.className === selectedClass)) return;
      setAudiences((prev) => [
        ...prev.filter((a) => a.audienceType !== "ALL_ORG"),
        { audienceType: "CLASS", className: selectedClass, label: `Class: ${selectedClass}` },
      ]);
      setSelectedClass("");
      setAudienceDialogOpen(false);
      return;
    }
    if (audienceMode === "SECTION" && selectedClass && selectedSection) {
      if (audiences.some((a) => a.audienceType === "SECTION" && a.className === selectedClass && a.section === selectedSection)) return;
      setAudiences((prev) => [
        ...prev.filter((a) => a.audienceType !== "ALL_ORG"),
        { audienceType: "SECTION", className: selectedClass, section: selectedSection, label: `${selectedClass} - ${selectedSection}` },
      ]);
      setSelectedSection("");
      setAudienceDialogOpen(false);
      return;
    }
    if (audienceMode === "GROUP" && selectedGroup) {
      const group = groups.find((g) => g.id === selectedGroup);
      if (!group || audiences.some((a) => a.groupId === selectedGroup)) return;
      setAudiences((prev) => [
        ...prev.filter((a) => a.audienceType !== "ALL_ORG"),
        { audienceType: "GROUP", groupId: selectedGroup, label: `Group: ${group.name}` },
      ]);
      setSelectedGroup("");
      setAudienceDialogOpen(false);
    }
  }

  function addUserAudience(member: OrgMember) {
    if (audiences.some((a) => a.userId === member.userId)) return;
    setAudiences((prev) => [
      ...prev.filter((a) => a.audienceType !== "ALL_ORG"),
      { audienceType: "USER", userId: member.userId, label: `User: ${member.name}` },
    ]);
    setUserSearch("");
    setUserResults([]);
    setAudienceDialogOpen(false);
  }

  function removeAudience(index: number) {
    setAudiences((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleDeleteAttachment(attId: string) {
    try {
      const res = await fetch(`/api/content/posts/${postId}/attachments/${attId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setExistingAttachments((prev) => prev.filter((a) => a.id !== attId));
      toast.success("Attachment removed");
    } catch {
      toast.error("Failed to remove attachment");
    }
  }

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    setCreatingTag(true);
    try {
      const res = await fetch("/api/content/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      const data = await res.json();
      setTags((prev) => [...prev, data.tag]);
      setSelectedTagIds((prev) => [...prev, data.tag.id]);
      setNewTagName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreatingTag(false);
    }
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }

  async function handleSave(newStatus?: string) {
    if (!title.trim() || !body.trim()) {
      hapticError();
      toast.error("Title and body are required");
      return;
    }

    setSaving(true);
    try {
      // 1. Update post metadata
      const patchBody: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        dueAt: dueAt || null,
        tagIds: selectedTagIds,
      };
      if (newStatus) patchBody.status = newStatus;

      const res = await fetch(`/api/content/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      // 2. Update audience
      if (audiences.length > 0) {
        await fetch(`/api/content/posts/${postId}/audience`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audience: audiences.map((a) => ({
              audienceType: a.audienceType,
              className: a.className,
              section: a.section,
              userId: a.userId,
              groupId: a.groupId,
            })),
          }),
        });
      }

      // 3. Upload new attachments
      for (const file of newFiles) {
        const formData = new FormData();
        formData.append("file", file);
        await fetch(`/api/content/posts/${postId}/attachments`, {
          method: "POST",
          body: formData,
        });
      }

      if (newStatus) {
        setStatus(newStatus as typeof status);
      }

      hapticSuccess();
      toast.success(
        newStatus === "PUBLISHED"
          ? "Post published"
          : newStatus === "CLOSED"
          ? "Post closed"
          : "Changes saved",
      );

      if (newStatus) {
        router.push("/content");
      } else {
        setNewFiles([]);
        fetchPost();
      }
    } catch (err) {
      hapticError();
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/content/posts/${postId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      hapticSuccess();
      toast.success("Post deleted");
      router.push("/content");
    } catch {
      hapticError();
      toast.error("Failed to delete post");
    } finally {
      setDeleting(false);
    }
  }

  const sectionsForSelectedClass = classes.find(
    (c) => c.className === selectedClass,
  )?.sections || [];

  function getMimeIcon(mimeType: string) {
    if (mimeType.startsWith("image/")) return "🖼️";
    if (mimeType === "application/pdf") return "📄";
    return "📎";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="allow-mobile-select mx-auto max-w-2xl space-y-5 px-4 py-4 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push("/content")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold">Edit Post</h1>
          <Badge
            variant="secondary"
            className={`text-[10px] ${
              status === "DRAFT"
                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                : status === "PUBLISHED"
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400"
            }`}
          >
            {status}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          {postType === "ASSIGNMENT" && (
            <Link href={`/content/${postId}/submissions`}>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                <Eye className="mr-1 h-3 w-3" />
                Submissions
              </Button>
            </Link>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Delete
          </Button>

          {/* Save / Publish / Close action dropdown */}
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave()}
              className="flex h-8 items-center justify-center rounded-l-full bg-primary pl-3.5 pr-2.5 text-[12px] font-semibold text-primary-foreground transition-all active:scale-95 disabled:opacity-40"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className="flex items-center gap-1.5">
                  <Save className="h-3 w-3" />
                  Save
                </span>
              )}
            </button>
            <div className="h-8 w-px bg-primary-foreground/20" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={saving}
                  aria-label="More save options"
                  className="flex h-8 w-7 items-center justify-center rounded-r-full bg-primary text-primary-foreground transition-all active:scale-95 disabled:opacity-40"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[150px]">
                <DropdownMenuItem
                  disabled={saving}
                  onClick={() => handleSave()}
                  className="gap-2"
                >
                  <Save className="h-3.5 w-3.5 text-muted-foreground" />
                  Save Changes
                </DropdownMenuItem>
                {status === "DRAFT" && (
                  <DropdownMenuItem
                    disabled={saving || audiences.length === 0}
                    onClick={() => handleSave("PUBLISHED")}
                    className="gap-2"
                  >
                    <Send className="h-3.5 w-3.5 text-primary" />
                    Publish
                  </DropdownMenuItem>
                )}
                {status === "PUBLISHED" && postType === "ASSIGNMENT" && (
                  <DropdownMenuItem
                    disabled={saving}
                    onClick={() => handleSave("CLOSED")}
                    className="gap-2"
                  >
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    Close Post
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Type (read-only) */}
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2.5 text-sm">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{postType === "ASSIGNMENT" ? "Assignment" : "Note"}</span>
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Body</Label>
        <RichTextEditor
          value={body}
          onChange={setBody}
          disabled={status === "CLOSED" && postType === "ASSIGNMENT"}
        />
        {status === "CLOSED" && postType === "ASSIGNMENT" && (
          <p className="text-[10px] text-muted-foreground">Body editing disabled for closed assignments</p>
        )}
      </div>

      {/* Due date */}
      {postType === "ASSIGNMENT" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Due Date</Label>
          <Input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
      )}

      {/* Tags */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Tags</Label>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)} className="transition-transform active:scale-95">
              <Badge
                variant={selectedTagIds.includes(tag.id) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                style={
                  tag.color && selectedTagIds.includes(tag.id)
                    ? { backgroundColor: tag.color, borderColor: tag.color, color: "#fff" }
                    : tag.color
                    ? { borderColor: tag.color, color: tag.color }
                    : undefined
                }
              >
                {tag.name}
              </Badge>
            </button>
          ))}
          <div className="flex items-center gap-1">
            <Input
              placeholder="New tag..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="h-6 w-24 text-xs"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateTag(); } }}
            />
            {newTagName.trim() && (
              <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={handleCreateTag} disabled={creatingTag}>
                {creatingTag ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Audience */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Audience</Label>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAudienceDialogOpen(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Add Target
          </Button>
        </div>
        {audiences.length === 0 ? (
          <p className="text-xs text-muted-foreground">No audience selected.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {audiences.map((a, i) => (
              <Badge key={i} variant="secondary" className="gap-1 text-xs">
                {a.audienceType === "ALL_ORG" && <Globe className="h-3 w-3" />}
                {(a.audienceType === "CLASS" || a.audienceType === "SECTION") && <GraduationCap className="h-3 w-3" />}
                {a.audienceType === "USER" && <User className="h-3 w-3" />}
                {a.audienceType === "GROUP" && <Users className="h-3 w-3" />}
                {a.label}
                <button type="button" onClick={() => removeAudience(i)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Audience Dialog */}
      <Dialog open={audienceDialogOpen} onOpenChange={setAudienceDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Audience Target</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={audienceMode} onValueChange={(v) => setAudienceMode(v as typeof audienceMode)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL_ORG">Entire Organization</SelectItem>
                <SelectItem value="CLASS">Class</SelectItem>
                <SelectItem value="SECTION">Class + Section</SelectItem>
                <SelectItem value="GROUP">Group</SelectItem>
                <SelectItem value="USER">Specific User</SelectItem>
              </SelectContent>
            </Select>

            {audienceMode === "ALL_ORG" && (
              <Button className="w-full" onClick={addAudience}>
                <Globe className="mr-2 h-4 w-4" /> Target Entire Organization
              </Button>
            )}

            {(audienceMode === "CLASS" || audienceMode === "SECTION") && (
              <>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select class..." /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.className} value={c.className}>{c.className}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {audienceMode === "SECTION" && selectedClass && (
                  <Select value={selectedSection} onValueChange={setSelectedSection}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select section..." /></SelectTrigger>
                    <SelectContent>
                      {sectionsForSelectedClass.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button className="w-full" onClick={addAudience} disabled={!selectedClass || (audienceMode === "SECTION" && !selectedSection)}>
                  Add {audienceMode === "CLASS" ? "Class" : "Section"}
                </Button>
              </>
            )}

            {audienceMode === "GROUP" && (
              <>
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select group..." /></SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name} ({g.memberCount})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button className="w-full" onClick={addAudience} disabled={!selectedGroup}>Add Group</Button>
              </>
            )}

            {audienceMode === "USER" && (
              <>
                <Input placeholder="Search by name or email..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
                {userSearching && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                  </p>
                )}
                {userResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border">
                    {userResults.map((m) => (
                      <button key={m.userId} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => addUserAudience(m)}>
                        <div>
                          <div className="font-medium">{m.name}</div>
                          <div className="text-xs text-muted-foreground">{m.email}</div>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{m.role}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Existing attachments */}
      {existingAttachments.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Current Attachments</Label>
          <div className="space-y-1">
            {existingAttachments.map((att) => (
              <div key={att.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                <span>{getMimeIcon(att.mimeType)}</span>
                <span className="min-w-0 truncate flex-1 text-muted-foreground">
                  {att.storageKey.split("/").pop() || att.mimeType}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {(att.size / 1024).toFixed(0)}KB
                </span>
                <button type="button" onClick={() => handleDeleteAttachment(att.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New file attachments */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Add Attachments</Label>
        <div className="space-y-2">
          {newFiles.map((file, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate flex-1">{file.name}</span>
              <span className="shrink-0 text-muted-foreground">{(file.size / 1024).toFixed(0)}KB</span>
              <button type="button" onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))}>
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground transition-colors hover:bg-muted/30">
            <Upload className="h-4 w-4" />
            <span>Click to add files</span>
            <input
              type="file"
              className="hidden"
              multiple
              onChange={(e) => {
                if (e.target.files) setNewFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

    </div>
  );
}
