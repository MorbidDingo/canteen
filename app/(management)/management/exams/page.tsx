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
  GraduationCap,
  Plus,
  Loader2,
  RefreshCw,
  Clock,
  Send,
  X,
  CalendarDays,
  ChevronLeft,
  Users,
  Search,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

type TargetType = "ALL_PARENTS" | "ALL_GENERAL" | "ALL_USERS" | "SPECIFIC_CLASS" | "SPECIFIC_USERS";

interface ExamNotice {
  id: string;
  title: string;
  message: string;
  category: string;
  targetType: TargetType;
  targetClass: string | null;
  eventDate: string | null;
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
  ALL_GENERAL: "All General Accounts",
  ALL_USERS: "All Parents & General",
  SPECIFIC_CLASS: "Specific Class",
  SPECIFIC_USERS: "Specific Users",
};

export default function ManagementExamsPage() {
  const [exams, setExams] = useState<ExamNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("ALL_PARENTS");
  const [targetClass, setTargetClass] = useState("");
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<UserSearchResult[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/management/notices?category=EXAM", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load exams");
      const data = (await res.json()) as { notices: ExamNotice[] };
      setExams(data.notices ?? []);
    } catch {
      toast.error("Failed to load exam notices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchExams();
  }, [fetchExams]);

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

  const toggleUser = (user: UserSearchResult) => {
    setTargetUserIds((prev) =>
      prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id],
    );
  };

  const resetForm = () => {
    setTitle(""); setMessage(""); setEventDate("");
    setTargetType("ALL_PARENTS"); setTargetClass("");
    setTargetUserIds([]); setUserSearchQuery(""); setUserSearchResults([]);
  };

  const handleSend = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!message.trim()) { toast.error("Message is required"); return; }
    if (!eventDate) { toast.error("Exam date is required"); return; }
    if (targetType === "SPECIFIC_CLASS" && !targetClass.trim()) { toast.error("Class name is required"); return; }
    if (targetType === "SPECIFIC_USERS" && targetUserIds.length === 0) { toast.error("Please select at least one user"); return; }

    setSending(true);
    try {
      const res = await fetch("/api/management/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          category: "EXAM",
          targetType,
          targetClass: targetType === "SPECIFIC_CLASS" ? targetClass.trim() : undefined,
          targetUserIds: targetType === "SPECIFIC_USERS" ? targetUserIds : undefined,
          eventDate: eventDate ? new Date(eventDate).toISOString() : undefined,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error ?? "Failed to send exam notice");
      }

      toast.success("Exam notice sent successfully");
      resetForm();
      setShowForm(false);
      await fetchExams();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send notice");
    } finally {
      setSending(false);
    }
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
            <GraduationCap className="h-5 w-5 text-indigo-600" />
            Exams
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Schedule and notify about upcoming exams</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchExams()}
            disabled={loading}
            className="h-9 w-9 border-amber-200 hover:bg-amber-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            onClick={() => setShowForm((v) => !v)}
            className="h-9 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancel" : "New Exam"}
          </Button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="rounded-2xl border border-amber-200/60 bg-white/70 shadow-sm backdrop-blur p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <Send className="h-4 w-4" />
            Schedule Exam Notice
          </h2>

          <div className="space-y-1.5">
            <Label htmlFor="exam-title" className="text-xs font-medium">Exam Title</Label>
            <Input
              id="exam-title"
              placeholder="e.g. Mathematics Mid-Term Exam, Science Unit Test"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="border-amber-200/60 focus-visible:ring-indigo-500/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exam-date" className="text-xs font-medium">Exam Date & Time</Label>
            <Input
              id="exam-date"
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="border-amber-200/60 focus-visible:ring-indigo-500/20"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exam-message" className="text-xs font-medium">Details / Instructions</Label>
            <Textarea
              id="exam-message"
              placeholder="Exam syllabus, instructions, venue details, what to bring..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={5000}
              className="resize-none border-amber-200/60 focus-visible:ring-indigo-500/20"
            />
            <p className="text-[11px] text-muted-foreground text-right">{message.length}/5000</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notify</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as TargetType)}>
              <SelectTrigger className="border-amber-200/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TARGET_TYPE_LABELS) as TargetType[]).map((key) => (
                  <SelectItem key={key} value={key}>{TARGET_TYPE_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {targetType === "SPECIFIC_CLASS" && (
            <div className="space-y-1.5">
              <Label htmlFor="exam-class" className="text-xs font-medium">Class</Label>
              <Input
                id="exam-class"
                placeholder="e.g. 5A, Grade 3, Standard 7"
                value={targetClass}
                onChange={(e) => setTargetClass(e.target.value)}
                className="border-amber-200/60"
              />
            </div>
          )}

          {targetType === "SPECIFIC_USERS" && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Search Users</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="pl-9 border-amber-200/60"
                />
              </div>
              {searchingUsers && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Searching...</p>}
              {userSearchResults.length > 0 && (
                <div className="rounded-xl border border-border/60 divide-y overflow-hidden">
                  {userSearchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUser(u)}
                      className={`w-full text-left flex items-center justify-between px-3 py-2 text-sm transition-colors ${targetUserIds.includes(u.id) ? "bg-indigo-50 text-indigo-900" : "hover:bg-muted/40"}`}
                    >
                      <div>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      {targetUserIds.includes(u.id) && <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
              {targetUserIds.length > 0 && (
                <p className="text-xs text-indigo-700 font-medium">{targetUserIds.length} user{targetUserIds.length > 1 ? "s" : ""} selected</p>
              )}
            </div>
          )}

          <Button
            onClick={() => void handleSend()}
            disabled={sending}
            className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending..." : "Send Exam Notice"}
          </Button>
        </div>
      )}

      {/* Exam List */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80 px-1">
          Scheduled Exams ({exams.length})
        </h2>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 opacity-40" />
            <p className="text-sm text-muted-foreground">Loading exams...</p>
          </div>
        ) : exams.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <GraduationCap className="mx-auto h-8 w-8 text-muted-foreground/25 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No exam notices yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Schedule an exam to notify students and parents.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200/60 bg-white/70 shadow-sm backdrop-blur overflow-hidden">
            {exams.map((exam, idx) => (
              <div
                key={exam.id}
                className={`px-4 py-4 ${idx !== exams.length - 1 ? "border-b border-amber-100/80" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 mt-0.5">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sm">{exam.title}</p>
                      <Badge variant="outline" className="text-[10px] border-indigo-200 text-indigo-700 bg-indigo-50">
                        {TARGET_TYPE_LABELS[exam.targetType] ?? exam.targetType}
                        {exam.targetType === "SPECIFIC_CLASS" && exam.targetClass ? `: ${exam.targetClass}` : ""}
                      </Badge>
                    </div>
                    {exam.eventDate && (
                      <p className="flex items-center gap-1 text-xs font-medium text-indigo-700">
                        <CalendarDays className="h-3 w-3" />
                        {new Date(exam.eventDate).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground line-clamp-2">{exam.message}</p>
                    <div className="flex flex-wrap items-center gap-3 pt-0.5">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(exam.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        {exam.createdByName && ` · by ${exam.createdByName}`}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {exam.ackCount} / {exam.totalTargetCount > 0 ? exam.totalTargetCount : "?"} acknowledged
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
