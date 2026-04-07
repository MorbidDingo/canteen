"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Download,
  Paperclip,
  Upload,
  X,
  Loader2,
  CheckCircle2,
  Send,
  RotateCcw,
  FileText,
  Film,
  ShieldX,
  FileQuestion,
  Pencil,
  Trash2,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/motion";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { cn } from "@/lib/utils";

type PostDetail = {
  id: string;
  type: "ASSIGNMENT" | "NOTE";
  title: string;
  body: string;
  dueAt: string | null;
  status: string;
  createdAt: string;
  authorUserId: string;
  authorName?: string;
};

type Attachment = {
  id: string;
  storageBackend: string;
  storageKey: string;
  originalFileName: string | null;
  mimeType: string;
  size: number;
};

type Tag = { id: string; name: string; color: string | null };

type Submission = {
  id: string;
  textContent: string | null;
  status: string;
  submittedAt: string;
};

type SubmissionAttachment = {
  id: string;
  storageBackend: string;
  storageKey: string;
  mimeType: string;
  size: number;
};

export default function PostDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session } = useSession();
  const postId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<PostDetail | null>(null);
  const [errorState, setErrorState] = useState<
    "not_found" | "no_permission" | "error" | null
  >(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // Submission state
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [subAttachments, setSubAttachments] = useState<SubmissionAttachment[]>(
    [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitText, setSubmitText] = useState("");
  const [submitFiles, setSubmitFiles] = useState<File[]>([]);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPost = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/content/posts/${postId}`);
      if (res.status === 403) {
        setErrorState("no_permission");
        return;
      }
      if (res.status === 404 || !res.ok) {
        setErrorState("not_found");
        return;
      }
      const data = await res.json();
      setPost(data.post);
      setAttachments(data.attachments || []);
      setTags(data.tags || []);
    } catch {
      setErrorState("error");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  const fetchMySubmission = useCallback(async () => {
    try {
      const res = await fetch(`/api/content/posts/${postId}/my-submission`);
      if (res.ok) {
        const data = await res.json();
        setSubmission(data.submission);
        setSubAttachments(data.attachments || []);
      }
    } catch {
      /* ignore */
    }
  }, [postId]);

  useEffect(() => {
    fetchPost();
    fetchMySubmission();
  }, [fetchPost, fetchMySubmission]);

  async function handleSubmit() {
    if (!submitText.trim() && submitFiles.length === 0) {
      toast.error("Add text or a file to submit");
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("textContent", submitText.trim());
      for (const file of submitFiles) {
        formData.append("files", file);
      }

      const isResubmit = !!submission;
      const res = await fetch(`/api/content/posts/${postId}/submit`, {
        method: isResubmit ? "PATCH" : "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Submission failed");
      }

      const data = await res.json();
      setSubmission(data.submission);
      setSubAttachments(data.attachments || []);
      setSubmitText("");
      setSubmitFiles([]);
      setShowSubmitForm(false);
      toast.success(
        isResubmit ? "Resubmitted successfully" : "Submitted successfully",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function formatDateTime(d: string) {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function isPastDue(dueAt: string) {
    return new Date(dueAt).getTime() < Date.now();
  }

  function isDueSoon(dueAt: string) {
    const diff = new Date(dueAt).getTime() - Date.now();
    return diff > 0 && diff < 48 * 60 * 60 * 1000;
  }

  function getFileName(att: {
    storageKey: string;
    originalFileName?: string | null;
  }) {
    if (att.originalFileName) return att.originalFileName;
    return att.storageKey.split("/").pop()?.split("?")[0] || "file";
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function handleDownload(attachmentId: string, type: "post" | "submission") {
    // Use fetch to download the file with proper naming
    const url = `/api/content/file/${type}/${attachmentId}?download=1`;
    // Open in new tab — the server will redirect with fl_attachment for Cloudinary
    // or presigned URL for S3
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const canSubmit =
    post?.type === "ASSIGNMENT" &&
    post?.status === "PUBLISHED" &&
    (!post?.dueAt || !isPastDue(post.dueAt));

  const backHref =
    post?.type === "NOTE" ? "/assignments?type=NOTE" : "/assignments";
  const canEditPost = !!post && post.authorUserId === session?.user?.id;

  async function handleDeletePost() {
    if (!post) return;
    if (!confirm("Delete this post? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/content/posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Post deleted");
      router.push(backHref);
    } catch {
      toast.error("Failed to delete post");
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

  if (!post) {
    return (
      <div className="px-5 pb-28 sm:px-8">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="mb-6 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/40"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-3 py-20 text-center">
          {errorState === "no_permission" ? (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
                <ShieldX className="h-8 w-8 text-destructive/50" />
              </div>
              <p className="text-[17px] font-semibold">No Permission</p>
              <p className="max-w-[260px] text-[13px] text-muted-foreground">
                You don&apos;t have access to this content. Contact your
                organization&apos;s management to request access.
              </p>
            </>
          ) : errorState === "not_found" ? (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40">
                <FileQuestion className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="text-[17px] font-semibold">Not Found</p>
              <p className="max-w-[260px] text-[13px] text-muted-foreground">
                This post may have been removed or you followed an invalid link.
              </p>
            </>
          ) : (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40">
                <FileQuestion className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="text-[17px] font-semibold">Something went wrong</p>
              <p className="max-w-[260px] text-[13px] text-muted-foreground">
                Failed to load this post. Check your connection and try again.
              </p>
            </>
          )}
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to Board
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pb-28 sm:px-8">
      {/* Header controls */}
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/40"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {canEditPost && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => router.push(`/content/${post.id}/edit`)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              aria-label="Edit post"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleDeletePost}
              disabled={deleting}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
              aria-label="Delete post"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Title */}
      <h1 className="text-[28px] font-bold leading-tight tracking-tight">
        {post.title}
      </h1>

      {/* Meta line */}
      <p className="mt-2 text-[13px] text-muted-foreground">
        {post.authorName || "Unknown"}
        {post.dueAt && (
          <>
            {" · "}
            <span
              className={cn(
                isPastDue(post.dueAt)
                  ? "text-destructive font-medium"
                  : isDueSoon(post.dueAt)
                    ? "text-primary font-medium"
                    : "",
              )}
            >
              {isPastDue(post.dueAt)
                ? "Overdue"
                : `Due ${formatDate(post.dueAt)}`}
            </span>
          </>
        )}
        {post.status === "CLOSED" && (
          <span className="text-muted-foreground/60"> · Closed</span>
        )}
      </p>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[12px] font-medium text-primary"
            >
              #{tag.name}
            </span>
          ))}
        </div>
      )}

      {/* Body */}
      <article className="mt-6">
        <MarkdownContent
          content={post.body}
          className="text-[16px] leading-[1.7] text-foreground/90"
        />
      </article>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="mt-8 space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Attachments
          </p>

          {/* Image gallery */}
          {attachments.filter((a) => a.mimeType.startsWith("image/")).length >
            0 && (
            <div className="grid grid-cols-2 gap-2">
              {attachments
                .filter((a) => a.mimeType.startsWith("image/"))
                .map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => handleDownload(att.id, "post")}
                    className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/30"
                  >
                    <Image
                      src={`/api/content/file/post/${att.id}`}
                      alt="Attachment"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </button>
                ))}
            </div>
          )}

          {/* File rows */}
          {attachments
            .filter((a) => !a.mimeType.startsWith("image/"))
            .map((att) => {
              const isPdf = att.mimeType === "application/pdf";
              const isVideo = att.mimeType.startsWith("video/");
              return (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => handleDownload(att.id, "post")}
                  className="flex w-full items-center gap-3 rounded-2xl bg-card p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors active:bg-muted/30"
                >
                  {isPdf ? (
                    <FileText className="h-5 w-5 shrink-0 text-red-500" />
                  ) : isVideo ? (
                    <Film className="h-5 w-5 shrink-0 text-purple-500" />
                  ) : (
                    <Paperclip className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-[14px] font-medium">
                      {getFileName(att)}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {formatFileSize(att.size)}
                    </p>
                  </div>
                  <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
        </div>
      )}

      {/* Submission section — only for ASSIGNMENT */}
      {post.type === "ASSIGNMENT" && (
        <div className="mt-8">
          {/* Existing submission — shown inline */}
          {submission ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {submission.status === "RESUBMITTED"
                    ? "Resubmitted"
                    : "Submitted"}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  · {formatDateTime(submission.submittedAt)}
                </span>
              </div>

              {submission.textContent && (
                <p className="whitespace-pre-wrap rounded-xl bg-muted/30 p-3 text-[14px] text-foreground/80">
                  {submission.textContent}
                </p>
              )}

              {subAttachments.length > 0 && (
                <div className="space-y-1.5">
                  {subAttachments.map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => handleDownload(att.id, "submission")}
                      className="flex w-full items-center gap-2 rounded-xl bg-muted/30 px-3 py-2 text-[13px] transition-colors active:bg-muted/50"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-left">
                        {getFileName(att)}
                      </span>
                      <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {canSubmit && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary"
                  onClick={() => {
                    setShowSubmitForm(true);
                    setSubmitText(submission.textContent || "");
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Resubmit
                </button>
              )}
            </div>
          ) : canSubmit ? (
            <button
              type="button"
              className="h-14 w-full rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
              onClick={() => setShowSubmitForm(true)}
            >
              Submit Assignment
            </button>
          ) : (
            <p className="text-center text-[13px] text-muted-foreground">
              {post.status === "CLOSED"
                ? "This assignment is closed for submissions."
                : post.dueAt && isPastDue(post.dueAt)
                  ? "The due date has passed."
                  : "Submissions are not available."}
            </p>
          )}
        </div>
      )}

      {/* Submission Bottom Sheet */}
      <BottomSheet
        open={showSubmitForm && canSubmit}
        onClose={() => {
          setShowSubmitForm(false);
          setSubmitText("");
          setSubmitFiles([]);
        }}
        snapPoints={[70]}
      >
        <div className="space-y-5 p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {submission ? "Resubmit" : "Submit"} your work
          </p>

          {/* Response */}
          <Textarea
            value={submitText}
            onChange={(e) => setSubmitText(e.target.value)}
            rows={5}
            placeholder="Type your response here..."
            className="rounded-xl border-border/40 text-[15px]"
          />

          {/* Files */}
          <div className="space-y-2">
            {submitFiles.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-xl bg-muted/30 px-3 py-2 text-[13px]"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-[12px] text-muted-foreground">
                  {(file.size / 1024).toFixed(0)}KB
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSubmitFiles((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}

            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border/60 px-4 py-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted/20">
              <Upload className="h-4 w-4" />
              <span>Add files</span>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={(e) => {
                  if (e.target.files)
                    setSubmitFiles((prev) => [
                      ...prev,
                      ...Array.from(e.target.files!),
                    ]);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          {/* Submit button */}
          <button
            type="button"
            className={cn(
              "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]",
              (submitting ||
                (!submitText.trim() && submitFiles.length === 0)) &&
                "opacity-50 pointer-events-none",
            )}
            disabled={
              submitting || (!submitText.trim() && submitFiles.length === 0)
            }
            onClick={handleSubmit}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            <Send className="h-4 w-4" />
            {submission ? "Resubmit" : "Submit"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
