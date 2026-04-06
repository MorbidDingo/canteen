"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  TIMETABLE_DAY_LABELS,
  type TimetableDay,
} from "@/lib/constants";
import { Loader2, Filter, Clock } from "lucide-react";

// ─── Types ────────────────────────────────────────────────

interface ViewSlot {
  id: string;
  day: string;
  period: number;
  teacher: { name: string; shortCode: string } | null;
  subject: { name: string; shortCode: string; color: string } | null;
  classroom: { name: string; shortCode: string } | null;
  studentGroup: { name: string; shortCode: string } | null;
}

interface FilterOption {
  id: string;
  name: string;
  shortCode: string;
}

// ─── Desktop-Only Timetable View ──────────────────────────

export default function TimetableViewPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timetableName, setTimetableName] = useState("");
  const [slots, setSlots] = useState<ViewSlot[]>([]);
  const [activeDays, setActiveDays] = useState<string[]>([]);
  const [periodsPerDay, setPeriodsPerDay] = useState(8);
  const [filterType, setFilterType] = useState("");
  const [filterId, setFilterId] = useState("");
  const [teacherFilters, setTeacherFilters] = useState<FilterOption[]>([]);
  const [groupFilters, setGroupFilters] = useState<FilterOption[]>([]);
  const [classroomFilters, setClassroomFilters] = useState<FilterOption[]>([]);

  const fetchTimetable = useCallback(async (ft?: string, fid?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (ft && fid) {
        params.set("filterType", ft);
        params.set("filterId", fid);
      }
      const res = await fetch(`/api/timetable/view?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to load timetable");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setTimetableName(data.timetable?.name || "Timetable");
      setSlots(data.slots || []);
      setActiveDays(data.config?.activeDays || []);
      setPeriodsPerDay(data.config?.periodsPerDay || 8);
      if (data.filters) {
        setTeacherFilters(data.filters.teachers || []);
        setGroupFilters(data.filters.groups || []);
        setClassroomFilters(data.filters.classrooms || []);
      }
    } catch {
      setError("Failed to load timetable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTimetable();
  }, [fetchTimetable]);

  const applyFilter = (type: string, id: string) => {
    setFilterType(type);
    setFilterId(id);
    fetchTimetable(type, id);
  };

  const clearFilter = () => {
    setFilterType("");
    setFilterId("");
    fetchTimetable();
  };

  const getSlot = (day: string, period: number) =>
    slots.filter((s) => s.day === day && s.period === period);

  if (!session?.user) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/5 via-background to-background px-5 py-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/60 mb-0.5">School Schedule</p>
        <h1 className="text-2xl font-bold tracking-tight">{timetableName}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          View your class schedule. Desktop view only.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-muted bg-muted/30 p-8 text-center">
          <Clock className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-semibold">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">
            The school has not published a timetable yet. Please check back later.
          </p>
        </div>
      ) : (
        <>
          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Filter className="h-3.5 w-3.5" /> Filter:
            </div>
            <button
              type="button"
              onClick={clearFilter}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                !filterType ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              All
            </button>
            {teacherFilters.length > 0 && (
              <select
                value={filterType === "teacher" ? filterId : ""}
                onChange={(e) => e.target.value ? applyFilter("teacher", e.target.value) : clearFilter()}
                className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium outline-none"
              >
                <option value="">By Teacher</option>
                {teacherFilters.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {groupFilters.length > 0 && (
              <select
                value={filterType === "group" ? filterId : ""}
                onChange={(e) => e.target.value ? applyFilter("group", e.target.value) : clearFilter()}
                className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium outline-none"
              >
                <option value="">By Class</option>
                {groupFilters.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            {classroomFilters.length > 0 && (
              <select
                value={filterType === "room" ? filterId : ""}
                onChange={(e) => e.target.value ? applyFilter("room", e.target.value) : clearFilter()}
                className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium outline-none"
              >
                <option value="">By Room</option>
                {classroomFilters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {/* Grid - Desktop Only */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border/40 bg-background shadow-sm">
            <table className="w-full min-w-[700px] border-collapse text-xs">
              <thead>
                <tr className="bg-muted/40">
                  <th className="border-b border-r border-border/30 px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-16">
                    Period
                  </th>
                  {activeDays.map((day) => (
                    <th key={day} className="border-b border-r border-border/30 px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {TIMETABLE_DAY_LABELS[day as TimetableDay] || day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: periodsPerDay }, (_, i) => i + 1).map((period) => (
                  <tr key={period} className="hover:bg-muted/20 transition-colors">
                    <td className="border-b border-r border-border/30 px-3 py-2 text-center font-semibold text-foreground/70">
                      P{period}
                    </td>
                    {activeDays.map((day) => {
                      const cellSlots = getSlot(day, period);
                      return (
                        <td key={`${day}-${period}`} className="border-b border-r border-border/30 p-1 align-top">
                          {cellSlots.length > 0 ? (
                            cellSlots.map((slot) => (
                              <div
                                key={slot.id}
                                className="rounded-lg px-2 py-1.5 mb-0.5"
                                style={{
                                  backgroundColor: slot.subject?.color ? `${slot.subject.color}18` : "#f5f5f5",
                                  borderLeft: `3px solid ${slot.subject?.color || "#ccc"}`,
                                }}
                              >
                                <div className="font-semibold text-[11px] truncate" style={{ color: slot.subject?.color || "#333" }}>
                                  {slot.subject?.shortCode || slot.subject?.name || "—"}
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
                            <div className="h-12 flex items-center justify-center text-muted-foreground/20 text-[10px]">—</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: message to use desktop */}
          <div className="md:hidden rounded-2xl border border-border/40 bg-muted/30 p-8 text-center">
            <Clock className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-semibold">Desktop View Only</p>
            <p className="text-xs text-muted-foreground mt-1">
              Please use a desktop or laptop to view the full timetable grid.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
