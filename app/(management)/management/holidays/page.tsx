"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  RefreshCw,
  Send,
  X,
  CalendarDays,
  ChevronLeft,
  Trash2,
  Sun,
} from "lucide-react";
import Link from "next/link";

interface HolidayItem {
  id: string;
  title: string;
  startDate: string;
  endDate: string | null;
  description: string | null;
  createdAt: string;
  createdByName: string | null;
}

export default function ManagementHolidaysPage() {
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");

  const fetchHolidays = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/management/holidays", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load holidays");
      const data = (await res.json()) as { holidays: HolidayItem[] };
      setHolidays(data.holidays ?? []);
    } catch {
      toast.error("Failed to load holidays");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHolidays();
  }, [fetchHolidays]);

  const resetForm = () => {
    setTitle(""); setStartDate(""); setEndDate(""); setDescription("");
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!startDate) { toast.error("Start date is required"); return; }
    if (endDate && new Date(endDate) < new Date(startDate)) {
      toast.error("End date must be after start date");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/management/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startDate: new Date(startDate).toISOString(),
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          description: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error ?? "Failed to save holiday");
      }

      toast.success("Holiday added successfully");
      resetForm();
      setShowForm(false);
      await fetchHolidays();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save holiday");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/management/holidays?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error ?? "Failed to delete holiday");
      }
      toast.success("Holiday removed");
      setHolidays((prev) => prev.filter((h) => h.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete holiday");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDateRange = (start: string, end: string | null) => {
    const s = new Date(start);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    if (!end) return s.toLocaleDateString(undefined, opts);
    const e = new Date(end);
    if (s.toDateString() === e.toDateString()) return s.toLocaleDateString(undefined, opts);
    return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, opts)}`;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/management"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200/60 bg-white/60 text-amber-800 transition-colors hover:bg-amber-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-amber-950 flex items-center gap-2">
            <Sun className="h-5 w-5 text-emerald-600" />
            Holidays
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage school holidays and closures</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchHolidays()}
            disabled={loading}
            className="h-9 w-9 border-amber-200 hover:bg-amber-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            onClick={() => setShowForm((v) => !v)}
            className="h-9 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancel" : "Add Holiday"}
          </Button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-2xl border border-amber-200/60 bg-white/70 shadow-sm backdrop-blur p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Add Holiday
          </h2>

          <div className="space-y-1.5">
            <Label htmlFor="holiday-title" className="text-xs font-medium">Holiday Name</Label>
            <Input
              id="holiday-title"
              placeholder="e.g. Diwali Break, Summer Vacation, School Closure"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="border-amber-200/60 focus-visible:ring-emerald-500/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="holiday-start" className="text-xs font-medium">Start Date</Label>
              <Input
                id="holiday-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-amber-200/60 focus-visible:ring-emerald-500/20"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="holiday-end" className="text-xs font-medium">End Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="holiday-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="border-amber-200/60 focus-visible:ring-emerald-500/20"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="holiday-desc" className="text-xs font-medium">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="holiday-desc"
              placeholder="Additional details or reason for the holiday..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={1000}
              className="resize-none border-amber-200/60 focus-visible:ring-emerald-500/20"
            />
          </div>

          <Button
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {saving ? "Saving..." : "Add Holiday"}
          </Button>
        </div>
      )}

      {/* Holiday List */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80 px-1">
          Holiday Calendar ({holidays.length})
        </h2>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 opacity-40" />
            <p className="text-sm text-muted-foreground">Loading holidays...</p>
          </div>
        ) : holidays.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <Sun className="mx-auto h-8 w-8 text-muted-foreground/25 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No holidays added yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Add school holidays and closures to the calendar.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200/60 bg-white/70 shadow-sm backdrop-blur overflow-hidden">
            {holidays.map((holiday, idx) => (
              <div
                key={holiday.id}
                className={`px-4 py-4 flex items-start gap-3 ${idx !== holidays.length - 1 ? "border-b border-amber-100/80" : ""}`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 mt-0.5">
                  <Sun className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-semibold text-sm">{holiday.title}</p>
                  <p className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <CalendarDays className="h-3 w-3" />
                    {formatDateRange(holiday.startDate, holiday.endDate)}
                  </p>
                  {holiday.description && (
                    <p className="text-xs text-muted-foreground">{holiday.description}</p>
                  )}
                  {holiday.createdByName && (
                    <p className="text-[11px] text-muted-foreground/70">Added by {holiday.createdByName}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground/50 hover:text-destructive hover:bg-red-50"
                  onClick={() => void handleDelete(holiday.id)}
                  disabled={deletingId === holiday.id}
                >
                  {deletingId === holiday.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />
                  }
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
