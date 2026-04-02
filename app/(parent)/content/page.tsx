"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  FileText,
  Clock,
  Users,
  Loader2,
  RefreshCw,
  Filter,
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

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  PUBLISHED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  CLOSED: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
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
      if (res.ok) {
        const data = await res.json();
        setTags(data.tags);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const stats = useMemo(() => {
    const drafts = posts.filter((p) => p.status === "DRAFT").length;
    const published = posts.filter((p) => p.status === "PUBLISHED").length;
    const totalSubmissions = posts.reduce((sum, p) => sum + p.submissionCount, 0);
    return { drafts, published, totalSubmissions, total: posts.length };
  }, [posts]);

  if (hasPermission === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground/40" />
        <h2 className="mt-4 text-lg font-semibold">No Content Permission</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You don&apos;t have permission to post content. Contact your organization&apos;s management to request access.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">My Posts</h1>
          <p className="text-xs text-muted-foreground">
            Assignments & notes you&apos;ve created
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchPosts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => router.push("/content/new")} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            New Post
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      {!loading && posts.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border bg-card p-2.5 text-center">
            <p className="text-lg font-bold">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>
          <div className="rounded-lg border bg-card p-2.5 text-center">
            <p className="text-lg font-bold">{stats.published}</p>
            <p className="text-[10px] text-muted-foreground">Published</p>
          </div>
          <div className="rounded-lg border bg-card p-2.5 text-center">
            <p className="text-lg font-bold">{stats.totalSubmissions}</p>
            <p className="text-[10px] text-muted-foreground">Submissions</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
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
            <SelectTrigger className="h-8 w-[130px] text-xs">
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
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No posts yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create your first assignment or note
          </p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => router.push("/content/new")}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create Post
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <Link key={post.id} href={`/content/${post.id}/edit`}>
              <Card className="transition-colors hover:bg-muted/30">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {post.type === "ASSIGNMENT" ? (
                          <ClipboardList className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                        ) : (
                          <StickyNote className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        )}
                        <span className="truncate text-sm font-medium">
                          {post.title}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[post.status] || ""}`}
                        >
                          {post.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(post.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {post.dueAt && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Due {new Date(post.dueAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    {post.type === "ASSIGNMENT" && post.submissionCount > 0 && (
                      <div className="flex shrink-0 items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 dark:bg-blue-900/20">
                        <Users className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                        <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
                          {post.submissionCount}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
