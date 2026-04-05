"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import {
  Loader2,
  Paperclip,
  StickyNote,
  Calendar,
  Plus,
  ClipboardList,
  X,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

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

/** Group posts by relative date label */
function groupByDate(posts: FeedPost[]): { label: string; posts: FeedPost[] }[] {
  const groups: Map<string, FeedPost[]> = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const post of posts) {
    const d = new Date(post.createdAt);
    d.setHours(0, 0, 0, 0);
    let label: string;
    if (d.getTime() === today.getTime()) label = "Today";
    else if (d.getTime() === yesterday.getTime()) label = "Yesterday";
    else label = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(post);
  }

  return Array.from(groups, ([label, posts]) => ({ label, posts }));
}

export default function AssignmentsFeedPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const urlType = searchParams.get("type") === "NOTE" ? "NOTE" : "ASSIGNMENT";
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"ASSIGNMENT" | "NOTE">(urlType);
  const [tagFilter, setTagFilter] = useState("all");
  const [tags, setTags] = useState<Tag[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [permissionScope, setPermissionScope] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [tagSheetOpen, setTagSheetOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const limit = 20;

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
  useEffect(() => { setActiveTab(urlType); }, [urlType]);

  // Sort: user's own posts first, then by date
  const userName = session?.user?.name ?? "";
  const sortedPosts = useMemo(() => [...posts].sort((a, b) => {
    const aOwn = a.authorName === userName ? 0 : 1;
    const bOwn = b.authorName === userName ? 0 : 1;
    if (aOwn !== bOwn) return aOwn - bOwn;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }), [posts, userName]);

  const grouped = useMemo(() => groupByDate(sortedPosts), [sortedPosts]);
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 px-5 pt-2 pb-32 sm:px-8">

      {/* Tab pills */}
      <div className="flex items-center gap-2 pt-3">
        {(["ASSIGNMENT", "NOTE"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "h-8 rounded-full px-4 text-[13px] font-medium transition-colors",
              activeTab === tab
                ? "bg-foreground text-background"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/60",
            )}
          >
            {tab === "ASSIGNMENT" ? "Assignments" : "Notes"}
          </button>
        ))}

        {/* Filter ghost button — only if tags exist */}
        {tags.length > 0 && (
          <button
            type="button"
            onClick={() => setTagSheetOpen(true)}
            className={cn(
              "ml-auto h-8 rounded-full px-3 text-[13px] font-medium transition-colors",
              tagFilter !== "all" ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Filter{tagFilter !== "all" ? " ·" : ""}
          </button>
        )}

        {/* Calendar shortcut */}
        <Link
          href="/calendar"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/40",
            tags.length === 0 && "ml-auto",
          )}
        >
          <Calendar className="h-4 w-4" />
        </Link>
      </div>

      {/* Feed list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sortedPosts.length === 0 ? (
        <div className="py-16 text-center">
          <StickyNote className="mx-auto h-10 w-10 text-muted-foreground/20" />
          <p className="mt-3 text-[15px] text-muted-foreground">
            No {activeTab === "ASSIGNMENT" ? "assignments" : "notes"} yet
          </p>
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateMenuOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Create {activeTab === "ASSIGNMENT" ? "Assignment" : "Note"}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.label} className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {group.label}
              </p>

              <div className="flex flex-col gap-3">
                {group.posts.map((post) => (
                  <Link key={post.id} href={`/assignments/${post.id}`} className="block">
                    <div className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors active:bg-muted/30">
                      {/* Title */}
                      <p className="line-clamp-2 text-[16px] font-semibold leading-snug">{post.title}</p>

                      {/* Body preview */}
                      {post.body && (
                        <p className="mt-1 line-clamp-1 text-[13px] text-muted-foreground">{post.body}</p>
                      )}

                      {/* Meta line */}
                      <div className="mt-1.5 flex items-center gap-1 text-[12px]">
                        {post.dueAt && (
                          <>
                            <span className={cn(
                              "font-medium",
                              isPastDue(post.dueAt) ? "text-destructive" : isDueSoon(post.dueAt) ? "text-primary" : "text-muted-foreground",
                            )}>
                              {isPastDue(post.dueAt) ? "Overdue" : `Due ${formatDate(post.dueAt)}`}
                            </span>
                            <span className="text-muted-foreground/40">·</span>
                          </>
                        )}
                        {post.attachments.length > 0 && (
                          <>
                            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                              <Paperclip className="h-3 w-3" />
                              {post.attachments.length}
                            </span>
                            <span className="text-muted-foreground/40">·</span>
                          </>
                        )}
                        <span className="text-muted-foreground">{post.authorName}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}

          {/* Pagination — ghost text links */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-2">
              {page > 1 && (
                <button
                  type="button"
                  className="text-[13px] font-medium text-primary"
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Previous
                </button>
              )}
              <span className="text-[12px] tabular-nums text-muted-foreground">{page}/{totalPages}</span>
              {page < totalPages && (
                <button
                  type="button"
                  className="text-[13px] font-medium text-primary"
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tag filter bottom sheet */}
      <BottomSheet open={tagSheetOpen} onClose={() => setTagSheetOpen(false)} snapPoints={[35]}>
        <div className="space-y-4 p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Filter by tag</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setTagFilter("all"); setTagSheetOpen(false); }}
              className={cn(
                "h-8 rounded-full px-3 text-[13px] font-medium transition-colors",
                tagFilter === "all" ? "bg-foreground text-background" : "bg-muted/40 text-muted-foreground",
              )}
            >
              All
            </button>
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTagFilter(t.id); setTagSheetOpen(false); }}
                className={cn(
                  "h-8 rounded-full px-3 text-[13px] font-medium transition-colors",
                  tagFilter === t.id ? "bg-foreground text-background" : "bg-muted/40 text-muted-foreground",
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </BottomSheet>

      {/* Create post bottom sheet — only shown when both types are permitted */}
      <BottomSheet open={createMenuOpen} onClose={() => setCreateMenuOpen(false)} snapPoints={[30]}>
        <div className="space-y-3 p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Create new</p>
          <div className="space-y-2">
            {(permissionScope === "BOTH" || permissionScope === "ASSIGNMENT") && (
              <button
                type="button"
                onClick={() => {
                  setCreateMenuOpen(false);
                  router.push("/content/new?type=ASSIGNMENT");
                }}
                className="flex w-full items-center gap-3 rounded-2xl bg-muted/30 px-4 py-3.5 text-left transition-colors active:bg-muted/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <ClipboardList className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">New Assignment</p>
                  <p className="text-[12px] text-muted-foreground">Create a task with a due date</p>
                </div>
              </button>
            )}
            {(permissionScope === "BOTH" || permissionScope === "NOTE") && (
              <button
                type="button"
                onClick={() => {
                  setCreateMenuOpen(false);
                  router.push("/content/new?type=NOTE");
                }}
                className="flex w-full items-center gap-3 rounded-2xl bg-muted/30 px-4 py-3.5 text-left transition-colors active:bg-muted/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                  <StickyNote className="h-5 w-5 text-orange-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">New Note</p>
                  <p className="text-[12px] text-muted-foreground">Share an announcement or info</p>
                </div>
              </button>
            )}
          </div>
        </div>
      </BottomSheet>

      {/* Floating create button */}
      {canCreate && !createMenuOpen && (
        <button
          type="button"
          onClick={() => {
            // If only one type is permitted, navigate directly without showing the menu
            if (permissionScope === "ASSIGNMENT") {
              router.push("/content/new?type=ASSIGNMENT");
            } else if (permissionScope === "NOTE") {
              router.push("/content/new?type=NOTE");
            } else {
              setCreateMenuOpen(true);
            }
          }}
          className="fixed bottom-28 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-all active:scale-95 hover:bg-primary/90"
          aria-label="Create post"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
