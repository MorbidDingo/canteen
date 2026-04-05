"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  const searchParams = useSearchParams();
  const urlType = searchParams.get("type");

  const [type, setType] = useState<"ASSIGNMENT" | "NOTE">(
    urlType === "NOTE" ? "NOTE" : "ASSIGNMENT",
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [audiences, setAudiences] = useState<AudienceRow[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Permission
  const [permissionScope, setPermissionScope] = useState<string | null>(null);
  const [permissionLoaded, setPermissionLoaded] = useState(false);

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

  const canCreateAssignment = permissionScope === "BOTH" || permissionScope === "ASSIGNMENT";
  const canCreateNote = permissionScope === "BOTH" || permissionScope === "NOTE";

  const fetchLookups = useCallback(async () => {
    const [tagsRes, groupsRes, classesRes, feedRes] = await Promise.all([
      fetch("/api/content/tags"),
      fetch("/api/content/groups"),
      fetch("/api/content/classes"),
      fetch("/api/content/feed?limit=1"),
    ]);
    if (tagsRes.ok) setTags((await tagsRes.json()).tags);
    if (groupsRes.ok) setGroups((await groupsRes.json()).groups);
    if (classesRes.ok) setClasses((await classesRes.json()).classes);
    if (feedRes.ok) {
      const feedData = await feedRes.json();
      setPermissionScope(feedData.permissionScope ?? null);
      // Auto-select the allowed type
      if (feedData.permissionScope === "NOTE") setType("NOTE");
    }
    setPermissionLoaded(true);
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
          `/api/content/members?q=${encodeURIComponent(userSearch)}`,
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
      router.push("/assignments");
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

  const isFormValid = title.trim() && body.trim() && audiences.length > 0;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-40">
      {/* ── Header ── */}
      <div className="sticky top-0 z-30 -mx-4 flex items-center gap-3 bg-background/80 backdrop-blur-md px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={() => router.push("/assignments")}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 transition-colors active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-[15px] font-semibold leading-tight">
            {type === "ASSIGNMENT" ? "New Assignment" : "New Note"}
          </h1>
        </div>
        {(canCreateAssignment || canCreateNote) && (
          <button
            type="button"
            disabled={submitting || !isFormValid}
            onClick={() => handleSubmit(false)}
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-all active:scale-95 disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Publish"}
          </button>
        )}
      </div>

      {/* No permission state */}
      {permissionLoaded && !canCreateAssignment && !canCreateNote && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40">
            <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium">No Content Permission</p>
          <p className="text-xs text-muted-foreground">
            Contact your organization&apos;s management to request access.
          </p>
        </div>
      )}

      {(canCreateAssignment || canCreateNote) && (
        <div className="space-y-5 pt-2">
          {/* ── Type toggle ── */}
          {canCreateAssignment && canCreateNote && (
            <div className="flex rounded-xl bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setType("ASSIGNMENT")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium transition-all ${
                  type === "ASSIGNMENT"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Assignment
              </button>
              <button
                type="button"
                onClick={() => setType("NOTE")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium transition-all ${
                  type === "NOTE"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                <StickyNote className="h-3.5 w-3.5" />
                Note
              </button>
            </div>
          )}

          {/* ── Title ── */}
          <Input
            placeholder={type === "ASSIGNMENT" ? "Assignment title…" : "Note title…"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-0 bg-transparent px-0 text-xl font-semibold placeholder:text-muted-foreground/30 focus-visible:ring-0 h-auto py-0"
          />

          {/* ── Body ── */}
          <Textarea
            placeholder="Write details or instructions…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="border-0 bg-transparent px-0 text-[15px] leading-relaxed placeholder:text-muted-foreground/30 focus-visible:ring-0 resize-none"
          />

          {/* ── Separator ── */}
          <div className="h-px bg-border/30" />

          {/* ── Metadata strip ── */}
          <div className="space-y-3">
            {/* Due date (assignments) */}
            {type === "ASSIGNMENT" && (
              <div className="flex items-center gap-3 rounded-xl bg-muted/30 px-3.5 py-2.5">
                <Calendar className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                <div className="flex-1">
                  <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Due</p>
                  <Input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="border-0 bg-transparent px-0 text-[13px] focus-visible:ring-0 h-6"
                  />
                </div>
                {dueAt && (
                  <button type="button" onClick={() => setDueAt("")} className="text-muted-foreground/40 hover:text-muted-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Audience */}
            <button
              type="button"
              onClick={() => setAudienceSheetOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl bg-muted/30 px-3.5 py-2.5 text-left transition-colors active:bg-muted/50"
            >
              <Eye className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Audience</p>
                {audiences.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground/40">Tap to select…</p>
                ) : (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {audiences.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 text-[11px] font-medium shadow-sm">
                        {audienceIconMap[a.audienceType]}
                        {a.label}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeAudience(i); }}
                          className="ml-0.5 hover:text-destructive"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground/40" />
            </button>

            {/* Tags */}
            <div className="flex items-start gap-3 rounded-xl bg-muted/30 px-3.5 py-2.5">
              <Tag className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">Tags</p>
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
                        className="cursor-pointer text-[11px] rounded-md"
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
                      placeholder="New…"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      className="h-5 w-16 rounded-md border-dashed text-[11px] px-1.5"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); handleCreateTag(); }
                      }}
                    />
                    {newTagName.trim() && (
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={handleCreateTag} disabled={creatingTag}>
                        {creatingTag ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Attachments */}
            <div className="flex items-start gap-3 rounded-xl bg-muted/30 px-3.5 py-2.5">
              <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">Files</p>
                <div className="space-y-1.5">
                  {files.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-background px-2.5 py-1.5 shadow-sm">
                      {getFileIcon(file)}
                      <span className="truncate text-[12px] font-medium flex-1">{file.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{formatFileSize(file.size)}</span>
                      <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                  <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/40 px-3 py-2.5 text-[12px] text-muted-foreground/50 transition-colors hover:border-border hover:bg-background/50 active:scale-[0.98]">
                    <Upload className="h-4 w-4" />
                    <span>{files.length > 0 ? "Add more files" : "Tap to attach files"}</span>
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
          </div>
        </div>
      )}

      {/* ── Sticky bottom bar ── */}
      {(canCreateAssignment || canCreateNote) && (
        <div className="fixed bottom-[max(5.5rem,calc(5.5rem+env(safe-area-inset-bottom)))] left-0 right-0 z-40 border-t border-border/30 bg-background/90 backdrop-blur-md px-4 py-2.5">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted/50 transition-colors active:bg-muted">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
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
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-full px-4 text-[13px] font-medium text-muted-foreground"
              disabled={submitting || !isFormValid}
              onClick={() => handleSubmit(true)}
            >
              {submitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Draft
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-full px-5 text-[13px] font-semibold"
              disabled={submitting || !isFormValid}
              onClick={() => handleSubmit(false)}
            >
              {submitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Publish
            </Button>
          </div>
        </div>
      )}

      {/* ── Audience Sheet ── */}
      <BottomSheet
        open={audienceSheetOpen}
        onClose={() => setAudienceSheetOpen(false)}
        snapPoints={[60]}
      >
        <div className="px-5 py-3.5 border-b border-border/30">
          <h3 className="text-[15px] font-semibold">Add Audience</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Choose who can see this post</p>
        </div>
        <div className="px-5 py-4 space-y-3">
          {/* Mode picker as pills instead of select */}
          <div className="flex flex-wrap gap-1.5">
            {([
              { value: "ALL_ORG", label: "Everyone", icon: <Globe className="h-3 w-3" /> },
              { value: "CLASS", label: "Class", icon: <GraduationCap className="h-3 w-3" /> },
              { value: "SECTION", label: "Section", icon: <GraduationCap className="h-3 w-3" /> },
              { value: "GROUP", label: "Group", icon: <Users className="h-3 w-3" /> },
              { value: "USER", label: "Person", icon: <User className="h-3 w-3" /> },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAudienceMode(opt.value)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all active:scale-95 ${
                  audienceMode === opt.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          {audienceMode === "ALL_ORG" && (
            <Button className="w-full h-10 rounded-xl" onClick={addAudience}>
              <Globe className="mr-2 h-4 w-4" />
              Target Entire Organization
            </Button>
          )}

          {(audienceMode === "CLASS" || audienceMode === "SECTION") && (
            <div className="space-y-2.5">
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Select class…" />
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
                    <SelectValue placeholder="Select section…" />
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
            </div>
          )}

          {audienceMode === "GROUP" && (
            <div className="space-y-2.5">
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Select group…" />
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
            </div>
          )}

          {audienceMode === "USER" && (
            <div className="space-y-2.5">
              <Input
                placeholder="Search by name or email…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="h-10 rounded-xl"
              />
              {userSearching && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                </div>
              )}
              {userResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-xl border divide-y">
                  {userResults.map((m) => (
                    <button
                      key={m.userId}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors active:bg-muted/40"
                      onClick={() => addUserAudience(m)}
                    >
                      <div>
                        <div className="text-[13px] font-medium">{m.name}</div>
                        <div className="text-[11px] text-muted-foreground">{m.email}</div>
                      </div>
                      <Badge variant="outline" className="text-[10px] rounded-md">{m.role}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
