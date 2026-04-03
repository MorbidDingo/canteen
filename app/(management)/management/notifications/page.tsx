"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Bell,
  Megaphone,
  GraduationCap,
  TreePalm,
  Plus,
  Loader2,
  RefreshCw,
  Users,
  Search,
  CheckCircle2,
  Clock,
  Send,
  X,
  ChevronLeft,
  CalendarDays,
  Filter,
} from "lucide-react";
import Link from "next/link";

type TargetType = "ALL_PARENTS" | "ALL_GENERAL" | "ALL_USERS" | "SPECIFIC_CLASS" | "SPECIFIC_USERS";
type NoticeCategory = "GENERAL" | "EXAM" | "EVENT" | "HOLIDAY_ANNOUNCEMENT";

interface NoticeItem {
  id: string;
  title: string;
  message: string;
  category: string;
  targetType: TargetType;
  targetClass: string | null;
  targetUserIds: string | null;
  eventDate: string | null;
  examStartDate: string | null;
  examEndDate: string | null;
  examSubjects: string | null;
  expiresAt: string | null;
  createdAt: string;
  createdByName: string | null;
  ackCount: number;
  totalTargetCount: number;
}

interface UserSearchResult {
  id: string;
  name: string;
  email: string;
}

const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  ALL_PARENTS: "All Parents",
  ALL_GENERAL: "All General",
  ALL_USERS: "Everyone",
  SPECIFIC_CLASS: "Specific Class",
  SPECIFIC_USERS: "Specific Users",
};

