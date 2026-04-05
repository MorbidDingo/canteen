"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/motion";
import {
  ArrowLeft,
  Loader2,
  Plus,
  X,
  Globe,
  GraduationCap,
  User,
  Users,
  Eye,
  FolderOpen,
} from "lucide-react";

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

export default function NewFolderPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [audiences, setAudiences] = useState<AudienceRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Lookups
  const [groups, setGroups] = useState<Group[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);

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
    const [groupsRes, classesRes] = await Promise.all([
      fetch("/api/content/groups"),
      fetch("/api/content/classes"),
    ]);
    if (groupsRes.ok) setGroups((await groupsRes.json()).groups);
    if (classesRes.ok) setClasses((await classesRes.json()).classes);
  }, []);

  useEffect(() => { fetchLookups(); }, [fetchLookups]);

  // User search debounce
  useEffect(() => {
    if (userSearch.length < 2) { setUserResults([]); return; }
    const timeout = setTimeout(async () => {
      setUserSearching(true);
      try {
        const res = await fetch(`/api/content/members?q=${encodeURIComponent(userSearch)}`);
        if (res.ok) setUserResults((await res.json()).members || []);
      } catch { /* ignore */ }
      finally { setUserSearching(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [userSearch]);

  function addAudience() {
    if (audienceMode === "ALL_ORG") {
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

  async function handleCreate() {
    if (!name.trim()) { toast.error("Folder name is required"); return; }
    if (audiences.length === 0) { toast.error("Add at least one audience target"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/content/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
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
      toast.error(err instanceof Error ? err.message : "Failed to create folder");
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

  const isFormValid = name.trim() && audiences.length > 0;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-40">
      {/* Header */}
      <div className="sticky top-0 z-30 -mx-4 flex items-center gap-3 bg-background/80 backdrop-blur-md px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={() => router.push("/assignments")}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 transition-colors active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-[15px] font-semibold leading-tight">New Folder</h1>
        </div>
        <button
          type="button"
          disabled={submitting || !isFormValid}
          onClick={handleCreate}
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-all active:scale-95 disabled:opacity-40"
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
        </button>
      </div>

      <div className="space-y-5 pt-2">
        {/* Icon + Name */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10">
            <FolderOpen className="h-6 w-6 text-violet-500" />
          </div>
          <Input
            placeholder="Folder name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-0 bg-transparent px-0 text-xl font-semibold placeholder:text-muted-foreground/30 focus-visible:ring-0 h-auto py-0"
          />
        </div>

        {/* Description */}
        <Textarea
          placeholder="Optional description…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="border-0 bg-transparent px-0 text-[15px] leading-relaxed placeholder:text-muted-foreground/30 focus-visible:ring-0 resize-none"
        />

        <div className="h-px bg-border/30" />

        {/* Audience */}
        <button
          type="button"
          onClick={() => setAudienceSheetOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl bg-muted/30 px-3.5 py-2.5 text-left transition-colors active:bg-muted/50"
        >
          <Eye className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">Target Audience</p>
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

        <p className="text-[12px] text-muted-foreground/60 px-1">
          Notes and assignments created inside this folder will automatically inherit its audience.
        </p>
      </div>

      {/* Audience Sheet */}
      <BottomSheet open={audienceSheetOpen} onClose={() => setAudienceSheetOpen(false)} snapPoints={[60]}>
        <div className="px-5 py-3.5 border-b border-border/30">
          <h3 className="text-[15px] font-semibold">Add Audience</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Choose who can see content in this folder</p>
        </div>
        <div className="px-5 py-4 space-y-3">
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
