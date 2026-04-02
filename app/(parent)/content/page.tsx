"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Plus,
  Clock,
  Users,
  Loader2,
  RefreshCw,
  ChevronRight,
  FileText,
  Edit3,
} from "lucide-react";

type Post = {
  id: string;
  type: "ASSIGNMENT" | "NOTE";
  title: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  submissionCount: number;
};

type Tag = {
  id: string;
  name: string;
  color: string | null;
};

const STATUS_STYLES: Record<string, { bg: string; dot: string }> = {
  DRAFT: {
    bg: "bg-amber-50 dark:bg-amber-950/20",
    dot: "bg-amber-400",
  },
  PUBLISHED: {
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    dot: "bg-emerald-400",
  },
  CLOSED: {
    bg: "bg-gray-50 dark:bg-gray-900/20",
    dot: "bg-gray-400",
  },
};

export default function MyPostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (tagFilter !== "all") params.set("tagId", tagFilter);

      const res = await fetch(`/api/content/posts?${params.toString()}`);
      if (res.status === 403) {
        setHasPermission(false);
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPosts(data.posts);
      setHasPermission(true);
    } catch {
      toast.error("Failed to load posts");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, tagFilter]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch("/api/content/tags");
      if (res.ok) setTags((await res.json()).tags ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);
  useEffect(() => { fetchTags(); }, [fetchTags]);

  const stats = useMemo(() => {
    const drafts = posts.filter((p) => p.status === "DRAFT").length;
    const published = posts.filter((p) => p.status === "PUBLISHED").length;
    const totalSubmissions = posts.reduce((sum, p) => sum + p.submissionCount, 0);
    return { drafts, published, totalSubmissions, total: posts.length };
  }, [posts]);

  if (hasPermission === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-muted/40">
          <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <h2 className="mt-4 text-base font-semibold">No Content Permission</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Contact your organization&apos;s management to request access.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My Posts</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Assignments & notes you&apos;ve created
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchPosts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            onClick={() => router.push("/content/new")}
            size="sm"
            className="h-8 gap-1.5 rounded-xl"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
      </div>

      {/* Stats */}
      {!loading && posts.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "Published", value: stats.published, color: "text-emerald-600 dark:text-emerald-400" },
            { label: "Submissions", value: stats.totalSubmissions, color: "text-blue-600 dark:text-blue-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border/40 bg-card p-3 text-center">
              <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 flex items-center gap-2">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="ASSIGNMENT">Assignments</SelectItem>
            <SelectItem value="NOTE">Notes</SelectItem>
          </SelectContent>
        </Select>
        {tags.length > 0 && (
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Posts list */}
      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40">
              <FileText className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <div>
              <p className="text-sm font-medium">No posts yet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Create your first assignment or note
              </p>
            </div>
            <Button
              size="sm"
              className="mt-2 gap-1.5 rounded-xl"
              onClick={() => router.push("/content/new")}
            >
              <Plus className="h-3.5 w-3.5" />
              Create Post
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => {
              const statusStyle = STATUS_STYLES[post.status] ?? STATUS_STYLES.CLOSED;
              return (
                <Link key={post.id} href={`/content/${post.id}/edit`}>
                  <article className="group flex items-center gap-3 rounded-2xl border border-border/40 bg-card p-3.5 transition-all hover:border-border/80 hover:shadow-sm">
                    {/* Type icon */}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
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

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">
                          {post.title}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {/* Status dot */}
                        <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0 text-[10px] font-medium ${statusStyle.bg}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                          {post.status}
                        </span>

                        <span className="text-[10px] text-muted-foreground">
                          {new Date(post.createdAt).toLocaleDateString("en-IN", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>

                        {post.dueAt && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Due {new Date(post.dueAt).toLocaleDateString("en-IN", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side: submission count + chevron */}
                    <div className="flex shrink-0 items-center gap-2">
                      {post.type === "ASSIGNMENT" && post.submissionCount > 0 && (
                        <div className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 dark:bg-blue-950/20">
                          <Users className="h-3 w-3 text-blue-500" />
                          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                            {post.submissionCount}
                          </span>
                        </div>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground" />
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
