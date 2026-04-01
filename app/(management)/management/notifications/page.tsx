"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  Plus,
  Loader2,
  RefreshCw,
  Users,
  GraduationCap,
  Search,
  CheckCircle2,
  Clock,
  Send,
  X,
} from "lucide-react";

type TargetType = "ALL_PARENTS" | "ALL_GENERAL" | "ALL_USERS" | "SPECIFIC_CLASS" | "SPECIFIC_USERS";

interface NoticeItem {
  id: string;
  title: string;
  message: string;
  targetType: TargetType;
  targetClass: string | null;
  targetUserIds: string | null;
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
  role: string;
}

const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  ALL_PARENTS: "All Parents",
  ALL_GENERAL: "All General Accounts",
  ALL_USERS: "All Parents & General",
  SPECIFIC_CLASS: "Specific Class",
  SPECIFIC_USERS: "Specific Users (Search)",
};

export default function ManagementNotificationsPage() {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("ALL_PARENTS");
  const [targetClass, setTargetClass] = useState("");
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<UserSearchResult[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

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

  useEffect(() => {
    void fetchNotices();
  }, [fetchNotices]);

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) {
      setUserSearchResults([]);
      return;
    }
    setSearchingUsers(true);
    try {
      const res = await fetch(`/api/management/parents?q=${encodeURIComponent(q)}&limit=10`);
      if (!res.ok) return;
      const data = (await res.json()) as { parents: Array<{ id: string; name: string; email: string }> };
      setUserSearchResults(
        (data.parents ?? []).map((p) => ({ id: p.id, name: p.name, email: p.email, role: "PARENT" })),
      );
    } finally {
      setSearchingUsers(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (targetType === "SPECIFIC_USERS") {
        void searchUsers(userSearchQuery);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [userSearchQuery, targetType, searchUsers]);

  const toggleUser = (user: UserSearchResult) => {
    setTargetUserIds((prev) =>
      prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id],
    );
  };

  const resetForm = () => {
    setTitle("");
    setMessage("");
    setTargetType("ALL_PARENTS");
    setTargetClass("");
    setTargetUserIds([]);
    setUserSearchQuery("");
    setUserSearchResults([]);
  };

  const handleSend = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!message.trim()) {
      toast.error("Message is required");
      return;
    }
    if (targetType === "SPECIFIC_CLASS" && !targetClass.trim()) {
      toast.error("Class name is required");
      return;
    }
    if (targetType === "SPECIFIC_USERS" && targetUserIds.length === 0) {
      toast.error("Please select at least one user");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/management/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          targetType,
          targetClass: targetType === "SPECIFIC_CLASS" ? targetClass.trim() : undefined,
          targetUserIds: targetType === "SPECIFIC_USERS" ? targetUserIds : undefined,
        }),
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

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-amber-900">
            <Bell className="h-6 w-6" />
            Notifications & Notices
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Send custom notices and reminders to parents, general users, or specific groups.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchNotices()}
            disabled={loading}
            className="border-amber-200 hover:bg-amber-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            onClick={() => setShowForm((v) => !v)}
            className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancel" : "New Notice"}
          </Button>
        </div>
      </div>

      {/* Create Notice Form */}
      {showForm && (
        <Card className="border-amber-200 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <Send className="h-4 w-4" />
              Compose Notice
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g. Holiday Reminder, School Closure Notice"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Write your notice or reminder here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={5000}
                className="resize-none"
              />
              <p className="text-[11px] text-muted-foreground text-right">{message.length}/5000</p>
            </div>

            <div className="space-y-1.5">
              <Label>Target Audience</Label>
              <Select value={targetType} onValueChange={(v) => setTargetType(v as TargetType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TARGET_TYPE_LABELS) as TargetType[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {TARGET_TYPE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {targetType === "SPECIFIC_CLASS" && (
              <div className="space-y-1.5">
                <Label htmlFor="class">Class Name</Label>
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    id="class"
                    placeholder="e.g. 5A, Grade 3, Standard 7"
                    value={targetClass}
                    onChange={(e) => setTargetClass(e.target.value)}
                  />
                </div>
              </div>
            )}

            {targetType === "SPECIFIC_USERS" && (
              <div className="space-y-2">
                <Label>Search & Select Users</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {searchingUsers && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                  </p>
                )}
                {userSearchResults.length > 0 && (
                  <div className="rounded-xl border border-border/60 divide-y divide-border/40 overflow-hidden">
                    {userSearchResults.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUser(u)}
                        className={`w-full text-left flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                          targetUserIds.includes(u.id)
                            ? "bg-amber-50 text-amber-900"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        <div>
                          <p className="font-medium">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                        {targetUserIds.includes(u.id) && (
                          <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {targetUserIds.length > 0 && (
                  <p className="text-xs text-amber-700 font-medium">
                    {targetUserIds.length} user{targetUserIds.length > 1 ? "s" : ""} selected
                  </p>
                )}
              </div>
            )}

            <Button
              onClick={() => void handleSend()}
              disabled={sending}
              className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? "Sending..." : "Send Notice"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sent Notices List */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-amber-900 uppercase tracking-wide">
          Sent Notices ({notices.length})
        </h2>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2 opacity-40" />
            Loading notices...
          </div>
        ) : notices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <Bell className="mx-auto h-6 w-6 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No notices sent yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Create a notice above to notify specific users.
            </p>
          </div>
        ) : (
          notices.map((n) => (
            <Card key={n.id} className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sm leading-tight">{n.title}</p>
                      <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-700 bg-amber-50">
                        {TARGET_TYPE_LABELS[n.targetType] ?? n.targetType}
                        {n.targetType === "SPECIFIC_CLASS" && n.targetClass ? `: ${n.targetClass}` : ""}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(n.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {n.createdByName && ` · by ${n.createdByName}`}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        {n.ackCount} / {n.totalTargetCount > 0 ? n.totalTargetCount : "?"} acknowledged
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
