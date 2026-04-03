"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TIMETABLE_DAYS,
  TIMETABLE_DAY_LABELS,
  TIMETABLE_STATUS_COLORS,
  TIMETABLE_STATUS_LABELS,
  type TimetableDay,
  type TimetableStatus,
} from "@/lib/constants";
import {
  ConfigStep,
  TeachersStep,
  SubjectsStep,
  ClassroomsStep,
  GroupsStep,
  AssignmentsStep,
  type TimetableConfig,
  type Teacher,
  type Subject,
  type Classroom,
  type StudentGroup,
  type Assignment,
} from "@/components/timetable/wizard-steps";
import { TimetableChat } from "@/components/timetable/timetable-chat";
import {
  Plus,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Loader2,
  Lock,
  AlertTriangle,
  Users,
  BookOpen,
  DoorOpen,
  Clock,
  Wand2,
  ArrowLeft,
  Filter,
  RotateCcw,
  Eye,
  Archive,
  Trash2,
  GripVertical,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────

interface TimetableRecord {
  id: string;
  name: string;
  status: TimetableStatus;
  generationMethod: string;
  conflictCount: number;
  score: number | null;
  aiExplanation: string | null;
  createdAt: string;
  config?: TimetableConfig;
}

interface HydratedSlot {
  id: string;
  timetableId: string;
  day: string;
  period: number;
  teacherId: string | null;
  subjectId: string | null;
  classroomId: string | null;
  studentGroupId: string | null;
  isLocked: boolean;
  isManualOverride: boolean;
  conflictFlags: string[];
  teacher: { name: string; shortCode: string } | null;
  subject: { name: string; shortCode: string; color: string } | null;
  classroom: { name: string; shortCode: string } | null;
  studentGroup: { name: string; shortCode: string } | null;
}

const WIZARD_STEPS = [
  { key: "config", label: "Schedule Config", icon: Clock },
  { key: "teachers", label: "Teachers", icon: Users },
  { key: "subjects", label: "Subjects", icon: BookOpen },
  { key: "classrooms", label: "Classrooms", icon: DoorOpen },
  { key: "groups", label: "Student Groups", icon: Users },
  { key: "assignments", label: "Assignments", icon: GripVertical },
] as const;

type WizardStep = (typeof WIZARD_STEPS)[number]["key"];

// ─── Main Page ────────────────────────────────────────────

export default function TimetablePage() {
  const { data: session } = useSession();
  const [view, setView] = useState<"list" | "wizard" | "grid">("list");
  const [activeTimetable, setActiveTimetable] = useState<TimetableRecord | null>(null);

  // List
  const [timetables, setTimetables] = useState<TimetableRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard
  const [wizardStep, setWizardStep] = useState<WizardStep>("config");
  const [configs, setConfigs] = useState<TimetableConfig[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Grid
  const [slots, setSlots] = useState<HydratedSlot[]>([]);
  const [gridConfig, setGridConfig] = useState<{ activeDays: string[]; periodsPerDay: number } | null>(null);
  const [filterType, setFilterType] = useState<"all" | "teacher" | "group" | "room">("all");
  const [filterId, setFilterId] = useState("");
  const [dragSource, setDragSource] = useState<HydratedSlot | null>(null);
  const [generating, setGenerating] = useState(false);

  // Fetch timetables list
  const fetchTimetables = useCallback(async () => {
    try {
      const res = await fetch("/api/management/timetable/generate", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTimetables(data.timetables || []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  // Fetch wizard master data
  const fetchWizardData = useCallback(async () => {
    try {
      const [cRes, tRes, sRes, rRes, gRes, aRes] = await Promise.all([
        fetch("/api/management/timetable/config", { cache: "no-store" }),
        fetch("/api/management/timetable/teachers", { cache: "no-store" }),
        fetch("/api/management/timetable/subjects", { cache: "no-store" }),
        fetch("/api/management/timetable/classrooms", { cache: "no-store" }),
        fetch("/api/management/timetable/student-groups", { cache: "no-store" }),
        fetch("/api/management/timetable/assignments", { cache: "no-store" }),
      ]);
      if (cRes.ok) setConfigs((await cRes.json()).configs || []);
      if (tRes.ok) setTeachers((await tRes.json()).teachers || []);
      if (sRes.ok) setSubjects((await sRes.json()).subjects || []);
      if (rRes.ok) setClassrooms((await rRes.json()).classrooms || []);
      if (gRes.ok) setGroups((await gRes.json()).groups || []);
      if (aRes.ok) setAssignments((await aRes.json()).assignments || []);
    } catch { /* ignore */ }
  }, []);

  // Fetch grid export data
  const fetchExportData = useCallback(async (timetableId: string) => {
    try {
      const params = new URLSearchParams({ timetableId });
      if (filterType !== "all" && filterId) {
        params.set("filterType", filterType);
        params.set("filterId", filterId);
      }
      const res = await fetch(`/api/management/timetable/export?${params.toString()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSlots(data.slots || []);
        setGridConfig({
          activeDays: data.config?.activeDays || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
          periodsPerDay: data.config?.periodsPerDay || 8,
        });
        // Store filter options
        if (data.teachers) setTeachers(data.teachers);
        if (data.groups) setGroups(data.groups);
        if (data.classrooms) setClassrooms(data.classrooms);
      }
    } catch { /* ignore */ }
  }, [filterType, filterId]);

  useEffect(() => {
    fetchTimetables();
  }, [fetchTimetables]);

  const openWizard = () => {
    setView("wizard");
    setWizardStep("config");
    fetchWizardData();
  };

  const openGrid = (tt: TimetableRecord) => {
    setActiveTimetable(tt);
    setView("grid");
    fetchExportData(tt.id);
    fetchWizardData();
  };

  const generateNewTimetable = async () => {
    if (!configs.length) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/management/timetable/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configId: configs[0].id, name: `Timetable ${new Date().toLocaleDateString()}` }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchTimetables();
        openGrid(data.timetable);
      }
    } catch { /* ignore */ } finally {
      setGenerating(false);
    }
  };

  const updateStatus = async (id: string, newStatus: TimetableStatus) => {
    try {
      const res = await fetch("/api/management/timetable/generate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (res.ok) {
        fetchTimetables();
        if (activeTimetable?.id === id) setActiveTimetable((p) => p ? { ...p, status: newStatus } : null);
      }
    } catch { /* ignore */ }
  };

  const deleteTimetable = async (id: string) => {
    try {
      const res = await fetch(`/api/management/timetable/generate?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchTimetables();
        if (activeTimetable?.id === id) { setActiveTimetable(null); setView("list"); }
      }
    } catch { /* ignore */ }
  };

  // Drag & Drop
  const handleDragStart = (slot: HydratedSlot) => {
    if (slot.isLocked) return;
    setDragSource(slot);
  };

  const handleDrop = async (targetDay: string, targetPeriod: number) => {
    if (!dragSource || !activeTimetable) return;
    if (dragSource.day === targetDay && dragSource.period === targetPeriod) { setDragSource(null); return; }
    try {
      await fetch("/api/management/timetable/slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dragSource.id, day: targetDay, period: targetPeriod }),
      });
      await fetchExportData(activeTimetable.id);
    } catch { /* ignore */ } finally {
      setDragSource(null);
    }
  };

  if (!session?.user) return null;

  // ═══ LIST VIEW ═══
  if (view === "list") {
    return (
      <div className="mx-auto max-w-lg px-4 py-6 space-y-6 md:max-w-3xl">
        <div className="rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50 via-orange-50/60 to-white/80 px-5 py-4 shadow-sm backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-500 mb-0.5">Timetable</p>
          <h1 className="text-2xl font-bold tracking-tight text-amber-950">Schedule Management</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Create and manage school timetables with AI assistance.</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={openWizard} className="gap-2 bg-amber-600 hover:bg-amber-700">
            <Plus className="h-4 w-4" /> Setup Data
          </Button>
          <Button onClick={generateNewTimetable} disabled={generating || !configs.length} variant="outline" className="gap-2 border-amber-200">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Generate New
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div>
        ) : timetables.length === 0 ? (
          <div className="rounded-2xl border border-amber-200/60 bg-white/70 p-8 text-center">
            <Clock className="mx-auto h-10 w-10 text-amber-300 mb-3" />
            <p className="text-sm font-semibold text-amber-950">No timetables yet</p>
            <p className="text-xs text-muted-foreground mt-1">Start by setting up your data, then generate a timetable.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {timetables.map((tt) => (
              <div key={tt.id} className="rounded-2xl border border-amber-200/60 bg-white/70 shadow-sm backdrop-blur overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-amber-950 truncate">{tt.name}</span>
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", TIMETABLE_STATUS_COLORS[tt.status])}>
                        {TIMETABLE_STATUS_LABELS[tt.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Method: {tt.generationMethod}</span>
                      {tt.score !== null && <span>Score: {tt.score}/100</span>}
                      {tt.conflictCount > 0 && (
                        <span className="text-amber-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> {tt.conflictCount} conflicts
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 border-amber-200" onClick={() => openGrid(tt)}>
                      <Eye className="h-3.5 w-3.5" /> View
                    </Button>
                    {tt.status === "DRAFT" && (
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => updateStatus(tt.id, "ACTIVE")}>
                        <Check className="h-3.5 w-3.5" /> Publish
                      </Button>
                    )}
                    {tt.status === "ACTIVE" && (
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 border-slate-200" onClick={() => updateStatus(tt.id, "ARCHIVED")}>
                        <Archive className="h-3.5 w-3.5" /> Archive
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-red-50" onClick={() => deleteTimetable(tt.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ═══ WIZARD VIEW ═══
  if (view === "wizard") {
    return (
      <div className="mx-auto max-w-lg px-4 py-6 space-y-6 md:max-w-4xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setView("list")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-500">Setup</p>
            <h1 className="text-xl font-bold tracking-tight text-amber-950">Timetable Data</h1>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {WIZARD_STEPS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setWizardStep(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                wizardStep === key ? "bg-amber-600 text-white shadow-sm" : "bg-amber-50 text-amber-700 hover:bg-amber-100",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-amber-200/60 bg-white/70 shadow-sm backdrop-blur p-5">
          {wizardStep === "config" && <ConfigStep configs={configs} setConfigs={setConfigs} />}
          {wizardStep === "teachers" && <TeachersStep teachers={teachers} setTeachers={setTeachers} />}
          {wizardStep === "subjects" && <SubjectsStep subjects={subjects} setSubjects={setSubjects} />}
          {wizardStep === "classrooms" && <ClassroomsStep classrooms={classrooms} setClassrooms={setClassrooms} />}
          {wizardStep === "groups" && <GroupsStep groups={groups} setGroups={setGroups} />}
          {wizardStep === "assignments" && (
            <AssignmentsStep assignments={assignments} setAssignments={setAssignments} teachers={teachers} subjects={subjects} groups={groups} />
          )}
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            className="border-amber-200"
            onClick={() => {
              const idx = WIZARD_STEPS.findIndex((s) => s.key === wizardStep);
              if (idx > 0) setWizardStep(WIZARD_STEPS[idx - 1].key);
            }}
            disabled={wizardStep === "config"}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          {wizardStep === "assignments" ? (
            <Button onClick={() => setView("list")} className="bg-amber-600 hover:bg-amber-700">
              Done <Check className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                const idx = WIZARD_STEPS.findIndex((s) => s.key === wizardStep);
                if (idx < WIZARD_STEPS.length - 1) setWizardStep(WIZARD_STEPS[idx + 1].key);
              }}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ═══ GRID VIEW ═══
  const activeDays = gridConfig?.activeDays || TIMETABLE_DAYS.slice(0, 6);
  const periodsPerDay = gridConfig?.periodsPerDay || 8;

  const getFilteredSlot = (day: string, period: number) =>
    slots.filter((s) => s.day === day && s.period === period);

  return (
    <div className="px-2 py-4 lg:px-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setView("list"); setActiveTimetable(null); }}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-amber-950 truncate">{activeTimetable?.name}</h1>
            {activeTimetable && (
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", TIMETABLE_STATUS_COLORS[activeTimetable.status])}>
                {TIMETABLE_STATUS_LABELS[activeTimetable.status]}
              </span>
            )}
          </div>
          {activeTimetable?.score != null && (
            <p className="text-xs text-muted-foreground">Score: {activeTimetable.score}/100</p>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 border-amber-200" onClick={() => activeTimetable && fetchExportData(activeTimetable.id)}>
          <RotateCcw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> View:
        </div>
        <button
          type="button"
          onClick={() => { setFilterType("all"); setFilterId(""); if (activeTimetable) fetchExportData(activeTimetable.id); }}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
            filterType === "all" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100",
          )}
        >
          All
        </button>
        {teachers.length > 0 && (
          <select
            value={filterType === "teacher" ? filterId : ""}
            onChange={(e) => { setFilterType("teacher"); setFilterId(e.target.value); }}
            className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 outline-none"
          >
            <option value="">By Teacher</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {groups.length > 0 && (
          <select
            value={filterType === "group" ? filterId : ""}
            onChange={(e) => { setFilterType("group"); setFilterId(e.target.value); }}
            className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 outline-none"
          >
            <option value="">By Group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        {classrooms.length > 0 && (
          <select
            value={filterType === "room" ? filterId : ""}
            onChange={(e) => { setFilterType("room"); setFilterId(e.target.value); }}
            className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 outline-none"
          >
            <option value="">By Room</option>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* Timetable Grid */}
      <div className="overflow-x-auto rounded-2xl border border-amber-200/60 bg-white/70 shadow-sm">
        <table className="w-full min-w-[700px] border-collapse text-xs">
          <thead>
            <tr className="bg-amber-50/80">
              <th className="border-b border-r border-amber-200/60 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-amber-600 w-16">
                Period
              </th>
              {activeDays.map((day) => (
                <th key={day} className="border-b border-r border-amber-200/60 px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                  {TIMETABLE_DAY_LABELS[day as TimetableDay] || day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: periodsPerDay }, (_, i) => i + 1).map((period) => (
              <tr key={period} className="hover:bg-amber-50/30 transition-colors">
                <td className="border-b border-r border-amber-200/60 px-3 py-2 text-center font-semibold text-amber-800">
                  P{period}
                </td>
                {activeDays.map((day) => {
                  const cellSlots = getFilteredSlot(day, period);
                  return (
                    <td
                      key={`${day}-${period}`}
                      className={cn(
                        "border-b border-r border-amber-200/60 p-1 min-h-[56px] align-top transition-colors",
                        dragSource && "hover:bg-blue-50/60",
                      )}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                      onDrop={(e) => { e.preventDefault(); handleDrop(day, period); }}
                    >
                      {cellSlots.length > 0 ? (
                        cellSlots.map((slot) => (
                          <div
                            key={slot.id}
                            draggable={!slot.isLocked}
                            onDragStart={() => handleDragStart(slot)}
                            onDragEnd={() => setDragSource(null)}
                            className={cn(
                              "rounded-lg px-2 py-1.5 mb-0.5 transition-all",
                              slot.isLocked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
                              dragSource?.id === slot.id && "opacity-40 scale-95",
                              slot.conflictFlags?.length > 0 && "ring-1 ring-red-400",
                            )}
                            style={{
                              backgroundColor: slot.subject?.color ? `${slot.subject.color}18` : "#f5f5f5",
                              borderLeft: `3px solid ${slot.subject?.color || "#ccc"}`,
                            }}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold text-[11px] truncate" style={{ color: slot.subject?.color || "#333" }}>
                                {slot.subject?.shortCode || slot.subject?.name || "—"}
                              </span>
                              {slot.isLocked && <Lock className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
                            </div>
                            <div className="text-[9px] text-muted-foreground truncate">
                              {slot.teacher?.shortCode || slot.teacher?.name || ""}
                              {slot.classroom?.shortCode ? ` · ${slot.classroom.shortCode}` : ""}
                            </div>
                            {slot.studentGroup?.shortCode && (
                              <div className="text-[9px] text-muted-foreground/70 truncate">{slot.studentGroup.shortCode}</div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="h-12 flex items-center justify-center text-muted-foreground/30 text-[10px]">—</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* AI Chat FAB */}
      {activeTimetable && (
        <TimetableChat
          timetableId={activeTimetable.id}
          onDataChanged={() => fetchExportData(activeTimetable.id)}
        />
      )}
    </div>
  );
}