const CATEGORY_META: Record<NoticeCategory, { label: string; icon: typeof Bell; color: string; bg: string; border: string }> = {
  GENERAL: { label: "General", icon: Megaphone, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  EXAM: { label: "Exam", icon: GraduationCap, color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200" },
  EVENT: { label: "Event", icon: CalendarDays, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  HOLIDAY_ANNOUNCEMENT: { label: "Holiday", icon: TreePalm, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
};

export default function ManagementNotificationsPage() {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<NoticeCategory>("GENERAL");
  const [eventDate, setEventDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("ALL_PARENTS");
  const [targetClass, setTargetClass] = useState("");
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<UserSearchResult[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  // Exam-specific
  const [examStartDate, setExamStartDate] = useState("");
  const [examEndDate, setExamEndDate] = useState("");

  // Holiday-specific
  const [holidayStartDate, setHolidayStartDate] = useState("");
  const [holidayEndDate, setHolidayEndDate] = useState("");

  const fetchNotices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/management/notices", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load notices");
      const data = (await res.json()) as { notices: NoticeItem[] };
      setNotices(data.notices ?? []);
    } catch {
      toast.error("Failed to load notices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchNotices(); }, [fetchNotices]);

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) { setUserSearchResults([]); return; }
    setSearchingUsers(true);
    try {
      const res = await fetch(`/api/management/parents?q=${encodeURIComponent(q)}&limit=10`);
      if (!res.ok) return;
      const data = (await res.json()) as { parents: Array<{ id: string; name: string; email: string }> };
      setUserSearchResults(data.parents ?? []);
    } finally {
      setSearchingUsers(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (targetType === "SPECIFIC_USERS") void searchUsers(userSearchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [userSearchQuery, targetType, searchUsers]);

  const toggleUser = (u: UserSearchResult) => {
    setTargetUserIds((prev) =>
      prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id],
    );
  };

  const resetForm = () => {
    setTitle(""); setMessage(""); setCategory("GENERAL"); setEventDate("");
    setExpiresAt(""); setTargetType("ALL_PARENTS"); setTargetClass("");
    setTargetUserIds([]); setUserSearchQuery(""); setUserSearchResults([]);
    setExamStartDate(""); setExamEndDate(""); setHolidayStartDate(""); setHolidayEndDate("");
  };

  const handleSend = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!message.trim()) { toast.error("Message is required"); return; }
    if (targetType === "SPECIFIC_CLASS" && !targetClass.trim()) { toast.error("Class name is required"); return; }
    if (targetType === "SPECIFIC_USERS" && targetUserIds.length === 0) { toast.error("Please select at least one user"); return; }

    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        message: message.trim(),
        category,
        targetType,
        targetClass: targetType === "SPECIFIC_CLASS" ? targetClass.trim() : undefined,
        targetUserIds: targetType === "SPECIFIC_USERS" ? targetUserIds : undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      };

      // Category-specific fields
      if (category === "EXAM") {
        if (examStartDate) payload.examStartDate = new Date(examStartDate).toISOString();
        if (examEndDate) payload.examEndDate = new Date(examEndDate).toISOString();
        if (examStartDate) payload.eventDate = new Date(examStartDate).toISOString();
      } else if (category === "HOLIDAY_ANNOUNCEMENT") {
        if (holidayStartDate) payload.eventDate = new Date(holidayStartDate).toISOString();
        if (holidayEndDate) payload.expiresAt = new Date(holidayEndDate).toISOString();
      } else {
        if (eventDate) payload.eventDate = new Date(eventDate).toISOString();
      }

      const res = await fetch("/api/management/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error ?? "Failed to send notice");
      }

      toast.success("Notice sent successfully");
      resetForm();
      setShowForm(false);
      await fetchNotices();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send notice");
    } finally {
      setSending(false);
    }
  };

  const filteredNotices = filterCategory === "all"
    ? notices
    : notices.filter((n) => n.category === filterCategory);

  const getCategoryMeta = (cat: string) => CATEGORY_META[cat as NoticeCategory] ?? CATEGORY_META.GENERAL;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/management" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200/60 bg-white/60 text-amber-800 transition-colors hover:bg-amber-50">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-amber-950 flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-600" />
            Notices
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Send notices for exams, events, holidays & more</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => void fetchNotices()} disabled={loading} className="h-9 w-9 border-amber-200 hover:bg-amber-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => { if (showForm) { resetForm(); setShowForm(false); } else setShowForm(true); }} className="h-9 gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm px-4">
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancel" : "New Notice"}
          </Button>
        </div>
      </div>

      {/* Compose Form */}
      {showForm && (
        <div className="rounded-2xl border border-amber-200/60 bg-white/70 shadow-sm backdrop-blur p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <Send className="h-4 w-4" />
            Compose Notice
          </h2>

          {/* Category Selector — pill style */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Type</Label>
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(CATEGORY_META) as NoticeCategory[]).map((cat) => {
                const meta = CATEGORY_META[cat];
                const Icon = meta.icon;
                const isActive = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium border transition-all ${
                      isActive
                        ? `${meta.bg} ${meta.color} ${meta.border} shadow-sm`
                        : "border-border/40 bg-card text-muted-foreground hover:border-border"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notice-title" className="text-xs font-medium">Title</Label>
            <Input
              id="notice-title"
              placeholder={
                category === "EXAM" ? "e.g. Mid-Term Examination Schedule" :
                category === "HOLIDAY_ANNOUNCEMENT" ? "e.g. Diwali Holiday — School Closed" :
                category === "EVENT" ? "e.g. Annual Day Celebration" :
                "e.g. Important Notice"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="border-amber-200/60 focus-visible:ring-amber-500/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notice-message" className="text-xs font-medium">Message</Label>
            <Textarea
              id="notice-message"
              placeholder={
                category === "EXAM" ? "Exam details, instructions, venue, syllabus..." :
                category === "HOLIDAY_ANNOUNCEMENT" ? "Holiday details, when school resumes..." :
                "Write your notice here..."
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={5000}
              className="resize-none border-amber-200/60 focus-visible:ring-amber-500/20"
            />
            <p className="text-[11px] text-muted-foreground text-right">{message.length}/5000</p>
          </div>

          {/* Category-specific date fields */}
          {category === "GENERAL" && (
            <div className="space-y-1.5">
              <Label htmlFor="event-date" className="text-xs font-medium">Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="event-date" type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="border-amber-200/60" />
            </div>
          )}

          {category === "EVENT" && (
            <div className="space-y-1.5">
              <Label htmlFor="event-date" className="text-xs font-medium">Event Date & Time</Label>
              <Input id="event-date" type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="border-amber-200/60" />
            </div>
          )}

          {category === "EXAM" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="exam-start" className="text-xs font-medium">Exam Start</Label>
                <Input id="exam-start" type="date" value={examStartDate} onChange={(e) => setExamStartDate(e.target.value)} className="border-amber-200/60" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exam-end" className="text-xs font-medium">Exam End</Label>
                <Input id="exam-end" type="date" value={examEndDate} onChange={(e) => setExamEndDate(e.target.value)} className="border-amber-200/60" />
              </div>
            </div>
          )}

          {category === "HOLIDAY_ANNOUNCEMENT" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="holiday-start" className="text-xs font-medium">From</Label>
                <Input id="holiday-start" type="date" value={holidayStartDate} onChange={(e) => setHolidayStartDate(e.target.value)} className="border-amber-200/60" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="holiday-end" className="text-xs font-medium">To <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input id="holiday-end" type="date" value={holidayEndDate} onChange={(e) => setHolidayEndDate(e.target.value)} className="border-amber-200/60" />
              </div>
            </div>
          )}

          {(category === "GENERAL" || category === "EVENT") && (
            <div className="space-y-1.5">
              <Label htmlFor="expires-at" className="text-xs font-medium">Expires <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="expires-at" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="border-amber-200/60" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Audience</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as TargetType)}>
              <SelectTrigger className="border-amber-200/60"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TARGET_TYPE_LABELS) as TargetType[]).map((key) => (
                  <SelectItem key={key} value={key}>{TARGET_TYPE_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {targetType === "SPECIFIC_CLASS" && (
            <div className="space-y-1.5">
              <Label htmlFor="class" className="text-xs font-medium">Class</Label>
              <Input id="class" placeholder="e.g. 5A, Grade 3" value={targetClass} onChange={(e) => setTargetClass(e.target.value)} className="border-amber-200/60" />
            </div>
          )}

          {targetType === "SPECIFIC_USERS" && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Search Users</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by name or email..." value={userSearchQuery} onChange={(e) => setUserSearchQuery(e.target.value)} className="pl-9 border-amber-200/60" />
              </div>
              {searchingUsers && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Searching...</p>}
              {userSearchResults.length > 0 && (
                <div className="rounded-xl border border-border/60 divide-y overflow-hidden">
                  {userSearchResults.map((u) => (
                    <button key={u.id} type="button" onClick={() => toggleUser(u)} className={`w-full text-left flex items-center justify-between px-3 py-2 text-sm transition-colors ${targetUserIds.includes(u.id) ? "bg-amber-50 text-amber-900" : "hover:bg-muted/40"}`}>
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      {targetUserIds.includes(u.id) && <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
              {targetUserIds.length > 0 && <p className="text-xs text-amber-700 font-medium">{targetUserIds.length} user{targetUserIds.length > 1 ? "s" : ""} selected</p>}
            </div>
          )}

          <Button onClick={() => void handleSend()} disabled={sending} className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending..." : "Send Notice"}
          </Button>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground/60" />
        <button
          type="button"
          onClick={() => setFilterCategory("all")}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${filterCategory === "all" ? "bg-amber-100 text-amber-800 shadow-sm" : "text-muted-foreground hover:bg-muted/40"}`}
        >
          All ({notices.length})
        </button>
        {(Object.keys(CATEGORY_META) as NoticeCategory[]).map((cat) => {
          const catCount = notices.filter((n) => n.category === cat).length;
          if (catCount === 0) return null;
          const meta = CATEGORY_META[cat];
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${filterCategory === cat ? `${meta.bg} ${meta.color} shadow-sm` : "text-muted-foreground hover:bg-muted/40"}`}
            >
              {meta.label} ({catCount})
            </button>
          );
        })}
      </div>

      {/* Notices List */}
      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 opacity-40" />
            <p className="text-sm text-muted-foreground">Loading notices...</p>
          </div>
        ) : filteredNotices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <Bell className="mx-auto h-8 w-8 text-muted-foreground/25 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No notices found</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Send a notice to notify parents and users.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredNotices.map((n) => {
              const meta = getCategoryMeta(n.category);
              const Icon = meta.icon;
              return (
                <div key={n.id} className="rounded-2xl border border-amber-200/60 bg-white/70 shadow-sm backdrop-blur overflow-hidden">
                  <div className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.bg} ${meta.color} mt-0.5`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-sm">{n.title}</p>
                          <Badge variant="outline" className={`text-[10px] ${meta.border} ${meta.color} ${meta.bg}`}>
                            {meta.label}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700 bg-amber-50/50">
                            {TARGET_TYPE_LABELS[n.targetType] ?? n.targetType}
                            {n.targetType === "SPECIFIC_CLASS" && n.targetClass ? `: ${n.targetClass}` : ""}
                          </Badge>
                        </div>

                        {n.eventDate && (
                          <p className="flex items-center gap-1 text-xs font-medium text-indigo-700">
                            <CalendarDays className="h-3 w-3" />
                            {new Date(n.eventDate).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        )}

                        <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>

                        <div className="flex flex-wrap items-center gap-3 pt-0.5">
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            {n.createdByName && ` · by ${n.createdByName}`}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {n.ackCount} / {n.totalTargetCount > 0 ? n.totalTargetCount : "?"} seen
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
