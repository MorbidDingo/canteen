"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
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
  FolderOpen,
  Upload,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
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
type CreateMode = "ASSIGNMENT" | "NOTE" | "FOLDER";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function NewPostPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlType = searchParams.get("type");
  const urlFolderId = searchParams.get("folderId");

  /* ── Mode ── */
  const initialMode: CreateMode =
    urlType === "NOTE"
      ? "NOTE"
      : urlType === "FOLDER"
        ? "FOLDER"
        : "ASSIGNMENT";
  const [mode, setMode] = useState<CreateMode>(initialMode);

  /* ── Post fields ── */
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editorMode, setEditorMode] = useState<"richtext" | "markdown">("richtext");
  const [dueAt, setDueAt] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  /* ── Folder fields ── */
  const [folderDescription, setFolderDescription] = useState("");

  /* ── Shared ── */
  const [audiences, setAudiences] = useState<AudienceRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);

  /* ── Permission ── */
  const [permissionScope, setPermissionScope] = useState<string | null>(null);
  const [permissionLoaded, setPermissionLoaded] = useState(false);

  /* ── Lookups ── */
  const [tags, setTags] = useState<TagItem[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);

  /* ── Inline tag creation ── */
  const [newTagName, setNewTagName] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);

  /* ── Audience builder ── */
  const [audienceSheetOpen, setAudienceSheetOpen] = useState(false);
  const [audienceMode, setAudienceMode] =
    useState<AudienceRow["audienceType"]>("ALL_ORG");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<OrgMember[]>([]);
  const [userSearching, setUserSearching] = useState(false);

  const canCreateAssignment =
    permissionScope === "BOTH" || permissionScope === "ASSIGNMENT";
  const canCreateNote =
    permissionScope === "BOTH" || permissionScope === "NOTE";
  const canCreateFolder = !!permissionScope; // any content permission allows folder creation
  const hasAnyPermission = canCreateAssignment || canCreateNote;

  /* ── Auto-select allowed mode on permission load ── */
  useEffect(() => {
    if (!permissionLoaded) return;
    if (mode === "ASSIGNMENT" && !canCreateAssignment && canCreateNote)
      setMode("NOTE");
    if (mode === "NOTE" && !canCreateNote && canCreateAssignment)
      setMode("ASSIGNMENT");
  }, [permissionLoaded, mode, canCreateAssignment, canCreateNote]);

  /* ── Fetch lookups ── */
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
    }
    if (urlFolderId) {
      try {
        const folderRes = await fetch(`/api/content/folders/${urlFolderId}`);
        if (folderRes.ok) {
          const folderData = await folderRes.json();
          setFolderName(folderData.folder?.name ?? null);
        }
      } catch {
        /* ignore */
      }
    }
    setPermissionLoaded(true);
  }, [urlFolderId]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  /* ── User search debounce ── */
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
        if (res.ok) setUserResults((await res.json()).members || []);
      } catch {
        /* ignore */
      } finally {
        setUserSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [userSearch]);

  /* ── Audience helpers ── */
  function addAudience() {
    if (audienceMode === "ALL_ORG") {
      setAudiences([{ audienceType: "ALL_ORG", label: "Entire Organization" }]);
      setAudienceSheetOpen(false);
      return;
    }
    if (audienceMode === "CLASS" && selectedClass) {
      if (
        audiences.some(
          (a) => a.audienceType === "CLASS" && a.className === selectedClass,
        )
      )
        return;
      setAudiences((prev) => [
        ...prev.filter((a) => a.audienceType !== "ALL_ORG"),
        {
          audienceType: "CLASS",
          className: selectedClass,
          label: `Class: ${selectedClass}`,
        },
      ]);
      setSelectedClass("");
      setAudienceSheetOpen(false);
      return;
    }
    if (audienceMode === "SECTION" && selectedClass && selectedSection) {
      if (
        audiences.some(
          (a) =>
            a.audienceType === "SECTION" &&
            a.className === selectedClass &&
            a.section === selectedSection,
        )
      )
        return;
      setAudiences((prev) => [
        ...prev.filter((a) => a.audienceType !== "ALL_ORG"),
        {
          audienceType: "SECTION",
          className: selectedClass,
          section: selectedSection,
          label: `${selectedClass} – ${selectedSection}`,
        },
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
        {
          audienceType: "GROUP",
          groupId: selectedGroup,
          label: `Group: ${group.name}`,
        },
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

  /* ── Tag helpers ── */
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
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    );
  }

  /* ── File helpers ── */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    if (picked.length > 0) setFiles((prev) => [...prev, ...picked]);
    e.target.value = "";
  }

  function getFileIcon(file: File) {
    if (file.type.startsWith("image/"))
      return <ImageIcon className="h-4 w-4 text-blue-500" />;
    if (file.type === "application/pdf")
      return <FileText className="h-4 w-4 text-red-500" />;
    return <Paperclip className="h-4 w-4 text-muted-foreground" />;
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  /* ── Submit: Folder ── */
  async function handleSubmitFolder() {
    if (!title.trim()) {
      toast.error("Folder name is required");
      return;
    }
    if (audiences.length === 0) {
      toast.error("Add at least one audience target");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/content/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: title.trim(),
          description: folderDescription.trim() || null,
          audience: audiences.map((a) => ({
            audienceType: a.audienceType,
            className: a.className,
            section: a.section,
            userId: a.userId,
            groupId: a.groupId,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create folder");
      }
      const { folder } = await res.json();
      toast.success("Folder created");
      router.push(`/assignments/folder/${folder.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create folder",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Submit: Post ── */
  async function handleSubmitPost(asDraft: boolean) {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!body.trim()) {
      toast.error("Body is required");
      return;
    }
    if (!urlFolderId && audiences.length === 0) {
      toast.error("Add at least one audience target");
      return;
    }

    setSubmitting(true);
    try {
      const postRes = await fetch("/api/content/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: mode as "ASSIGNMENT" | "NOTE",
          title: title.trim(),
          body: body.trim(),
          dueAt: dueAt || null,
          folderId: urlFolderId || undefined,
          audience: urlFolderId
            ? undefined
            : audiences.map((a) => ({
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
        try {
          const formData = new FormData();
          formData.append("file", file);
          const attRes = await fetch(
            `/api/content/posts/${post.id}/attachments`,
            {
              method: "POST",
              body: formData,
            },
          );
          if (!attRes.ok) {
            const errData = await attRes.json().catch(() => ({}));
            toast.error(
              `Failed to upload ${file.name}: ${errData.error || attRes.statusText}`,
            );
          }
        } catch {
          toast.error(`Failed to upload ${file.name}: network error`);
        }
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
      router.push(
        urlFolderId ? `/assignments/folder/${urlFolderId}` : "/assignments",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Derived ── */
  const sectionsForSelectedClass =
    classes.find((c) => c.className === selectedClass)?.sections || [];
  const audienceIconMap: Record<string, React.ReactNode> = {
    ALL_ORG: <Globe className="h-3 w-3" />,
    CLASS: <GraduationCap className="h-3 w-3" />,
    SECTION: <GraduationCap className="h-3 w-3" />,
    USER: <User className="h-3 w-3" />,
    GROUP: <Users className="h-3 w-3" />,
  };

  const isPostValid =
    title.trim() && body.trim() && (!!urlFolderId || audiences.length > 0);
  const isFolderValid = title.trim() && audiences.length > 0;
  const isValid = mode === "FOLDER" ? isFolderValid : isPostValid;

  const headingText =
    mode === "FOLDER"
      ? "New Folder"
      : mode === "ASSIGNMENT"
        ? "New Assignment"
        : "New Note";

  /* ── Mode tabs ── */
  const modeTabs: {
    value: CreateMode;
    label: string;
    icon: React.ReactNode;
    allowed: boolean;
  }[] = [
    {
      value: "ASSIGNMENT",
      label: "Assignment",
      icon: <ClipboardList className="h-3.5 w-3.5" />,
      allowed: canCreateAssignment,
    },
    {
      value: "NOTE",
      label: "Note",
      icon: <StickyNote className="h-3.5 w-3.5" />,
      allowed: canCreateNote,
    },
    {
      value: "FOLDER",
      label: "Folder",
      icon: <FolderOpen className="h-3.5 w-3.5" />,
      allowed: canCreateFolder,
    },
  ];
  const availableTabs = modeTabs.filter((t) => t.allowed);

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */
  return (
    <div className="mx-auto max-w-2xl px-5 pb-40 sm:px-8">
      {/* ── Header ── */}
      <div className="sticky top-0 z-30 -mx-5 flex items-center gap-3 border-b border-border/10 bg-background/90 backdrop-blur-xl px-5 pb-3 pt-4">
        <button
          type="button"
          onClick={() =>
            router.push(
              urlFolderId
                ? `/assignments/folder/${urlFolderId}`
                : "/assignments",
            )
          }
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/50 transition-colors active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-semibold leading-tight truncate">
            {headingText}
          </h1>
          {folderName && mode !== "FOLDER" && (
            <p className="text-[12px] text-muted-foreground truncate">
              in {folderName}
            </p>
          )}
        </div>
        {hasAnyPermission && (
          <button
            type="button"
            disabled={submitting || !isValid}
            onClick={() =>
              mode === "FOLDER" ? handleSubmitFolder() : handleSubmitPost(false)
            }
            className="flex h-9 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-semibold text-primary-foreground transition-all active:scale-95 disabled:opacity-40 shrink-0"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : mode === "FOLDER" ? (
              "Create"
            ) : (
              "Publish"
            )}
          </button>
        )}
      </div>

      {/* ── No permission ── */}
      {permissionLoaded && !hasAnyPermission && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40">
            <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p className="text-base font-semibold">No Content Permission</p>
          <p className="text-sm text-muted-foreground text-pretty max-w-xs">
            Contact your organization&apos;s management to request access.
          </p>
        </div>
      )}

      {hasAnyPermission && (
        <div className="pt-5 space-y-0">
          {/* ── Mode switcher (only if >1 option and not inside a folder) ── */}
          {!urlFolderId && availableTabs.length > 1 && (
            <div className="mb-5 flex rounded-2xl bg-muted/40 p-1">
              {availableTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setMode(tab.value)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-medium transition-all",
                    mode === tab.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground/70",
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════ */}
          {/*  FOLDER MODE                                                */}
          {/* ════════════════════════════════════════════════════════════ */}
          {mode === "FOLDER" && (
            <div className="space-y-5">
              {/* Icon + Name */}
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10">
                  <FolderOpen className="h-6 w-6 text-violet-500" />
                </div>
                <Input
                  placeholder="Folder name…"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="border-0 bg-transparent px-0 text-xl font-semibold placeholder:text-muted-foreground/25 focus-visible:ring-0 h-auto py-0"
                  autoFocus
                />
              </div>

              {/* Description */}
              <Textarea
                placeholder="Optional description…"
                value={folderDescription}
                onChange={(e) => setFolderDescription(e.target.value)}
                rows={2}
                className="border-0 bg-transparent px-0 text-[15px] leading-relaxed placeholder:text-muted-foreground/25 focus-visible:ring-0 resize-none"
              />

              <div className="h-px bg-border/20" />

              {/* Audience */}
              <AudienceCard
                audiences={audiences}
                audienceIconMap={audienceIconMap}
                onOpen={() => setAudienceSheetOpen(true)}
                onRemove={removeAudience}
              />

              <p className="text-[12px] text-muted-foreground/50 px-1">
                Notes and assignments inside this folder will inherit its
                audience.
              </p>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════ */}
          {/*  ASSIGNMENT / NOTE MODE                                     */}
          {/* ════════════════════════════════════════════════════════════ */}
          {(mode === "ASSIGNMENT" || mode === "NOTE") && (
            <div className="space-y-0">
              {/* Title */}
              <Input
                placeholder={
                  mode === "ASSIGNMENT" ? "Assignment title…" : "Note title…"
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mb-4 border-0 bg-transparent px-0 text-2xl font-bold placeholder:text-muted-foreground/25 focus-visible:ring-0 h-auto py-1 leading-tight"
                autoFocus
              />

              {/* Body — rich-text / markdown toggle */}
              <div className="mb-5 rounded-2xl border border-border/20 bg-muted/10 overflow-hidden">
                {/* Toggle bar */}
                <div className="flex items-center justify-between border-b border-border/10 px-3 py-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                    {editorMode === "richtext" ? "Rich Text" : "Markdown"}
                  </span>
                  <button
                    type="button"
                    aria-label={editorMode === "richtext" ? "Switch to markdown editor" : "Switch to rich text editor"}
                    onClick={() =>
                      setEditorMode((prev) =>
                        prev === "richtext" ? "markdown" : "richtext",
                      )
                    }
                    className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                  >
                    {editorMode === "richtext" ? "Markdown" : "Rich Text"}
                  </button>
                </div>

                {/* Rich text editor */}
                {editorMode === "richtext" && (
                  <div className="min-h-[160px] px-1 py-1">
                    <RichTextEditor
                      placeholder="Write details or instructions…"
                      value={body}
                      onChange={setBody}
                      disabled={submitting}
                      title={
                        title ||
                        (mode === "ASSIGNMENT" ? "New Assignment" : "New Note")
                      }
                    />
                  </div>
                )}

                {/* Markdown editor */}
                {editorMode === "markdown" && (
                  <div className="px-3 py-2">
                    <Textarea
                      placeholder="Write in markdown…"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      disabled={submitting}
                      rows={8}
                      className="min-h-[160px] border-0 bg-transparent px-0 font-mono text-[14px] leading-relaxed placeholder:text-muted-foreground/30 focus-visible:ring-0 resize-none"
                    />
                  </div>
                )}

                {editorMode === "markdown" && (
                  <p className="border-t border-border/10 px-3 py-1.5 text-[11px] text-muted-foreground/50">
                    Supports markdown formatting
                  </p>
                )}
              </div>

              {/* ── Metadata cards ── */}
              <div className="space-y-2.5">
                {/* Due date (assignments only) */}
                {mode === "ASSIGNMENT" && (
                  <div className="flex items-center gap-3 rounded-2xl bg-muted/30 px-4 py-3">
                    <Calendar className="h-4.5 w-4.5 shrink-0 text-muted-foreground/60" />
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-0.5">
                        Due date
                      </p>
                      <Input
                        type="datetime-local"
                        value={dueAt}
                        onChange={(e) => setDueAt(e.target.value)}
                        className="border-0 bg-transparent px-0 text-[14px] focus-visible:ring-0 h-6"
                      />
                    </div>
                    {dueAt && (
                      <button
                        type="button"
                        onClick={() => setDueAt("")}
                        className="text-muted-foreground/40 hover:text-muted-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {/* Audience */}
                {urlFolderId ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-violet-50/50 dark:bg-violet-950/20 px-4 py-3">
                    <Eye className="h-4.5 w-4.5 shrink-0 text-violet-500/60" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-violet-500/60 uppercase tracking-wider mb-0.5">
                        Audience
                      </p>
                      <p className="text-[14px] text-violet-600 dark:text-violet-400">
                        Inherited from folder
                      </p>
                    </div>
                  </div>
                ) : (
                  <AudienceCard
                    audiences={audiences}
                    audienceIconMap={audienceIconMap}
                    onOpen={() => setAudienceSheetOpen(true)}
                    onRemove={removeAudience}
                  />
                )}

                {/* Tags */}
                <div className="flex items-start gap-3 rounded-2xl bg-muted/30 px-4 py-3">
                  <Tag className="mt-1 h-4.5 w-4.5 shrink-0 text-muted-foreground/60" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">
                      Tags
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className="transition-transform active:scale-95"
                        >
                          <Badge
                            variant={
                              selectedTagIds.includes(tag.id)
                                ? "default"
                                : "outline"
                            }
                            className="cursor-pointer text-[12px] rounded-lg py-1 px-2.5"
                            style={
                              tag.color && selectedTagIds.includes(tag.id)
                                ? {
                                    backgroundColor: tag.color,
                                    borderColor: tag.color,
                                    color: "#fff",
                                  }
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
                          placeholder="New tag…"
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          className="h-7 w-20 rounded-lg border-dashed text-[12px] px-2"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleCreateTag();
                            }
                          }}
                        />
                        {newTagName.trim() && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 rounded-lg"
                            onClick={handleCreateTag}
                            disabled={creatingTag}
                          >
                            {creatingTag ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Attachments */}
                <div className="flex items-start gap-3 rounded-2xl bg-muted/30 px-4 py-3">
                  <Paperclip className="mt-1 h-4.5 w-4.5 shrink-0 text-muted-foreground/60" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">
                      Files
                    </p>
                    <div className="space-y-2">
                      {files.map((file, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2.5 rounded-xl bg-background px-3 py-2 shadow-sm"
                        >
                          {getFileIcon(file)}
                          <span className="truncate text-[13px] font-medium flex-1">
                            {file.name}
                          </span>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {formatFileSize(file.size)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setFiles((prev) => prev.filter((_, j) => j !== i))
                            }
                          >
                            <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      ))}
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border/40 px-3 py-3 text-[13px] text-muted-foreground/60 transition-colors hover:border-border hover:bg-background/50 active:scale-[0.98]">
                        <Upload className="h-4 w-4" />
                        <span>
                          {files.length > 0
                            ? "Add more files"
                            : "Tap to attach files"}
                        </span>
                        <input
                          type="file"
                          className="hidden"
                          multiple
                          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                          onChange={handleFileChange}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Sticky bottom bar (post modes only) ── */}
      {hasAnyPermission && mode !== "FOLDER" && (
        <div className="fixed bottom-[max(6.5rem,calc(6.5rem+env(safe-area-inset-bottom)))] left-0 right-0 z-40 border-t border-border/10 bg-background/95 backdrop-blur-xl px-4 py-3">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted/50 transition-colors active:bg-muted active:scale-95 min-h-[44px] min-w-[44px]">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <input
                type="file"
                className="hidden"
                multiple
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                onChange={handleFileChange}
              />
            </label>
            {files.length > 0 && (
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {files.length} file{files.length > 1 ? "s" : ""}
              </span>
            )}
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-10 rounded-full px-5 text-[14px] font-medium text-muted-foreground min-h-[44px]"
              disabled={submitting || !isPostValid}
              onClick={() => handleSubmitPost(true)}
            >
              {submitting && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Draft
            </Button>
            <Button
              size="sm"
              className="h-10 rounded-full px-6 text-[14px] font-semibold shadow-sm min-h-[44px]"
              disabled={submitting || !isPostValid}
              onClick={() => handleSubmitPost(false)}
            >
              {submitting && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
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
        <div className="px-5 py-3.5 border-b border-border/20">
          <h3 className="text-[15px] font-semibold">Add Audience</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {mode === "FOLDER"
              ? "Choose who can see content in this folder"
              : "Choose who can see this post"}
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          {/* Mode pills */}
          <div className="flex flex-wrap gap-1.5">
            {[
              {
                value: "ALL_ORG" as const,
                label: "Everyone",
                icon: <Globe className="h-3 w-3" />,
              },
              {
                value: "CLASS" as const,
                label: "Class",
                icon: <GraduationCap className="h-3 w-3" />,
              },
              {
                value: "SECTION" as const,
                label: "Section",
                icon: <GraduationCap className="h-3 w-3" />,
              },
              {
                value: "GROUP" as const,
                label: "Group",
                icon: <Users className="h-3 w-3" />,
              },
              {
                value: "USER" as const,
                label: "Person",
                icon: <User className="h-3 w-3" />,
              },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAudienceMode(opt.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all active:scale-95",
                  audienceMode === opt.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted",
                )}
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
                    <SelectItem key={c.className} value={c.className}>
                      {c.className}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {audienceMode === "SECTION" && selectedClass && (
                <Select
                  value={selectedSection}
                  onValueChange={setSelectedSection}
                >
                  <SelectTrigger className="h-10 rounded-xl">
                    <SelectValue placeholder="Select section…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectionsForSelectedClass.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                className="w-full h-10 rounded-xl"
                onClick={addAudience}
                disabled={
                  !selectedClass ||
                  (audienceMode === "SECTION" && !selectedSection)
                }
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
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} ({g.memberCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="w-full h-10 rounded-xl"
                onClick={addAudience}
                disabled={!selectedGroup}
              >
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
                        <div className="text-[11px] text-muted-foreground">
                          {m.email}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] rounded-md"
                      >
                        {m.role}
                      </Badge>
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

/* ------------------------------------------------------------------ */
/*  Audience card sub-component                                        */
/* ------------------------------------------------------------------ */
function AudienceCard({
  audiences,
  audienceIconMap,
  onOpen,
  onRemove,
}: {
  audiences: AudienceRow[];
  audienceIconMap: Record<string, React.ReactNode>;
  onOpen: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl bg-muted/30 px-4 py-3 text-left transition-colors active:bg-muted/50"
    >
      <Eye className="h-4.5 w-4.5 shrink-0 text-muted-foreground/60" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-0.5">
          Audience
        </p>
        {audiences.length === 0 ? (
          <p className="text-[14px] text-muted-foreground/40">Tap to select…</p>
        ) : (
          <div className="flex flex-wrap gap-1 mt-1">
            {audiences.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-lg bg-background px-2.5 py-1 text-[12px] font-medium shadow-sm"
              >
                {audienceIconMap[a.audienceType]}
                {a.label}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(i);
                  }}
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
  );
}
