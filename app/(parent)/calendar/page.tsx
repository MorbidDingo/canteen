"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  IoChevronBack,
  IoChevronForward,
  IoCalendar,
} from "react-icons/io5";
import { BottomSheet } from "@/components/ui/motion";


type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  type: "assignment" | "notice" | "holiday" | "exam" | "payment";
  postType?: string;
  category?: string;
  description?: string | null;
  noticeId?: string;
  acknowledged?: boolean;
  amount?: number;
  dueDate?: string | null;
  paymentChildren?: Array<{
    id: string;
    name: string;
    paid: boolean;
  }>;
};

const DOT_COLORS = {
  assignment: "bg-blue-500",
  notice: "bg-amber-500",
  holiday: "bg-emerald-500",
  exam: "bg-red-500",
  payment: "bg-violet-500",
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
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const monthStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}`;

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const [calendarRes, noticesRes, paymentsRes] = await Promise.all([
        fetch(`/api/content/calendar?month=${monthStr}`),
        fetch("/api/parent/notices", { cache: "no-store" }),
        fetch("/api/parent/payment-events", { cache: "no-store" }),
      ]);

      const baseEvents: CalendarEvent[] = calendarRes.ok
        ? (((await calendarRes.json()) as { events?: CalendarEvent[] }).events ?? [])
        : [];

      const noticeMap = new Map<
        string,
        { message: string; acknowledged: boolean }
      >();
      if (noticesRes.ok) {
        const noticesData = (await noticesRes.json()) as {
          notices?: Array<{
            id: string;
            message: string;
            acknowledged: boolean;
          }>;
        };
        for (const n of noticesData.notices ?? []) {
          noticeMap.set(n.id, {
            message: n.message,
            acknowledged: n.acknowledged,
          });
        }
      }

      const paymentEvents: CalendarEvent[] = [];
      if (paymentsRes.ok) {
        const paymentData = (await paymentsRes.json()) as {
          events?: Array<{
            id: string;
            title: string;
            description: string | null;
            amount: number;
            dueDate: string | null;
            createdAt: string;
            children: Array<{ id: string; name: string; paid: boolean }>;
          }>;
        };
        for (const event of paymentData.events ?? []) {
          const eventDate = event.dueDate ?? event.createdAt;
          if (!eventDate) continue;
          const d = new Date(eventDate);
          if (
            d.getFullYear() !== currentMonth.year ||
            d.getMonth() !== currentMonth.month
          ) {
            continue;
          }
          paymentEvents.push({
            id: event.id,
            title: event.title,
            date: eventDate,
            type: "payment",
            description: event.description,
            amount: event.amount,
            dueDate: event.dueDate,
            paymentChildren: event.children,
          });
        }
      }

      const enriched = baseEvents.map((event) => {
        if (event.type !== "notice" && event.type !== "exam") return event;
        const notice = noticeMap.get(event.id);
        return {
          ...event,
          description: notice?.message ?? event.description ?? null,
          noticeId: notice ? event.id : undefined,
          acknowledged: notice ? notice.acknowledged : true,
        };
      });

      setEvents([...enriched, ...paymentEvents]);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [monthStr, currentMonth.month, currentMonth.year]);

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
  };

  // Deduplicate events by ID for selected date
  const uniqueSelectedEvents = useMemo(() => {
    if (!selectedDate) return [];
    const dayEvents = eventsByDate.get(selectedDate) ?? [];
    const seen = new Set<string>();
    return dayEvents.filter((ev) => {
      if (seen.has(ev.id)) return false;
      seen.add(ev.id);
      return true;
    });
  }, [selectedDate, eventsByDate]);

  // All unique events this month for the list below
  const monthEvents = useMemo(() => {
    const seen = new Set<string>();
    const result: CalendarEvent[] = [];
    for (const ev of events) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      result.push(ev);
    }
    // Sort by date ascending
    result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return result;
  }, [events]);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 px-5 pb-24 sm:px-8">
      {/* Month header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted/40"
        >
          <IoChevronBack className="h-5 w-5" />
        </button>
        <div className="text-center">
          <h1 className="text-lg font-bold tracking-tight">
            {MONTH_NAMES[currentMonth.month]}
          </h1>
          <p className="text-[12px] text-muted-foreground tabular-nums">{currentMonth.year}</p>
        </div>
        <button
          type="button"
          onClick={() => goMonth(1)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted/40"
        >
          <IoChevronForward className="h-5 w-5" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-2xl bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {/* Day headers */}
        <div className="grid grid-cols-7">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-2.5 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells — 48x48 min tap targets */}
        <div className="grid grid-cols-7">
          {calendarDays.map(({ date, inMonth }, i) => {
            const key = toDateKey(date);
            const isToday = key === today;
            const isSelected = key === selectedDate;
            const dayEvents = eventsByDate.get(key) ?? [];

            // Collect unique dot types (max 3)
            const dotTypes = [...new Set(dayEvents.map((e) => e.type))].slice(0, 3);

            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (!inMonth) return;
                  if (dayEvents.length > 0) {
                    setSelectedDate(isSelected ? null : key);
                  }
                }}
                disabled={!inMonth}
                className={cn(
                  "relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 transition-colors",
                  !inMonth && "opacity-20",
                  inMonth && "active:bg-muted/30",
                  isSelected && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium tabular-nums",
                    isToday && !isSelected && "ring-2 ring-primary text-primary font-bold",
                    isSelected && "bg-primary text-primary-foreground font-bold",
                  )}
                >
                  {date.getDate()}
                </span>
                {/* Event dots */}
                <div className="flex h-1.5 items-center gap-0.5">
                  {dotTypes.map((type) => (
                    <span key={type} className={cn("h-1.5 w-1.5 rounded-full", DOT_COLORS[type])} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected date events — Bottom Sheet */}
      <BottomSheet
        open={!!selectedDate && uniqueSelectedEvents.length > 0}
        onClose={() => setSelectedDate(null)}
        snapPoints={[40]}
      >
        <div className="space-y-3 p-5">
          {selectedDate && (
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </p>
          )}

          {uniqueSelectedEvents.length === 0 ? (
            <div className="py-6 text-center">
              <IoCalendar className="mx-auto h-8 w-8 text-muted-foreground/20" />
              <p className="mt-2 text-[13px] text-muted-foreground">Nothing scheduled</p>
            </div>
          ) : (
            <div className="space-y-1">
              {uniqueSelectedEvents.map((ev) => (
                <button
                  key={`${ev.type}-${ev.id}`}
                  type="button"
                  onClick={() => setSelectedEvent(ev)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors active:bg-muted/30"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT_COLORS[ev.type])} />
                  <p className="min-w-0 flex-1 text-[14px] font-medium leading-tight">
                    {ev.type === "assignment"
                      ? ev.title
                      : ev.type === "holiday"
                        ? `Holiday · ${ev.title}`
                        : ev.type === "exam"
                          ? `Exam · ${ev.title}`
                          : ev.type === "payment"
                            ? `Payment · ${ev.title}`
                            : `Notice · ${ev.title}`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* This Month events list */}
      {!loading && monthEvents.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            This Month
          </p>
          <div className="space-y-2">
            {monthEvents.map((ev) => {
              const evDate = new Date(ev.date);
              const dayStr = evDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
              const innerContent = (
                <>
                  {/* Colour accent bar */}
                  <div className={cn("h-10 w-1 rounded-full shrink-0", DOT_COLORS[ev.type])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium leading-tight truncate">{ev.title}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {ev.type === "holiday"
                        ? "Holiday"
                        : ev.type === "exam"
                          ? "Exam"
                          : ev.type === "assignment"
                            ? "Due"
                            : ev.type === "payment"
                              ? "Payment"
                              : "Notice"}
                      {" · "}
                      {dayStr}
                      {ev.endDate && ev.endDate !== ev.date && (
                        <> – {new Date(ev.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</>
                      )}
                    </p>
                  </div>
                </>
              );

              return (
                <button
                  key={`${ev.type}-${ev.id}`}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl bg-card px-4 py-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors active:bg-muted/30"
                  onClick={() => setSelectedEvent(ev)}
                >
                  {innerContent}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <BottomSheet
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        snapPoints={[55]}
      >
        {selectedEvent && (
          <div className="space-y-4 p-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {selectedEvent.type === "payment"
                  ? "Payment event"
                  : selectedEvent.type === "assignment"
                    ? "Assignment"
                    : selectedEvent.type === "holiday"
                      ? "Holiday"
                      : selectedEvent.type === "exam"
                        ? "Exam"
                        : "Notice"}
              </p>
              <h3 className="mt-1 text-lg font-semibold leading-tight">{selectedEvent.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(selectedEvent.date).toLocaleString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            {selectedEvent.description && (
              <p className="rounded-xl border border-border/50 bg-card/60 p-3 text-sm text-muted-foreground">
                {selectedEvent.description}
              </p>
            )}

            {selectedEvent.type === "payment" && (
              <div className="rounded-xl border border-border/50 bg-card/60 p-3">
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="text-lg font-semibold">₹{(selectedEvent.amount ?? 0).toFixed(2)}</p>
                {selectedEvent.dueDate && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Due{" "}
                    {new Date(selectedEvent.dueDate).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
            )}

            {selectedEvent.type === "payment" &&
              selectedEvent.paymentChildren &&
              selectedEvent.paymentChildren.length > 0 && (
                <div className="space-y-2">
                  {selectedEvent.paymentChildren.map((child) => (
                    <div
                      key={child.id}
                      className="flex items-center justify-between rounded-xl border border-border/40 px-3 py-2"
                    >
                      <span className="text-sm">{child.name}</span>
                      <span
                        className={cn(
                          "text-xs font-medium",
                          child.paid ? "text-emerald-600" : "text-muted-foreground",
                        )}
                      >
                        {child.paid ? "Paid" : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              )}

            <div className="flex flex-col gap-2">
              {selectedEvent.type === "assignment" && (
                <button
                  type="button"
                  onClick={() => {
                    const id = selectedEvent.id;
                    setSelectedEvent(null);
                    router.push(`/assignments/${id}`);
                  }}
                  className="h-10 rounded-xl bg-primary text-sm font-medium text-primary-foreground"
                >
                  Open assignment
                </button>
              )}

              {(selectedEvent.type === "notice" || selectedEvent.type === "exam") &&
                selectedEvent.noticeId &&
                selectedEvent.acknowledged === false && (
                  <button
                    type="button"
                    onClick={async () => {
                      const noticeId = selectedEvent.noticeId;
                      await fetch("/api/parent/notices", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ noticeId }),
                      });
                      setEvents((prev) =>
                        prev.map((event) =>
                          event.noticeId === noticeId
                            ? { ...event, acknowledged: true }
                            : event,
                        ),
                      );
                      setSelectedEvent((prev) =>
                        prev ? { ...prev, acknowledged: true } : prev,
                      );
                    }}
                    className="h-10 rounded-xl bg-violet-600 text-sm font-medium text-white"
                  >
                    Acknowledge
                  </button>
                )}

              {selectedEvent.type === "payment" && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEvent(null);
                    router.push("/events");
                  }}
                  className="h-10 rounded-xl bg-primary text-sm font-medium text-primary-foreground"
                >
                  Open payment details
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="h-10 rounded-xl border border-border/60 bg-background text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
      {!loading && monthEvents.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
          <IoCalendar className="mx-auto h-7 w-7 text-muted-foreground/30" />
          <p className="mt-2 text-xs text-muted-foreground">No events this month</p>
        </div>
      )}
    </div>
  );
}
