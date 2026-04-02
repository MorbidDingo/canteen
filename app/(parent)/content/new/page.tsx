"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BottomSheet } from "@/components/ui/motion";
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
  ClipboardList,
  StickyNote,
  Calendar,
  Tag,
  Eye,
  FileText,
  Image as ImageIcon,
} from "lucide-react";

type TagItem = { id: string; name: string; color: string | null };
type Group = { id: string; name: string; memberCount: number };
type ClassInfo = { className: string; sections: string[] };

type AudienceRow = {
  audienceType: "ALL_ORG" | "CLASS" | "SECTION" | "USER" | "GROUP";
  className?: string;
  section?: string;
  userId?: string;
  groupId?: string;
  label: string;
};

type OrgMember = { userId: string; name: string; email: string; role: string };

export default function NewPostPage() {
  const router = useRouter();

  const [type, setType] = useState<"ASSIGNMENT" | "NOTE">("ASSIGNMENT");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [audiences, setAudiences] = useState<AudienceRow[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Lookups
  const [tags, setTags] = useState<TagItem[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);

  // Inline tag creation
  const [newTagName, setNewTagName] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);

  // Audience builder
  const [audienceSheetOpen, setAudienceSheetOpen] = useState(false);
  const [audienceMode, setAudienceMode] = useState<"ALL_ORG" | "CLASS" | "SECTION" | "USER" | "GROUP">("ALL_ORG");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<OrgMember[]>([]);
  const [userSearching, setUserSearching] = useState(false);

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

  useEffect(() => { fetchLookups(); }, [fetchLookups]);

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
      } catch { /* ignore */ }
      finally { setUserSearching(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [userSearch]);

  function addAudience() {
    if (audienceMode === "ALL_ORG") {
      if (audiences.some((a) => a.audienceType === "ALL_ORG")) return;
      setAudiences([{ audienceType: "ALL_ORG", label: "Entire Organization" }]);
      setAudienceSheetOpen(false);
      return;
    }
    if (audienceMode === "CLASS" && selectedClass) {
      if (audiences.some((a) => a.audienceType === "CLASS" && a.className === selectedClass)) return;
      setAudiences((prev) => [
        ...prev.filter((a) => a.audienceType !== "ALL_ORG"),
        { audienceType: "CLASS", className: selectedClass, label: `Class: ${selectedClass}` },
      ]);
      setSelectedClass("");
      setAudienceSheetOpen(false);
      return;
    }
    if (audienceMode === "SECTION" && selectedClass && selectedSection) {
      if (audiences.some((a) => a.audienceType === "SECTION" && a.className === selectedClass && a.section === selectedSection)) return;
      setAudiences((prev) => [
        ...prev.filter((a) => a.audienceType !== "ALL_ORG"),
        { audienceType: "SECTION", className: selectedClass, section: selectedSection, label: `${selectedClass} - ${selectedSection}` },
      ]);
      setSelectedSection("");
      setAudienceSheetOpen(false);
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
      setAudienceSheetOpen(false);
    }
  }

  function addUserAudience(member: OrgMember) {
    if (audiences.some((a) => a.userId === member.userId)) return;
    setAudiences((prev) => [
      ...prev.filter((a) => a.audienceType !== "ALL_ORG"),
      { audienceType: "USER", userId: member.userId, label: member.name },
    ]);
    setUserSearch("");
    setUserResults([]);
    setAudienceSheetOpen(false);
  }

  function removeAudience(index: number) {
    setAudiences((prev) => prev.filter((_, i) => i !== index));
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
        throw new Error(data.error || "Failed to create tag");
      }
      const data = await res.json();
      setTags((prev) => [...prev, data.tag]);
      setSelectedTagIds((prev) => [...prev, data.tag.id]);
      setNewTagName("");
      toast.success("Tag created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setCreatingTag(false);
    }
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }

  function getFileIcon(file: File) {
    if (file.type.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-blue-500" />;
    if (file.type === "application/pdf") return <FileText className="h-4 w-4 text-red-500" />;
    return <Paperclip className="h-4 w-4 text-muted-foreground" />;
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  async function handleSubmit(asDraft: boolean) {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!body.trim()) { toast.error("Body is required"); return; }
    if (audiences.length === 0) { toast.error("Add at least one audience target"); return; }

    setSubmitting(true);
    try {
      const postRes = await fetch("/api/content/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim(),
          body: body.trim(),
          dueAt: dueAt || null,
          audience: audiences.map((a) => ({
            audienceType: a.audienceType,
            className: a.className,
            section: a.section,
            userId: a.userId,
            groupId: a.groupId,
          })),
          tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        }),
      });

      if (!postRes.ok) {
        const data = await postRes.json();
        throw new Error(data.error || "Failed to create post");
      }

      const { post } = await postRes.json();

      // Upload attachments
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const attRes = await fetch(`/api/content/posts/${post.id}/attachments`, {
          method: "POST",
          body: formData,
        });
        if (!attRes.ok) toast.error(`Failed to upload ${file.name}`);
      }

      // Publish if not draft
      if (!asDraft) {
        await fetch(`/api/content/posts/${post.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PUBLISHED" }),
        });
      }

      toast.success(asDraft ? "Draft saved" : "Post published");
      router.push("/content");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setSubmitting(false);
    }
  }

  const sectionsForSelectedClass = classes.find((c) => c.className === selectedClass)?.sections || [];
  const audienceIconMap: Record<string, React.ReactNode> = {
    ALL_ORG: <Globe className="h-3 w-3" />,
    CLASS: <GraduationCap className="h-3 w-3" />,
    SECTION: <GraduationCap className="h-3 w-3" />,
    USER: <User className="h-3 w-3" />,
    GROUP: <Users className="h-3 w-3" />,
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push("/content")}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40 transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-lg font-semibold">New Post</h1>
          <p className="text-[11px] text-muted-foreground">Create an assignment or note</p>
        </div>
      </div>

      {/* Type selector — pill style */}
      <div className="flex gap-2 mb-5">
        <button
          type="button"
          onClick={() => setType("ASSIGNMENT")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 py-3.5 text-sm font-medium transition-all ${
            type === "ASSIGNMENT"
              ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/20 dark:text-blue-300"
              : "border-border/40 bg-card text-muted-foreground hover:border-border"
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Assignment
        </button>
        <button
          type="button"
          onClick={() => setType("NOTE")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border-2 py-3.5 text-sm font-medium transition-all ${
            type === "NOTE"
              ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-950/20 dark:text-emerald-300"
              : "border-border/40 bg-card text-muted-foreground hover:border-border"
          }`}
        >
          <StickyNote className="h-4 w-4" />
          Note
        </button>
      </div>

      {/* Form fields — card style sections */}
      <div className="space-y-4">
        {/* Title */}
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</Label>
          <Input
            placeholder={type === "ASSIGNMENT" ? "e.g. Math Homework Chapter 5" : "e.g. Class Notes — Photosynthesis"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-2 border-0 bg-transparent px-0 text-base font-medium placeholder:text-muted-foreground/40 focus-visible:ring-0"
          />
        </div>

        {/* Body */}
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Content</Label>
          <Textarea
            placeholder="Write the content or instructions..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="mt-2 border-0 bg-transparent px-0 text-sm placeholder:text-muted-foreground/40 focus-visible:ring-0 resize-none"
          />
        </div>

        {/* Due date (assignments only) */}
        {type === "ASSIGNMENT" && (
          <div className="rounded-2xl border border-border/40 bg-card p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due Date</Label>
              <span className="text-[10px] text-muted-foreground/60">(optional)</span>
            </div>
            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="mt-2 border-0 bg-transparent px-0 text-sm focus-visible:ring-0"
            />
          </div>
        )}

        {/* Tags */}
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tags</Label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className="transition-transform active:scale-95"
              >
                <Badge
                  variant={selectedTagIds.includes(tag.id) ? "default" : "outline"}
                  className="cursor-pointer text-xs rounded-lg"
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
                className="h-6 w-24 rounded-lg border-dashed text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleCreateTag(); }
                }}
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
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Audience</Label>
            </div>
            <button
              type="button"
              onClick={() => setAudienceSheetOpen(true)}
              className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          </div>
          {audiences.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-2">
              No audience selected. Tap &ldquo;Add&rdquo; to choose who can see this.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {audiences.map((a, i) => (
                <Badge key={i} variant="secondary" className="gap-1.5 text-xs rounded-lg py-1">
                  {audienceIconMap[a.audienceType]}
                  {a.label}
                  <button type="button" onClick={() => removeAudience(i)} className="ml-0.5 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Attachments */}
        <div className="rounded-2xl border border-border/40 bg-card p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attachments</Label>
          </div>
          <div className="space-y-2">
            {files.map((file, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-xl bg-muted/30 px-3 py-2">
                {getFileIcon(file)}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/40 px-4 py-4 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/20">
              <Upload className="h-5 w-5 text-muted-foreground/40" />
              <span>Tap to add files</span>
              <input
                type="file"
                className="hidden"
                multiple
                onChange={(e) => {
                  if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Submit — sticky bottom */}
      <div className="fixed bottom-[max(4.5rem,calc(4.5rem+env(safe-area-inset-bottom)))] left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-sm px-4 py-3">
        <div className="mx-auto max-w-2xl flex gap-2">
          <Button
            variant="outline"
            className="flex-1 h-11 rounded-xl text-sm font-medium"
            disabled={submitting}
            onClick={() => handleSubmit(true)}
          >
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save Draft
          </Button>
          <Button
            className="flex-1 h-11 rounded-xl text-sm font-medium"
            disabled={submitting}
            onClick={() => handleSubmit(false)}
          >
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Publish
          </Button>
        </div>
      </div>

      {/* Audience Bottom Sheet */}
      <BottomSheet
        open={audienceSheetOpen}
        onClose={() => setAudienceSheetOpen(false)}
        snapPoints={[60]}
      >
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Add Audience</h3>
          <p className="text-[11px] text-muted-foreground">Choose who can see this post</p>
        </div>
        <div className="px-4 py-3 space-y-3">
          <Select value={audienceMode} onValueChange={(v) => setAudienceMode(v as typeof audienceMode)}>
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL_ORG">Entire Organization</SelectItem>
              <SelectItem value="CLASS">Class</SelectItem>
              <SelectItem value="SECTION">Class + Section</SelectItem>
              <SelectItem value="GROUP">Group</SelectItem>
              <SelectItem value="USER">Specific User</SelectItem>
            </SelectContent>
          </Select>

          {audienceMode === "ALL_ORG" && (
            <Button className="w-full h-10 rounded-xl" onClick={addAudience}>
              <Globe className="mr-2 h-4 w-4" />
              Target Entire Organization
            </Button>
          )}

          {(audienceMode === "CLASS" || audienceMode === "SECTION") && (
            <>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Select class..." />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.className} value={c.className}>{c.className}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {audienceMode === "SECTION" && selectedClass && (
                <Select value={selectedSection} onValueChange={setSelectedSection}>
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder="Select section..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sectionsForSelectedClass.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                className="w-full h-10 rounded-xl"
                onClick={addAudience}
                disabled={!selectedClass || (audienceMode === "SECTION" && !selectedSection)}
              >
                Add {audienceMode === "CLASS" ? "Class" : "Section"}
              </Button>
            </>
          )}

          {audienceMode === "GROUP" && (
            <>
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Select group..." />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name} ({g.memberCount})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button className="w-full h-10 rounded-xl" onClick={addAudience} disabled={!selectedGroup}>
                Add Group
              </Button>
            </>
          )}

          {audienceMode === "USER" && (
            <>
              <Input
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="h-10 rounded-xl"
              />
              {userSearching && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                </div>
              )}
              {userResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-xl border divide-y">
                  {userResults.map((m) => (
                    <button
                      key={m.userId}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-muted/40 transition-colors"
                      onClick={() => addUserAudience(m)}
                    >
                      <div>
                        <div className="text-xs font-medium">{m.name}</div>
                        <div className="text-[10px] text-muted-foreground">{m.email}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{m.role}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
