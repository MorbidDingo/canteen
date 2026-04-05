"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Paperclip,
  Folder,
  Trash2,
  Edit3,
  ClipboardList,
  StickyNote,
  FileQuestion,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

type PostItem = {
  id: string;
  type: "ASSIGNMENT" | "NOTE";
  title: string;
  body: string;
  dueAt: string | null;
  status: string;
  createdAt: string;
  authorName: string;
  attachments: { id: string; mimeType: string; size: number }[];
};

type AudienceRow = {
  id: string;
  audienceType: string;
  className: string | null;
  section: string | null;
  userId: string | null;
  groupId: string | null;
};

type FolderDetail = {
  id: string;
  name: string;
  description: string | null;
  authorUserId: string;
  authorName: string | null;
  createdAt: string;
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function isPastDue(dueAt: string) {
  return new Date(dueAt).getTime() < Date.now();
}

function isDueSoon(dueAt: string) {
  const diff = new Date(dueAt).getTime() - Date.now();
  return diff > 0 && diff < 48 * 60 * 60 * 1000;
}

function audienceLabel(a: AudienceRow): string {
  if (a.audienceType === "ALL_ORG") return "Entire Organization";
  if (a.audienceType === "CLASS") return `Class: ${a.className}`;
  if (a.audienceType === "SECTION") return `${a.className} - ${a.section}`;
  if (a.audienceType === "GROUP") return "Group";
  if (a.audienceType === "USER") return "Individual";
  return a.audienceType;
}

export default function FolderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const folderId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState<FolderDetail | null>(null);
  const [audiences, setAudiences] = useState<AudienceRow[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  const fetchFolder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/content/folders/${folderId}`);
      if (!res.ok) {
        setFolder(null);
        return;
      }
      const data = await res.json();
      setFolder(data.folder);
      setAudiences(data.audiences || []);
      setPosts(data.posts || []);
    } catch {
      setFolder(null);
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => { fetchFolder(); }, [fetchFolder]);

  async function handleDelete() {
    if (!confirm("Delete this folder? Posts inside will not be deleted.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/content/folders/${folderId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Folder deleted");
      router.push("/assignments");
    } catch {
      toast.error("Failed to delete folder");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!folder) {
    return (
      <div className="px-5 pb-28 sm:px-8">
        <button
          type="button"
          onClick={() => router.push("/assignments")}
          className="mb-6 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/40"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40">
            <FileQuestion className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p className="text-[17px] font-semibold">Folder Not Found</p>
          <p className="max-w-[260px] text-[13px] text-muted-foreground">
            This folder may have been removed.
          </p>
          <button
            type="button"
            onClick={() => router.push("/assignments")}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground"
          >
            Go to Board
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pb-28 sm:px-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => router.push("/assignments")}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/40"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Folder info */}
      <div className="flex items-start gap-3 mb-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
          <Folder className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-bold leading-tight tracking-tight">{folder.name}</h1>
          {folder.description && (
            <p className="mt-1 text-[14px] text-muted-foreground">{folder.description}</p>
          )}
          <p className="mt-1 text-[12px] text-muted-foreground">
            {folder.authorName} · {formatDate(folder.createdAt)}
          </p>
        </div>
      </div>

      {/* Audience chips */}
      {audiences.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground mb-2">
            Target Audience
          </p>
          <div className="flex flex-wrap gap-1.5">
            {audiences.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-lg bg-muted/40 px-2.5 py-1 text-[12px] font-medium text-foreground/70"
              >
                {audienceLabel(a)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Posts in folder */}
      {posts.length === 0 ? (
        <div className="py-12 text-center">
          <Folder className="mx-auto h-10 w-10 text-muted-foreground/20" />
          <p className="mt-3 text-[15px] text-muted-foreground">No items in this folder yet</p>
          <button
            type="button"
            onClick={() => setCreateMenuOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Content
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {posts.length} item{posts.length !== 1 ? "s" : ""}
          </p>
          {posts.map((post) => (
            <Link key={post.id} href={`/assignments/${post.id}`} className="block">
              <div className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors active:bg-muted/30">
                <div className="flex items-start gap-2">
                  <div className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
                    post.type === "ASSIGNMENT" ? "bg-primary/10" : "bg-orange-500/10",
                  )}>
                    {post.type === "ASSIGNMENT"
                      ? <ClipboardList className="h-3.5 w-3.5 text-primary" />
                      : <StickyNote className="h-3.5 w-3.5 text-orange-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{post.title}</p>
                    {post.body && (
                      <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">{post.body}</p>
                    )}
                    <div className="mt-1 flex items-center gap-1 text-[12px]">
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
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Floating add button */}
      <button
        type="button"
        onClick={() => setCreateMenuOpen(true)}
        className="fixed bottom-28 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-all active:scale-95"
        aria-label="Add to folder"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Create in folder sheet */}
      <BottomSheet open={createMenuOpen} onClose={() => setCreateMenuOpen(false)} snapPoints={[30]}>
        <div className="space-y-3 p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Add to folder</p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setCreateMenuOpen(false);
                router.push(`/content/new?type=ASSIGNMENT&folderId=${folderId}`);
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-muted/30 px-4 py-3.5 text-left transition-colors active:bg-muted/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">New Assignment</p>
                <p className="text-[12px] text-muted-foreground">Inherits folder audience</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setCreateMenuOpen(false);
                router.push(`/content/new?type=NOTE&folderId=${folderId}`);
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-muted/30 px-4 py-3.5 text-left transition-colors active:bg-muted/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                <StickyNote className="h-5 w-5 text-orange-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">New Note</p>
                <p className="text-[12px] text-muted-foreground">Inherits folder audience</p>
              </div>
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
