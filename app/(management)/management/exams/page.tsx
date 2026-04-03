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
  Pencil,
  Trash2,
  BookOpen,
} from "lucide-react";
import Link from "next/link";

type TargetType = "ALL_PARENTS" | "ALL_GENERAL" | "ALL_USERS" | "SPECIFIC_CLASS" | "SPECIFIC_USERS";

interface ExamSubject {
  subject: string;
  date: string;
  startTime?: string;
  endTime?: string;
}

interface ExamNotice {
  id: string;
  title: string;
  message: string;
  category: string;
  targetType: TargetType;
  targetClass: string | null;
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
  ALL_GENERAL: "All General Accounts",
  ALL_USERS: "All Parents & General",
  SPECIFIC_CLASS: "Specific Class",
  SPECIFIC_USERS: "Specific Users",
};

function parseExamSubjects(raw: string | null): ExamSubject[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDateShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ManagementExamsPage() {
  const [exams, setExams] = useState<ExamNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [examStartDate, setExamStartDate] = useState("");
  const [examEndDate, setExamEndDate] = useState("");
  const [subjects, setSubjects] = useState<ExamSubject[]>([]);
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

  useEffect(() => { void fetchExams(); }, [fetchExams]);

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
    setTitle(""); setMessage(""); setExamStartDate(""); setExamEndDate("");
    setSubjects([]); setTargetType("ALL_PARENTS"); setTargetClass("");
    setTargetUserIds([]); setUserSearchQuery(""); setUserSearchResults([]);
    setEditingId(null);
  };

  const addSubject = () => {
    setSubjects((prev) => [...prev, { subject: "", date: "", startTime: "", endTime: "" }]);
  };

  const updateSubject = (index: number, field: keyof ExamSubject, value: string) => {
    setSubjects((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const removeSubject = (index: number) => {
    setSubjects((prev) => prev.filter((_, i) => i !== index));
  };

  const openEditForm = (exam: ExamNotice) => {
    setEditingId(exam.id);
    setTitle(exam.title);
    setMessage(exam.message);
    setExamStartDate(exam.examStartDate ? new Date(exam.examStartDate).toISOString().slice(0, 10) : "");
    setExamEndDate(exam.examEndDate ? new Date(exam.examEndDate).toISOString().slice(0, 10) : "");
    setSubjects(parseExamSubjects(exam.examSubjects));
    setTargetType(exam.targetType);
    setTargetClass(exam.targetClass ?? "");
    setShowForm(true);
  };

  const handleSend = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!message.trim()) { toast.error("Message is required"); return; }
    if (!editingId && targetType === "SPECIFIC_CLASS" && !targetClass.trim()) { toast.error("Class name is required"); return; }
    if (!editingId && targetType === "SPECIFIC_USERS" && targetUserIds.length === 0) { toast.error("Please select at least one user"); return; }

    const validSubjects = subjects.filter((s) => s.subject.trim() && s.date);

    setSending(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/management/notices/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            message: message.trim(),
            examStartDate: examStartDate ? new Date(examStartDate).toISOString() : null,
            examEndDate: examEndDate ? new Date(examEndDate).toISOString() : null,
            examSubjects: validSubjects.length > 0 ? validSubjects : null,
          }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error: string };
          throw new Error(err.error ?? "Failed to update exam");
        }
        toast.success("Exam updated successfully");
      } else {
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
            eventDate: examStartDate ? new Date(examStartDate).toISOString() : undefined,
            examStartDate: examStartDate ? new Date(examStartDate).toISOString() : undefined,
            examEndDate: examEndDate ? new Date(examEndDate).toISOString() : undefined,
            examSubjects: validSubjects.length > 0 ? validSubjects : undefined,
          }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error: string };
          throw new Error(err.error ?? "Failed to send exam notice");
        }
        toast.success("Exam notice sent successfully");
      }

      resetForm();
      setShowForm(false);
      await fetchExams();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save exam");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/management" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200/60 bg-white/60 text-amber-800 transition-colors hover:bg-amber-50">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-amber-950 flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-indigo-600" />
            Exams
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Schedule exams with subject-wise timetables</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => void fetchExams()} disabled={loading} className="h-9 w-9 border-amber-200 hover:bg-amber-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => { if (showForm) { resetForm(); setShowForm(false); } else setShowForm(true); }} className="h-9 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4">
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancel" : "New Exam"}
          </Button>
        </div>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div className="rounded-2xl border border-amber-200/60 bg-white/70 shadow-sm backdrop-blur p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <Send className="h-4 w-4" />
            {editingId ? "Edit Exam" : "Schedule Exam"}
          </h2>

          <div className="space-y-1.5">
            <Label htmlFor="exam-title" className="text-xs font-medium">Exam Name</Label>
            <Input id="exam-title" placeholder="e.g. Mid-Term Examination, Final Year Exam" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="border-amber-200/60 focus-visible:ring-indigo-500/20" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exam-start" className="text-xs font-medium">Start Date</Label>
              <Input id="exam-start" type="date" value={examStartDate} onChange={(e) => setExamStartDate(e.target.value)} className="border-amber-200/60 focus-visible:ring-indigo-500/20" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exam-end" className="text-xs font-medium">End Date</Label>
              <Input id="exam-end" type="date" value={examEndDate} onChange={(e) => setExamEndDate(e.target.value)} className="border-amber-200/60 focus-visible:ring-indigo-500/20" />
            </div>
          </div>

          {/* Subject Schedule */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
                Subject Schedule
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addSubject} className="h-7 gap-1 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                <Plus className="h-3 w-3" />
                Add Subject
              </Button>
            </div>
            {subjects.length === 0 && (
              <p className="text-[11px] text-muted-foreground/60 py-1">Add subject-wise exam dates below</p>
            )}
            {subjects.map((subj, idx) => (
              <div key={idx} className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input placeholder="Subject name (e.g. Mathematics)" value={subj.subject} onChange={(e) => updateSubject(idx, "subject", e.target.value)} className="flex-1 h-8 text-sm border-indigo-200/60" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeSubject(idx)} className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input type="date" value={subj.date} onChange={(e) => updateSubject(idx, "date", e.target.value)} className="h-8 text-xs border-indigo-200/60" />
                  <Input type="time" placeholder="Start" value={subj.startTime ?? ""} onChange={(e) => updateSubject(idx, "startTime", e.target.value)} className="h-8 text-xs border-indigo-200/60" />
                  <Input type="time" placeholder="End" value={subj.endTime ?? ""} onChange={(e) => updateSubject(idx, "endTime", e.target.value)} className="h-8 text-xs border-indigo-200/60" />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exam-message" className="text-xs font-medium">Details / Instructions</Label>
            <Textarea id="exam-message" placeholder="Exam syllabus, instructions, venue details..." value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={5000} className="resize-none border-amber-200/60 focus-visible:ring-indigo-500/20" />
            <p className="text-[11px] text-muted-foreground text-right">{message.length}/5000</p>
          </div>

          {!editingId && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Notify</Label>
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
                  <Label htmlFor="exam-class" className="text-xs font-medium">Class</Label>
                  <Input id="exam-class" placeholder="e.g. 5A, Grade 3" value={targetClass} onChange={(e) => setTargetClass(e.target.value)} className="border-amber-200/60" />
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
                        <button key={u.id} type="button" onClick={() => toggleUser(u)} className={`w-full text-left flex items-center justify-between px-3 py-2 text-sm transition-colors ${targetUserIds.includes(u.id) ? "bg-indigo-50 text-indigo-900" : "hover:bg-muted/40"}`}>
                          <div>
                            <p className="font-medium">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                          {targetUserIds.includes(u.id) && <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                  {targetUserIds.length > 0 && <p className="text-xs text-indigo-700 font-medium">{targetUserIds.length} user{targetUserIds.length > 1 ? "s" : ""} selected</p>}
                </div>
              )}
            </>
          )}

          <Button onClick={() => void handleSend()} disabled={sending} className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Saving..." : editingId ? "Save Changes" : "Send Exam Notice"}
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
          <div className="space-y-3">
            {exams.map((exam) => {
              const examSubjects = parseExamSubjects(exam.examSubjects);
              return (
                <div key={exam.id} className="rounded-2xl border border-amber-200/60 bg-white/70 shadow-sm backdrop-blur overflow-hidden">
                  <div className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 mt-0.5">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-sm">{exam.title}</p>
                          <Badge variant="outline" className="text-[10px] border-indigo-200 text-indigo-700 bg-indigo-50">
                            {TARGET_TYPE_LABELS[exam.targetType] ?? exam.targetType}
                            {exam.targetType === "SPECIFIC_CLASS" && exam.targetClass ? `: ${exam.targetClass}` : ""}
                          </Badge>
                        </div>

                        {(exam.examStartDate || exam.examEndDate) && (
                          <p className="flex items-center gap-1 text-xs font-medium text-indigo-700">
                            <CalendarDays className="h-3 w-3" />
                            {exam.examStartDate ? formatDateShort(exam.examStartDate) : ""}
                            {exam.examStartDate && exam.examEndDate ? " — " : ""}
                            {exam.examEndDate ? formatDateShort(exam.examEndDate) : ""}
                          </p>
                        )}

                        {!exam.examStartDate && !exam.examEndDate && exam.eventDate && (
                          <p className="flex items-center gap-1 text-xs font-medium text-indigo-700">
                            <CalendarDays className="h-3 w-3" />
                            {new Date(exam.eventDate).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}

                        {examSubjects.length > 0 && (
                          <div className="mt-2 space-y-1">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />
                              Subject Schedule
                            </p>
                            <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 divide-y divide-indigo-100">
                              {examSubjects.map((subj, idx) => (
                                <div key={idx} className="flex items-center justify-between px-3 py-1.5 text-xs">
                                  <span className="font-medium text-indigo-900">{subj.subject}</span>
                                  <span className="text-indigo-600">
                                    {subj.date ? new Date(subj.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                                    {subj.startTime ? ` · ${subj.startTime}` : ""}
                                    {subj.endTime ? `–${subj.endTime}` : ""}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
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
                          <button type="button" onClick={() => openEditForm(exam)} className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
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
