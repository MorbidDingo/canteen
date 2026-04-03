"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  TIMETABLE_DAYS,
  TIMETABLE_DAY_LABELS,
  ROOM_TYPE_LABELS,
  DEFAULT_SUBJECT_COLORS,
  type RoomType,
} from "@/lib/constants";
import { Plus, Trash2, Loader2, Save } from "lucide-react";

// ─── Types ────────────────────────────────────────────────

export interface TimetableConfig {
  id: string;
  name: string;
  periodsPerDay: number;
  daysPerWeek: number;
  periodDurationMinutes: number;
  startTime: string;
  breakAfterPeriod: number[];
  breakDurationMinutes: number;
  lunchAfterPeriod: number;
  lunchDurationMinutes: number;
  activeDays: string[];
  isActive: boolean;
}

export interface Teacher {
  id: string;
  name: string;
  shortCode: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  maxPeriodsPerDay: number;
  maxPeriodsPerWeek: number;
  consecutivePeriodLimit: number;
  preferredSlots: { day: string; period: number }[];
  unavailableSlots: { day: string; period: number }[];
}

export interface Subject {
  id: string;
  name: string;
  shortCode: string;
  color: string;
  periodsPerWeek: number;
  requiresLab: boolean;
  isElective: boolean;
  preferMorning: boolean;
  preferAfternoon: boolean;
  maxConsecutive: number;
}

export interface Classroom {
  id: string;
  name: string;
  shortCode: string;
  capacity: number;
  roomType: string;
  hasProjector: boolean;
  hasAC: boolean;
  floor: string | null;
  building: string | null;
}

export interface StudentGroup {
  id: string;
  name: string;
  shortCode: string;
  grade: string | null;
  section: string | null;
  strength: number;
  homeRoomId: string | null;
}

export interface Assignment {
  id: string;
  teacherId: string;
  subjectId: string;
  studentGroupId: string | null;
  isPrimary: boolean;
}

// ─── Config Step ──────────────────────────────────────────

