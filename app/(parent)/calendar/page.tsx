"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  IoChevronBack,
  IoChevronForward,
  IoDocumentText,
  IoMegaphone,
  IoSunny,
  IoCalendar,
  IoSchool,
} from "react-icons/io5";


type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  type: "assignment" | "notice" | "holiday" | "exam";
  postType?: string;
};

const EVENT_COLORS = {
  assignment: { dot: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-800" },
  notice: { dot: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800" },
  holiday: { dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-800" },
  exam: { dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-300", border: "border-red-200 dark:border-red-800" },
} as const;

const EVENT_ICONS = {
  assignment: IoDocumentText,
  notice: IoMegaphone,
  holiday: IoSunny,
  exam: IoSchool,
} as const;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(() => toDateKey(new Date()));

  const monthStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}`;

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/content/calendar?month=${monthStr}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [monthStr]);

  useEffect(() => { void fetchEvents(); }, [fetchEvents]);

  // Build event map by date key
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const d = new Date(ev.date);
      const key = toDateKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);

      // For multi-day holidays, add to each day
      if (ev.type === "holiday" && ev.endDate) {
        const end = new Date(ev.endDate);
        const cursor = new Date(d);
        cursor.setDate(cursor.getDate() + 1);
        while (cursor <= end) {
          const k = toDateKey(cursor);
          if (!map.has(k)) map.set(k, []);
          map.get(k)!.push(ev);
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }
    return map;
  }, [events]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentMonth.year, currentMonth.month, 1);
    const lastDay = new Date(currentMonth.year, currentMonth.month + 1, 0);
    const startOffset = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days: { date: Date; inMonth: boolean }[] = [];

    // Previous month padding
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = new Date(currentMonth.year, currentMonth.month, -i);
      days.push({ date: d, inMonth: false });
    }
    // Current month
    for (let i = 1; i <= totalDays; i++) {
      days.push({ date: new Date(currentMonth.year, currentMonth.month, i), inMonth: true });
    }
    // Next month padding (fill to 42 if more than 35, else 35)
    const targetLen = days.length > 35 ? 42 : 35;
    let nextDay = 1;
    while (days.length < targetLen) {
      days.push({ date: new Date(currentMonth.year, currentMonth.month + 1, nextDay++), inMonth: false });
    }

    return days;
  }, [currentMonth]);

  const today = toDateKey(new Date());

  const goMonth = (delta: number) => {
    setCurrentMonth((prev) => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      return { year: y, month: m };
    });
    setSelectedDate(null);
  };

  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : [];

  // Deduplicate events by ID (multi-day holidays)
  const uniqueSelectedEvents = useMemo(() => {
    const seen = new Set<string>();
    return selectedEvents.filter((ev) => {
      if (seen.has(ev.id)) return false;
      seen.add(ev.id);
      return true;
    });
  }, [selectedEvents]);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-3 pb-28 pt-4">
      {/* Month header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => goMonth(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted"
        >
          <IoChevronBack className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-bold tracking-tight">
            {MONTH_NAMES[currentMonth.month]}
          </h1>
          <p className="text-xs text-muted-foreground tabular-nums">{currentMonth.year}</p>
        </div>
        <button
          onClick={() => goMonth(1)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted"
        >
          <IoChevronForward className="h-5 w-5" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-border/40 bg-muted/30">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {calendarDays.map(({ date, inMonth }, i) => {
            const key = toDateKey(date);
            const isToday = key === today;
            const isSelected = key === selectedDate;
            const dayEvents = eventsByDate.get(key) ?? [];
            const hasAssignment = dayEvents.some((e) => e.type === "assignment");
            const hasNotice = dayEvents.some((e) => e.type === "notice");
            const hasHoliday = dayEvents.some((e) => e.type === "holiday");
            const hasExam = dayEvents.some((e) => e.type === "exam");

            return (
              <button
                key={i}
                onClick={() => inMonth && setSelectedDate(isSelected ? null : key)}
                disabled={!inMonth}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 py-2 transition-colors",
                  !inMonth && "opacity-25",
                  inMonth && "active:bg-muted/50",
                  isSelected && "bg-primary/8 dark:bg-primary/12",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-medium tabular-nums",
                    isToday && !isSelected && "bg-primary text-primary-foreground font-bold",
                    isSelected && "bg-primary text-primary-foreground font-bold ring-2 ring-primary/30",
                  )}
                >
                  {date.getDate()}
                </span>
                {/* Event dots */}
                <div className="flex h-1.5 items-center gap-0.5">
                  {hasAssignment && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                  {hasExam && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                  {hasNotice && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                  {hasHoliday && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          Assignments
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          Exams
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Notices
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Holidays
        </div>
      </div>

      {/* Selected date events */}
      {selectedDate && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}
          </h2>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : uniqueSelectedEvents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 py-8 text-muted-foreground">
              <IoCalendar className="h-8 w-8 opacity-40" />
              <p className="text-sm">Nothing scheduled</p>
            </div>
          ) : (
            <div className="space-y-2">
              {uniqueSelectedEvents.map((ev) => {
                const colors = EVENT_COLORS[ev.type];
                const Icon = EVENT_ICONS[ev.type];
                return (
                  <div
                    key={ev.id}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border px-3.5 py-3",
                      colors.bg,
                      colors.border,
                    )}
                  >
                    <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", colors.bg)}>
                      <Icon className={cn("h-4 w-4", colors.text)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-semibold leading-snug", colors.text)}>
                        {ev.title}
                      </p>
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                        {ev.type === "assignment" && ev.postType
                          ? ev.postType.toLowerCase()
                          : ev.type}
                        {ev.type === "assignment" && (
                          <span className="ml-1.5 text-muted-foreground/70">
                            Due {new Date(ev.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {ev.type === "holiday" && ev.endDate && (
                          <span className="ml-1.5 text-muted-foreground/70">
                            until {new Date(ev.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
