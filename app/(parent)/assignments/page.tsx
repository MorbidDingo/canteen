"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList,
  StickyNote,
  Clock,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ChevronRight,
  User,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Film,
  Sparkles,
  MessageSquare,
  BookOpen,
} from "lucide-react";
import { PostChatSheet } from "@/components/ai/post-chat-sheet";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";

type FeedAttachment = {
  id: string;
  mimeType: string;
  size: number;
};

type FeedPost = {
  id: string;
  type: "ASSIGNMENT" | "NOTE";
  title: string;
  body: string;
  dueAt: string | null;
  status: string;
  createdAt: string;
  authorName: string;
  tags: { id: string; name: string; color: string | null }[];
  hasSubmitted: boolean;
  attachments: FeedAttachment[];
};

type Tag = { id: string; name: string; color: string | null };

export default function AssignmentsFeedPage() {
  const router = useRouter();
  const certePlusActive = useCertePlusStore((s) => s.status?.active === true);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"ASSIGNMENT" | "NOTE">("ASSIGNMENT");
  const [tagFilter, setTagFilter] = useState("all");
  const [tags, setTags] = useState<Tag[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [permissionScope, setPermissionScope] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // AI states
  const [chatPost, setChatPost] = useState<FeedPost | null>(null);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [summaryMap, setSummaryMap] = useState<Record<string, string>>({});

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: activeTab,
        page: String(page),
        limit: String(limit),
      });
      if (tagFilter !== "all") params.set("tagId", tagFilter);

      const res = await fetch(`/api/content/feed?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPosts(data.posts);
      setTotal(data.total);
      setCanCreate(data.canCreate ?? false);
      setPermissionScope(data.permissionScope ?? null);
    } catch {
      toast.error("Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, [activeTab, tagFilter, page]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch("/api/content/tags");
      if (res.ok) setTags((await res.json()).tags ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);
  useEffect(() => { fetchTags(); }, [fetchTags]);
  useEffect(() => { setPage(1); }, [activeTab, tagFilter]);

  async function handleSummarize(post: FeedPost) {
    if (summaryMap[post.id]) {
      // Toggle off
      setSummaryMap((prev) => {
        const next = { ...prev };
        delete next[post.id];
        return next;
      });
      return;
    }
    setSummarizingId(post.id);
    try {
      const res = await fetch(`/api/content/posts/${post.id}/summarize`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to summarize");
      }
      const data = await res.json();
      setSummaryMap((prev) => ({ ...prev, [post.id]: data.summary }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to summarize");
    } finally {
      setSummarizingId(null);
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  function isDueSoon(dueAt: string) {
    const diff = new Date(dueAt).getTime() - Date.now();
    return diff > 0 && diff < 48 * 60 * 60 * 1000;
  }

  function isPastDue(dueAt: string) {
    return new Date(dueAt).getTime() < Date.now();
  }

  function getAttachmentSummary(attachments: FeedAttachment[]) {
    const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
    const pdfs = attachments.filter((a) => a.mimeType === "application/pdf");
    const videos = attachments.filter((a) => a.mimeType.startsWith("video/"));
    const others = attachments.filter(
      (a) => !a.mimeType.startsWith("image/") && a.mimeType !== "application/pdf" && !a.mimeType.startsWith("video/"),
    );
    return { images, pdfs, videos, others, total: attachments.length };
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {activeTab === "ASSIGNMENT" ? "Assignments" : "Notes"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Stay up to date with your class
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchFeed} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex items-center gap-1 rounded-2xl bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("ASSIGNMENT")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
            activeTab === "ASSIGNMENT"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ClipboardList className={`h-3.5 w-3.5 ${activeTab === "ASSIGNMENT" ? "text-blue-500" : ""}`} />
          Assignments
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("NOTE")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
            activeTab === "NOTE"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <StickyNote className={`h-3.5 w-3.5 ${activeTab === "NOTE" ? "text-emerald-500" : ""}`} />
          Notes
        </button>
      </div>

      {/* Tag filter */}
      {tags.length > 0 && (
        <div className="mt-3">
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="All Tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Feed list */}
      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
              activeTab === "ASSIGNMENT"
                ? "bg-blue-50 dark:bg-blue-950/20"
                : "bg-emerald-50 dark:bg-emerald-950/20"
            }`}>
              {activeTab === "ASSIGNMENT" ? (
                <ClipboardList className="h-8 w-8 text-blue-400" />
              ) : (
                <StickyNote className="h-8 w-8 text-emerald-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">
                No {activeTab === "ASSIGNMENT" ? "assignments" : "notes"} yet
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Check back later for updates
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => {
              const summary = getAttachmentSummary(post.attachments);
              const hasSummary = !!summaryMap[post.id];
              const isSummarizing = summarizingId === post.id;

              return (
                <article
                  key={post.id}
                  className="group rounded-2xl border border-border/40 bg-card overflow-hidden transition-all hover:border-border/80 hover:shadow-sm"
                >
                  <Link href={`/assignments/${post.id}`}>
                    <div className="p-4">
                      {/* Top row */}
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          post.type === "ASSIGNMENT"
                            ? "bg-blue-50 dark:bg-blue-950/20"
                            : "bg-emerald-50 dark:bg-emerald-950/20"
                        }`}>
                          {post.type === "ASSIGNMENT" ? (
                            <ClipboardList className="h-4.5 w-4.5 text-blue-500" />
                          ) : (
                            <StickyNote className="h-4.5 w-4.5 text-emerald-500" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-semibold leading-snug line-clamp-2">
                              {post.title}
                            </h3>
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground" />
                          </div>

                          {/* Author + date */}
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span className="truncate">{post.authorName}</span>
                            <span className="text-muted-foreground/40">·</span>
                            <span>{formatDate(post.createdAt)}</span>
                          </div>

                          {/* Body preview */}
                          {post.body && (
                            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                              {post.body}
                            </p>
                          )}

                          {/* Attachment indicators */}
                          {summary.total > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {summary.images.length > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                                  <ImageIcon className="h-3 w-3" />
                                  {summary.images.length}
                                </span>
                              )}
                              {summary.pdfs.length > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                                  <FileText className="h-3 w-3" />
                                  {summary.pdfs.length} PDF{summary.pdfs.length > 1 ? "s" : ""}
                                </span>
                              )}
                              {summary.videos.length > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                                  <Film className="h-3 w-3" />
                                  {summary.videos.length}
                                </span>
                              )}
                              {summary.others.length > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                                  <Paperclip className="h-3 w-3" />
                                  {summary.others.length}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Badges */}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {post.dueAt && (
                              <Badge
                                variant="secondary"
                                className={`gap-0.5 px-1.5 py-0 text-[10px] font-medium ${
                                  isPastDue(post.dueAt)
                                    ? "bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400"
                                    : isDueSoon(post.dueAt)
                                    ? "bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400"
                                    : "bg-muted/60 text-muted-foreground"
                                }`}
                              >
                                <Clock className="h-3 w-3" />
                                {isPastDue(post.dueAt) ? "Overdue" : `Due ${formatDate(post.dueAt)}`}
                              </Badge>
                            )}
                            {post.type === "ASSIGNMENT" && (
                              <Badge
                                variant="secondary"
                                className={`gap-0.5 px-1.5 py-0 text-[10px] font-medium ${
                                  post.hasSubmitted
                                    ? "bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400"
                                    : "bg-muted/60 text-muted-foreground"
                                }`}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                {post.hasSubmitted ? "Submitted" : "Pending"}
                              </Badge>
                            )}
                            {post.tags.map((tag) => (
                              <Badge
                                key={tag.id}
                                variant="outline"
                                className="px-1.5 py-0 text-[10px] font-normal"
                                style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
                              >
                                {tag.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>

                  {/* AI Actions bar */}
                  {certePlusActive && (
                    <div className="flex items-center gap-1 border-t border-border/30 px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => handleSummarize(post)}
                        disabled={isSummarizing}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950/20 dark:hover:text-violet-400"
                      >
                        {isSummarizing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <BookOpen className="h-3 w-3" />
                        )}
                        {hasSummary ? "Hide Summary" : "Summarize"}
                      </button>
                      <div className="mx-0.5 h-3 w-px bg-border/40" />
                      <button
                        type="button"
                        onClick={() => setChatPost(post)}
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-purple-50 hover:text-purple-600 dark:hover:bg-purple-950/20 dark:hover:text-purple-400"
                      >
                        <MessageSquare className="h-3 w-3" />
                        Ask AI
                      </button>
                    </div>
                  )}

                  {/* Summary panel */}
                  {hasSummary && (
                    <div className="border-t border-border/30 bg-violet-50/50 px-4 py-3 dark:bg-violet-950/10">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Sparkles className="h-3 w-3 text-violet-500" />
                        <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                          AI Summary
                        </span>
                      </div>
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:text-foreground"
                        dangerouslySetInnerHTML={{ __html: formatMarkdown(summaryMap[post.id]) }}
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Post Chat Sheet */}
      {chatPost && (
        <PostChatSheet
          postId={chatPost.id}
          postTitle={chatPost.title}
          postType={chatPost.type}
          open={!!chatPost}
          onClose={() => setChatPost(null)}
        />
      )}
    </div>
  );
}

function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^### (.*)$/gm, '<h4 class="text-xs font-semibold mt-1.5 mb-0.5">$1</h4>')
    .replace(/^## (.*)$/gm, '<h3 class="text-xs font-semibold mt-1.5 mb-0.5">$1</h3>')
    .replace(/^# (.*)$/gm, '<h3 class="text-sm font-bold mt-1.5 mb-0.5">$1</h3>')
    .replace(/^- (.*)$/gm, '<li class="ml-3 list-disc">$1</li>')
    .replace(/^(\d+)\. (.*)$/gm, '<li class="ml-3 list-decimal">$2</li>')
    .replace(/\n/g, "<br />");
}
