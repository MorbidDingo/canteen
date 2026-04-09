"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  FolderOpen,
  Folder,
  ChevronRight,
  FileEdit,
  Search,
  Send,
  Trash2,
  Pencil,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

type FeedAttachment = {
  id: string;
  originalFileName: string | null;
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
  authorUserId: string;
  authorName: string;
  tags: { id: string; name: string; color: string | null }[];
  hasSubmitted: boolean;
  attachments: FeedAttachment[];
};

type FolderItem = {
  id: string;
  name: string;
  description: string | null;
  authorName: string;
  postCount: number;
  createdAt: string;
};

type Tag = { id: string; name: string; color: string | null };

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function isDueSoon(dueAt: string) {
  const diff = new Date(dueAt).getTime() - Date.now();
  return diff > 0 && diff < 48 * 60 * 60 * 1000;
}

function isPastDue(dueAt: string) {
  return new Date(dueAt).getTime() < Date.now();
}

/** Truncate a string to a max length, adding ellipsis if needed */
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

type StatusFilter = "all" | "published" | "overdue" | "due-soon";
type AuthorFilter = "all" | "mine" | "others";
type DateFilterMode = "all" | "day" | "month" | "year";

/** Strip HTML tags from a string for use in plain-text previews */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Group posts by relative date label */
function groupByDate(
  posts: FeedPost[],
): { label: string; posts: FeedPost[] }[] {
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
    else
      label = d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
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
  const [drafts, setDrafts] = useState<FeedPost[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [authorFilter, setAuthorFilter] = useState<AuthorFilter>("all");
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("all");
  const [dateFilterValue, setDateFilterValue] = useState("");
  const [busyDraftId, setBusyDraftId] = useState<string | null>(null);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const limit = 20;
  const activeTabRef = useRef(activeTab);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const triggerHaptic = useCallback(() => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(12);
    }
  }, []);

  const handleTabSwitch = useCallback((tab: "ASSIGNMENT" | "NOTE") => {
    if (activeTabRef.current === tab) return;
    triggerHaptic();
    setActiveTab(tab);
  }, [triggerHaptic]);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: activeTab,
        page: String(page),
        limit: String(limit),
      });
      if (tagFilter !== "all") params.set("tagId", tagFilter);

      const [feedRes, foldersRes] = await Promise.all([
        fetch(`/api/content/feed?${params}`),
        fetch("/api/content/folders"),
      ]);
      if (feedRes.ok) {
        const data = await feedRes.json();
        setPosts(data.posts);
        setDrafts(data.drafts ?? []);
        setTotal(data.total);
        setCanCreate(data.canCreate ?? false);
        setPermissionScope(data.permissionScope ?? null);
      } else {
        throw new Error();
      }
      if (foldersRes.ok) {
        const data = await foldersRes.json();
        setFolders(data.folders ?? []);
      }
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
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);
  useEffect(() => {
    fetchTags();
  }, [fetchTags]);
  useEffect(() => {
    setPage(1);
  }, [activeTab, tagFilter]);
  useEffect(() => {
    setActiveTab(urlType);
  }, [urlType]);

  /* ── Draft actions ── */
  const handlePublishDraft = useCallback(
    async (draftId: string) => {
      setBusyDraftId(draftId);
      try {
        const res = await fetch(`/api/content/posts/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PUBLISHED" }),
        });
        if (!res.ok) throw new Error("Failed to publish");
        toast.success("Published successfully");
        fetchFeed();
      } catch {
        toast.error("Failed to publish draft");
      } finally {
        setBusyDraftId(null);
      }
    },
    [fetchFeed],
  );

  const handleDiscardDraft = useCallback(
    async (draftId: string) => {
      if (!confirm("Discard this draft? This cannot be undone.")) return;
      setBusyDraftId(draftId);
      try {
        const res = await fetch(`/api/content/posts/${draftId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete");
        toast.success("Draft discarded");
        fetchFeed();
      } catch {
        toast.error("Failed to discard draft");
      } finally {
        setBusyDraftId(null);
      }
    },
    [fetchFeed],
  );

  const handleDeletePost = useCallback(
    async (postId: string) => {
      if (!confirm("Delete this post? This cannot be undone.")) return;
      setBusyPostId(postId);
      try {
        const res = await fetch(`/api/content/posts/${postId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete");
        toast.success("Post deleted");
        fetchFeed();
      } catch {
        toast.error("Failed to delete post");
      } finally {
        setBusyPostId(null);
      }
    },
    [fetchFeed],
  );

  // Sort: user's own posts first, then by date
  const userName = session?.user?.name ?? "";
  const userId = session?.user?.id ?? "";
  const sortedPosts = useMemo(
    () =>
      [...posts].sort((a, b) => {
        const aOwn = a.authorName === userName ? 0 : 1;
        const bOwn = b.authorName === userName ? 0 : 1;
        if (aOwn !== bOwn) return aOwn - bOwn;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }),
    [posts, userName],
  );

  const grouped = useMemo(() => groupByDate(sortedPosts), [sortedPosts]);

  // Client-side filtering
  const filteredPosts = useMemo(() => {
    return sortedPosts.filter((post) => {
      // Search filter
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const titleMatch = post.title.toLowerCase().includes(q);
        const bodyMatch = stripHtml(post.body).toLowerCase().includes(q);
        if (!titleMatch && !bodyMatch) return false;
      }
      // Status filter
      if (statusFilter === "overdue" && !(post.dueAt && isPastDue(post.dueAt))) return false;
      if (statusFilter === "due-soon" && !(post.dueAt && isDueSoon(post.dueAt))) return false;
      if (statusFilter === "published" && post.status !== "PUBLISHED") return false;
      // Author filter
      if (authorFilter === "mine" && post.authorName !== userName) return false;
      if (authorFilter === "others" && post.authorName === userName) return false;
      // Date filter (created date)
      if (dateFilterMode !== "all" && dateFilterValue) {
        const postDate = new Date(post.createdAt);
        if (dateFilterMode === "day") {
          const value = new Date(`${dateFilterValue}T00:00:00`);
          if (
            postDate.getFullYear() !== value.getFullYear() ||
            postDate.getMonth() !== value.getMonth() ||
            postDate.getDate() !== value.getDate()
          ) {
            return false;
          }
        } else if (dateFilterMode === "month") {
          const [rawYear, rawMonth] = dateFilterValue.split("-");
          const year = Number(rawYear);
          const month = Number(rawMonth);
          if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
            return false;
          }
          if (
            postDate.getFullYear() !== year ||
            postDate.getMonth() !== month - 1
          ) {
            return false;
          }
        } else if (dateFilterMode === "year") {
          if (postDate.getFullYear() !== Number(dateFilterValue)) return false;
        }
      }
      return true;
    });
  }, [sortedPosts, searchQuery, statusFilter, authorFilter, dateFilterMode, dateFilterValue, userName]);

  const filteredGrouped = useMemo(() => groupByDate(filteredPosts), [filteredPosts]);

  const hasActiveFilters =
    statusFilter !== "all" ||
    authorFilter !== "all" ||
    tagFilter !== "all" ||
    dateFilterMode !== "all";
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6 px-5 pt-2 pb-32 sm:px-8">
      {/* Tab pills */}
      <div className="flex items-center gap-2 pt-3">
        {(["ASSIGNMENT", "NOTE"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabSwitch(tab)}
            className={cn(
              "min-h-11 min-w-11 rounded-full px-4 text-[15px] font-semibold transition-colors",
              activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            {tab === "ASSIGNMENT" ? "Assignments" : "Notes"}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setTagSheetOpen(true)}
          className={cn(
            "ml-auto h-8 rounded-full px-3 text-[14px] font-medium transition-colors",
            hasActiveFilters
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Filter{hasActiveFilters ? " ·" : ""}
        </button>

        {/* Calendar shortcut */}
        <Link
          href="/calendar"
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/40",
          )}
        >
          <Calendar className="h-4 w-4" />
        </Link>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
        <input
          type="text"
          placeholder={activeTab === "ASSIGNMENT" ? "Search assignments…" : "Search notes…"}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-11 w-full rounded-xl border border-border/30 bg-muted/20 pl-9 pr-9 text-[16px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted/50"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Feed list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sortedPosts.length === 0 &&
        folders.length === 0 &&
        drafts.length === 0 &&
        !searchQuery &&
        !hasActiveFilters ? (
        <div className="py-16 text-center">
          <StickyNote className="mx-auto h-10 w-10 text-muted-foreground/20" />
          <p className="mt-3 text-[15px] text-muted-foreground">
            No {activeTab === "ASSIGNMENT" ? "assignments" : "notes"} yet
          </p>
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateMenuOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[14px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Create {activeTab === "ASSIGNMENT" ? "Assignment" : "Note"}
            </button>
          )}
        </div>
      ) : filteredPosts.length === 0 &&
        folders.length === 0 &&
        drafts.length === 0 ? (
        <div className="py-16 text-center">
          <Search className="mx-auto h-10 w-10 text-muted-foreground/20" />
          <p className="mt-3 text-[15px] text-muted-foreground">
            No matching results
          </p>
          {(searchQuery || hasActiveFilters) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
                setAuthorFilter("all");
                setTagFilter("all");
                setDateFilterMode("all");
                setDateFilterValue("");
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-muted/40 px-4 py-2 text-[14px] font-medium text-muted-foreground transition-colors hover:bg-muted/60"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Drafts section */}
          {drafts.length > 0 && (
            <section className="space-y-2">
              <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Your Drafts
              </p>
              <div className="flex flex-col gap-2">
                {drafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="rounded-2xl border border-dashed border-border/50 bg-card/60 p-4 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <Link href={`/assignments/${draft.id}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 mt-0.5">
                        <FileEdit className="h-4 w-4 text-amber-500" />
                      </Link>
                      <Link href={`/assignments/${draft.id}`} className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[15px] font-semibold leading-snug truncate">
                            {draft.title || "Untitled"}
                          </p>
                          <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                            Draft
                          </span>
                        </div>
                        {draft.body && (
                          <p className="mt-0.5 line-clamp-1 text-[14px] text-muted-foreground">
                            {stripHtml(draft.body)}
                          </p>
                        )}
                        <p className="mt-1 text-[13px] text-muted-foreground/60">
                          {draft.type === "ASSIGNMENT"
                            ? "Assignment"
                            : "Note"}{" "}
                          · Last edited {formatDate(draft.createdAt)}
                        </p>
                      </Link>
                      {/* Draft action buttons */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => router.push(`/content/${draft.id}/edit`)}
                          disabled={busyDraftId === draft.id}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-40"
                          aria-label="Edit draft"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePublishDraft(draft.id)}
                          disabled={busyDraftId === draft.id}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                          aria-label="Publish draft"
                        >
                          {busyDraftId === draft.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDiscardDraft(draft.id)}
                          disabled={busyDraftId === draft.id}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-destructive/60 hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
                          aria-label="Discard draft"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Folders section */}
          {folders.length > 0 && (
            <section className="space-y-2">
              <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Folders
              </p>
              <div className="flex flex-col gap-2">
                {folders.map((folder) => (
                  <Link
                    key={folder.id}
                    href={`/assignments/folder/${folder.id}`}
                    className="block"
                  >
                    <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors active:bg-muted/30">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                        <Folder className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold leading-snug">
                          {folder.name}
                        </p>
                        <p className="mt-0.5 text-[14px] text-muted-foreground">
                          {folder.postCount} item
                          {folder.postCount !== 1 ? "s" : ""} ·{" "}
                          {folder.authorName}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Posts section */}
          {filteredGrouped.map((group) => (
            <section key={group.label} className="space-y-2">
              <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {group.label}
              </p>

              <div className="flex flex-col gap-3">
                {group.posts.map((post) => {
                  const isOwnPost = post.authorUserId === userId;
                  return (
                    <div
                      key={post.id}
                      className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors active:bg-muted/30"
                    >
                      <Link href={`/assignments/${post.id}`} className="block">
                      {/* Title */}
                      <p className="line-clamp-2 text-[16px] font-semibold leading-snug">
                        {post.title}
                      </p>

                      {/* Body preview */}
                      {post.body && (
                        <p className="mt-1 line-clamp-1 text-[14px] text-muted-foreground">
                          {stripHtml(post.body)}
                        </p>
                      )}

                      {/* Meta line */}
                      <div className="mt-1.5 flex items-center gap-1 text-[14px]">
                        {post.dueAt && (
                          <>
                            <span
                              className={cn(
                                "font-medium",
                                isPastDue(post.dueAt)
                                  ? "text-destructive"
                                  : isDueSoon(post.dueAt)
                                    ? "text-primary"
                                    : "text-muted-foreground",
                              )}
                            >
                              {isPastDue(post.dueAt)
                                ? "Overdue"
                                : `Due ${formatDate(post.dueAt)}`}
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
                            {post.attachments.slice(0, 2).map((att) =>
                              att.originalFileName ? (
                                <span
                                  key={att.id}
                                  className="text-muted-foreground/70 truncate max-w-[120px]"
                                  title={att.originalFileName}
                                >
                                  {truncate(att.originalFileName, 20)}
                                </span>
                              ) : null,
                            )}
                            {post.attachments.length > 2 && (
                              <span className="text-muted-foreground/50">+{post.attachments.length - 2}</span>
                            )}
                            <span className="text-muted-foreground/40">·</span>
                          </>
                        )}
                        <span className="text-muted-foreground">
                          {post.authorName}
                        </span>
                      </div>
                      </Link>
                      {isOwnPost && (
                        <div className="mt-2 flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => router.push(`/content/${post.id}/edit`)}
                            disabled={busyPostId === post.id}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-40"
                            aria-label="Edit post"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePost(post.id)}
                            disabled={busyPostId === post.id}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
                            aria-label="Delete post"
                          >
                            {busyPostId === post.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* Pagination — ghost text links */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-2">
              {page > 1 && (
                <button
                  type="button"
                  className="text-[14px] font-medium text-primary"
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Previous
                </button>
              )}
              <span className="text-[14px] tabular-nums text-muted-foreground">
                {page}/{totalPages}
              </span>
              {page < totalPages && (
                <button
                  type="button"
                  className="text-[14px] font-medium text-primary"
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
      <BottomSheet
        open={tagSheetOpen}
        onClose={() => setTagSheetOpen(false)}
        snapPoints={[55]}
      >
        <div className="space-y-4 p-5">
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Filters
          </p>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Status</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: "all", label: "All" },
                  { value: "published", label: "Published" },
                  { value: "overdue", label: "Overdue" },
                  { value: "due-soon", label: "Due Soon" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatusFilter(opt.value)}
                    className={cn(
                      "h-8 rounded-full px-3 text-[14px] font-medium transition-colors",
                      statusFilter === opt.value
                        ? "bg-foreground text-background"
                        : "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Author</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: "all", label: "Everyone" },
                  { value: "mine", label: "My Posts" },
                  { value: "others", label: "Others" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAuthorFilter(opt.value)}
                    className={cn(
                      "h-8 rounded-full px-3 text-[14px] font-medium transition-colors",
                      authorFilter === opt.value
                        ? "bg-foreground text-background"
                        : "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Tag</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTagFilter("all")}
                  className={cn(
                    "h-8 rounded-full px-3 text-[14px] font-medium transition-colors",
                    tagFilter === "all"
                      ? "bg-foreground text-background"
                      : "bg-muted/40 text-muted-foreground",
                  )}
                >
                  All
                </button>
                {tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTagFilter(t.id)}
                    className={cn(
                      "h-8 rounded-full px-3 text-[14px] font-medium transition-colors",
                      tagFilter === t.id
                        ? "bg-foreground text-background"
                        : "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Date</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { value: "all", label: "All Time" },
                  { value: "day", label: "Day" },
                  { value: "month", label: "Month" },
                  { value: "year", label: "Year" },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setDateFilterMode(opt.value);
                      setDateFilterValue("");
                    }}
                    className={cn(
                      "h-8 rounded-full px-3 text-[14px] font-medium transition-colors",
                      dateFilterMode === opt.value
                        ? "bg-foreground text-background"
                        : "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {dateFilterMode === "day" && (
                <input
                  type="date"
                  value={dateFilterValue}
                  onChange={(e) => setDateFilterValue(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border/40 bg-card px-3 text-sm"
                />
              )}
              {dateFilterMode === "month" && (
                <input
                  type="month"
                  value={dateFilterValue}
                  onChange={(e) => setDateFilterValue(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border/40 bg-card px-3 text-sm"
                />
              )}
              {dateFilterMode === "year" && (
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={dateFilterValue}
                  onChange={(e) => setDateFilterValue(e.target.value)}
                  placeholder="YYYY"
                  className="h-10 w-full rounded-xl border border-border/40 bg-card px-3 text-sm"
                />
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  setAuthorFilter("all");
                  setTagFilter("all");
                  setDateFilterMode("all");
                  setDateFilterValue("");
                  setTagSheetOpen(false);
                }}
                className="h-9 flex-1 rounded-xl bg-muted/40 text-[14px] font-medium text-muted-foreground transition-colors hover:bg-muted/60"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  setTagSheetOpen(false);
                }}
                className="h-9 flex-1 rounded-xl bg-primary text-[14px] font-medium text-primary-foreground"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Create post bottom sheet — shown when BOTH permission types are available */}
      <BottomSheet
        open={createMenuOpen}
        onClose={() => setCreateMenuOpen(false)}
        snapPoints={[40]}
      >
        <div className="space-y-3 p-5">
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Create new
          </p>
          <div className="space-y-2">
            {(permissionScope === "BOTH" ||
              permissionScope === "ASSIGNMENT") && (
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
                  <p className="text-[15px] font-semibold">New Assignment</p>
                  <p className="text-[14px] text-muted-foreground">
                    Create a task with a due date
                  </p>
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
                  <p className="text-[15px] font-semibold">New Note</p>
                  <p className="text-[14px] text-muted-foreground">
                    Share an announcement or info
                  </p>
                </div>
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  setCreateMenuOpen(false);
                  router.push("/content/new?type=FOLDER");
                }}
                className="flex w-full items-center gap-3 rounded-2xl bg-muted/30 px-4 py-3.5 text-left transition-colors active:bg-muted/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
                  <FolderOpen className="h-5 w-5 text-violet-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">New Folder</p>
                  <p className="text-[14px] text-muted-foreground">
                    Group notes &amp; assignments with shared audience
                  </p>
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
          className="fixed bottom-28 left-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-all active:scale-95 hover:bg-primary/90"
          aria-label="Create post"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}