export function ConfigStep({
  configs,
  setConfigs,
}: {
  configs: TimetableConfig[];
  setConfigs: (c: TimetableConfig[]) => void;
}) {
  const [name, setName] = useState("Default");
  const [periodsPerDay, setPeriodsPerDay] = useState(8);
  const [periodDuration, setPeriodDuration] = useState(45);
  const [startTime, setStartTime] = useState("08:00");
  const [breakAfter, setBreakAfter] = useState("3");
  const [breakDuration, setBreakDuration] = useState(15);
  const [lunchAfter, setLunchAfter] = useState(4);
  const [lunchDuration, setLunchDuration] = useState(30);
  const [activeDays, setActiveDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  const [saving, setSaving] = useState(false);

  const toggleDay = (day: string) => {
    setActiveDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/management/timetable/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          periodsPerDay,
          daysPerWeek: activeDays.length,
          periodDurationMinutes: periodDuration,
          startTime,
          breakAfterPeriod: breakAfter.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n)),
          breakDurationMinutes: breakDuration,
          lunchAfterPeriod: lunchAfter,
          lunchDurationMinutes: lunchDuration,
          activeDays,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfigs([...configs, data.config]);
      }
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-amber-950 mb-3">Schedule Configuration</h3>
        <p className="text-xs text-muted-foreground mb-4">Set up your school&apos;s daily schedule structure.</p>
      </div>

      {configs.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200/60">
          <p className="text-xs font-semibold text-emerald-700">✓ {configs.length} config(s) saved</p>
          {configs.map((c) => (
            <p key={c.id} className="text-[11px] text-emerald-600 mt-0.5">
              {c.name} — {c.periodsPerDay} periods/day, {c.activeDays.length} days/week
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-[11px] font-semibold text-amber-800 block mb-1">Config Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-amber-800 block mb-1">Start Time</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-amber-800 block mb-1">Periods Per Day</label>
          <input type="number" min={1} max={12} value={periodsPerDay} onChange={(e) => setPeriodsPerDay(parseInt(e.target.value) || 8)} className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-amber-800 block mb-1">Period Duration (min)</label>
          <input type="number" min={15} max={90} value={periodDuration} onChange={(e) => setPeriodDuration(parseInt(e.target.value) || 45)} className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-amber-800 block mb-1">Break After Period(s)</label>
          <input value={breakAfter} onChange={(e) => setBreakAfter(e.target.value)} placeholder="e.g. 3,5" className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-amber-800 block mb-1">Break Duration (min)</label>
          <input type="number" min={5} max={30} value={breakDuration} onChange={(e) => setBreakDuration(parseInt(e.target.value) || 15)} className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-amber-800 block mb-1">Lunch After Period</label>
          <input type="number" min={1} max={12} value={lunchAfter} onChange={(e) => setLunchAfter(parseInt(e.target.value) || 4)} className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-amber-800 block mb-1">Lunch Duration (min)</label>
          <input type="number" min={15} max={60} value={lunchDuration} onChange={(e) => setLunchDuration(parseInt(e.target.value) || 30)} className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
      </div>

      <div>
        <label className="text-[11px] font-semibold text-amber-800 block mb-1.5">Active Days</label>
        <div className="flex gap-1.5 flex-wrap">
          {TIMETABLE_DAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                activeDays.includes(day) ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100",
              )}
            >
              {TIMETABLE_DAY_LABELS[day]}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={saveConfig} disabled={saving} className="bg-amber-600 hover:bg-amber-700 gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Config
      </Button>
    </div>
  );
}

// ─── Teachers Step ────────────────────────────────────────

export function TeachersStep({
  teachers,
  setTeachers,
}: {
  teachers: Teacher[];
  setTeachers: (t: Teacher[]) => void;
}) {
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [dept, setDept] = useState("");
  const [saving, setSaving] = useState(false);

  const addTeacher = async () => {
    if (!name.trim() || !shortCode.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/management/timetable/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), shortCode: shortCode.trim(), department: dept.trim() || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setTeachers([...teachers, data.teacher]);
        setName("");
        setShortCode("");
        setDept("");
      }
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const removeTeacher = async (id: string) => {
    try {
      const res = await fetch(`/api/management/timetable/teachers?id=${id}`, { method: "DELETE" });
      if (res.ok) setTeachers(teachers.filter((t) => t.id !== id));
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-amber-950 mb-1">Teachers</h3>
        <p className="text-xs text-muted-foreground">Add teachers who will be assigned to the timetable.</p>
      </div>

      {teachers.length > 0 && (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {teachers.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-600 text-white text-[10px] font-bold">{t.shortCode}</span>
              <span className="flex-1 text-xs font-medium text-amber-950 truncate">{t.name}</span>
              {t.department && <span className="text-[10px] text-muted-foreground">{t.department}</span>}
              <button type="button" onClick={() => removeTeacher(t.id)} className="text-red-400 hover:text-red-600 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="flex-1 min-w-[120px] rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        <input value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="Code (e.g. MR)" className="w-24 rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        <input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="Department" className="w-28 rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        <Button onClick={addTeacher} disabled={saving || !name.trim() || !shortCode.trim()} className="bg-amber-600 hover:bg-amber-700 gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>
    </div>
  );
}

// ─── Subjects Step ────────────────────────────────────────

export function SubjectsStep({
  subjects,
  setSubjects,
}: {
  subjects: Subject[];
  setSubjects: (s: Subject[]) => void;
}) {
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [periodsPerWeek, setPeriodsPerWeek] = useState(5);
  const [color, setColor] = useState<string>(DEFAULT_SUBJECT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const addSubject = async () => {
    if (!name.trim() || !shortCode.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/management/timetable/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), shortCode: shortCode.trim(), color, periodsPerWeek }),
      });
      if (res.ok) {
        const data = await res.json();
        setSubjects([...subjects, data.subject]);
        setName("");
        setShortCode("");
        setColor(DEFAULT_SUBJECT_COLORS[(subjects.length + 1) % DEFAULT_SUBJECT_COLORS.length]);
      }
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const removeSubject = async (id: string) => {
    try {
      const res = await fetch(`/api/management/timetable/subjects?id=${id}`, { method: "DELETE" });
      if (res.ok) setSubjects(subjects.filter((s) => s.id !== id));
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-amber-950 mb-1">Subjects</h3>
        <p className="text-xs text-muted-foreground">Define subjects/courses that need to be scheduled.</p>
      </div>

      {subjects.length > 0 && (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {subjects.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
              <span className="h-5 w-5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="flex h-7 items-center justify-center rounded-md px-1.5 text-[10px] font-bold text-white" style={{ backgroundColor: s.color }}>{s.shortCode}</span>
              <span className="flex-1 text-xs font-medium text-amber-950 truncate">{s.name}</span>
              <span className="text-[10px] text-muted-foreground">{s.periodsPerWeek}p/w</span>
              <button type="button" onClick={() => removeSubject(s.id)} className="text-red-400 hover:text-red-600 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-end">
        <div className="flex-1 min-w-[120px]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Subject Name" className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        <input value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="Code" className="w-20 rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        <input type="number" min={1} max={20} value={periodsPerWeek} onChange={(e) => setPeriodsPerWeek(parseInt(e.target.value) || 5)} className="w-16 rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" title="Periods/week" />
        <div className="flex gap-1">
          {DEFAULT_SUBJECT_COLORS.slice(0, 8).map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} className={cn("h-6 w-6 rounded-full transition-transform", color === c && "ring-2 ring-offset-1 ring-amber-600 scale-110")} style={{ backgroundColor: c }} />
          ))}
        </div>
        <Button onClick={addSubject} disabled={saving || !name.trim() || !shortCode.trim()} className="bg-amber-600 hover:bg-amber-700 gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>
    </div>
  );
}

// ─── Classrooms Step ──────────────────────────────────────

export function ClassroomsStep({
  classrooms,
  setClassrooms,
}: {
  classrooms: Classroom[];
  setClassrooms: (c: Classroom[]) => void;
}) {
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [capacity, setCapacity] = useState(40);
  const [roomType, setRoomType] = useState<string>("REGULAR");
  const [saving, setSaving] = useState(false);

  const addClassroom = async () => {
    if (!name.trim() || !shortCode.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/management/timetable/classrooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), shortCode: shortCode.trim(), capacity, roomType }),
      });
      if (res.ok) {
        const data = await res.json();
        setClassrooms([...classrooms, data.classroom]);
        setName("");
        setShortCode("");
      }
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const removeClassroom = async (id: string) => {
    try {
      const res = await fetch(`/api/management/timetable/classrooms?id=${id}`, { method: "DELETE" });
      if (res.ok) setClassrooms(classrooms.filter((c) => c.id !== id));
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-amber-950 mb-1">Classrooms</h3>
        <p className="text-xs text-muted-foreground">Add rooms and venues available for scheduling.</p>
      </div>

      {classrooms.length > 0 && (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {classrooms.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-600">{c.shortCode}</span>
              <span className="flex-1 text-xs font-medium text-amber-950 truncate">{c.name}</span>
              <span className="text-[10px] text-muted-foreground">{ROOM_TYPE_LABELS[c.roomType as RoomType] || c.roomType}</span>
              <span className="text-[10px] text-muted-foreground">Cap: {c.capacity}</span>
              <button type="button" onClick={() => removeClassroom(c.id)} className="text-red-400 hover:text-red-600 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Room Name" className="flex-1 min-w-[120px] rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        <input value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="Code" className="w-20 rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value) || 40)} className="w-16 rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" title="Capacity" />
        <select value={roomType} onChange={(e) => setRoomType(e.target.value)} className="rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400">
          {Object.entries(ROOM_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <Button onClick={addClassroom} disabled={saving || !name.trim() || !shortCode.trim()} className="bg-amber-600 hover:bg-amber-700 gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>
    </div>
  );
}

// ─── Student Groups Step ──────────────────────────────────

export function GroupsStep({
  groups,
  setGroups,
}: {
  groups: StudentGroup[];
  setGroups: (g: StudentGroup[]) => void;
}) {
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [strength, setStrength] = useState(30);
  const [saving, setSaving] = useState(false);

  const addGroup = async () => {
    if (!name.trim() || !shortCode.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/management/timetable/student-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), shortCode: shortCode.trim(), grade: grade.trim() || null, section: section.trim() || null, strength }),
      });
      if (res.ok) {
        const data = await res.json();
        setGroups([...groups, data.group]);
        setName("");
        setShortCode("");
        setGrade("");
        setSection("");
      }
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const removeGroup = async (id: string) => {
    try {
      const res = await fetch(`/api/management/timetable/student-groups?id=${id}`, { method: "DELETE" });
      if (res.ok) setGroups(groups.filter((g) => g.id !== id));
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-amber-950 mb-1">Student Groups</h3>
        <p className="text-xs text-muted-foreground">Define classes or sections for scheduling.</p>
      </div>

      {groups.length > 0 && (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-blue-100 text-[10px] font-bold text-blue-600">{g.shortCode}</span>
              <span className="flex-1 text-xs font-medium text-amber-950 truncate">{g.name}</span>
              {g.grade && <span className="text-[10px] text-muted-foreground">Grade {g.grade}</span>}
              {g.section && <span className="text-[10px] text-muted-foreground">Sec {g.section}</span>}
              <span className="text-[10px] text-muted-foreground">{g.strength} students</span>
              <button type="button" onClick={() => removeGroup(g.id)} className="text-red-400 hover:text-red-600 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group Name" className="flex-1 min-w-[100px] rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        <input value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="Code" className="w-20 rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade" className="w-16 rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Sec" className="w-16 rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" />
        <input type="number" min={1} value={strength} onChange={(e) => setStrength(parseInt(e.target.value) || 30)} className="w-16 rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400" title="Strength" />
        <Button onClick={addGroup} disabled={saving || !name.trim() || !shortCode.trim()} className="bg-amber-600 hover:bg-amber-700 gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>
    </div>
  );
}

// ─── Assignments Step ─────────────────────────────────────

export function AssignmentsStep({
  assignments,
  setAssignments,
  teachers,
  subjects,
  groups,
}: {
  assignments: Assignment[];
  setAssignments: (a: Assignment[]) => void;
  teachers: Teacher[];
  subjects: Subject[];
  groups: StudentGroup[];
}) {
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [saving, setSaving] = useState(false);

  const addAssignment = async () => {
    if (!teacherId || !subjectId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/management/timetable/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, subjectId, studentGroupId: groupId || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setAssignments([...assignments, data.assignment]);
        setTeacherId("");
        setSubjectId("");
        setGroupId("");
      }
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (id: string) => {
    try {
      const res = await fetch(`/api/management/timetable/assignments?id=${id}`, { method: "DELETE" });
      if (res.ok) setAssignments(assignments.filter((a) => a.id !== id));
    } catch { /* ignore */ }
  };

  const getTeacherName = (id: string) => teachers.find((t) => t.id === id)?.name || id;
  const getSubjectName = (id: string) => subjects.find((s) => s.id === id)?.name || id;
  const getGroupName = (id: string | null) => (id ? groups.find((g) => g.id === id)?.name || id : "All groups");

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-amber-950 mb-1">Teacher–Subject Assignments</h3>
        <p className="text-xs text-muted-foreground">Assign which teacher teaches which subject to which group.</p>
      </div>

      {assignments.length > 0 && (
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
              <span className="text-xs font-medium text-amber-950 truncate">
                {getTeacherName(a.teacherId)} → {getSubjectName(a.subjectId)}
              </span>
              <span className="text-[10px] text-muted-foreground">({getGroupName(a.studentGroupId)})</span>
              <span className="flex-1" />
              <button type="button" onClick={() => removeAssignment(a.id)} className="text-red-400 hover:text-red-600 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="flex-1 min-w-[120px] rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400">
          <option value="">Select Teacher</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="flex-1 min-w-[120px] rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400">
          <option value="">Select Subject</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="flex-1 min-w-[100px] rounded-lg border border-amber-200 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-400">
          <option value="">All Groups</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <Button onClick={addAssignment} disabled={saving || !teacherId || !subjectId} className="bg-amber-600 hover:bg-amber-700 gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Assign
        </Button>
      </div>
    </div>
  );
}
