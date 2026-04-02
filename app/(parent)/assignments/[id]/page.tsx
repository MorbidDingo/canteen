"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Clock,
  ClipboardList,
  StickyNote,
  Download,
  Paperclip,
  Upload,
  X,
  Loader2,
  User,
  CheckCircle2,
  Send,
  RotateCcw,
  FileText,
  Film,
} from "lucide-react";

type PostDetail = {
  id: string;
  type: "ASSIGNMENT" | "NOTE";
  title: string;
  body: string;
  dueAt: string | null;
  status: string;
  createdAt: string;
  authorName?: string;
};

type Attachment = {
  id: string;
  storageBackend: string;
  storageKey: string;
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
  storageKey: string;
  mimeType: string;
  size: number;
};

export default function PostDetailPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<PostDetail | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // Submission state
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [subAttachments, setSubAttachments] = useState<SubmissionAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitText, setSubmitText] = useState("");
  const [submitFiles, setSubmitFiles] = useState<File[]>([]);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPost = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/content/posts/${postId}`);
      if (!res.ok) {
        toast.error("Post not found or access denied");
        router.push("/assignments");
        return;
      }
      const data = await res.json();
      setPost(data.post);
      setAttachments(data.attachments || []);
      setTags(data.tags || []);
    } catch {
      toast.error("Failed to load post");
    } finally {
      setLoading(false);
    }
  }, [postId, router]);

  const fetchMySubmission = useCallback(async () => {
    try {
      const res = await fetch(`/api/content/posts/${postId}/my-submission`);
      if (res.ok) {
        const data = await res.json();
        setSubmission(data.submission);
        setSubAttachments(data.attachments || []);
      }
    } catch { /* ignore */ }
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
      toast.success(isResubmit ? "Resubmitted successfully" : "Submitted successfully");
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

  function getFileName(storageKey: string) {
    return storageKey.split("/").pop()?.split("?")[0] || "file";
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!post) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-28">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2 h-8 gap-1 text-xs text-muted-foreground"
        onClick={() => router.push("/assignments")}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to feed
      </Button>

      {/* Post header */}
      <div className="space-y-3">
        {/* Type + status */}
        <div className="flex items-center gap-1.5">
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            post.type === "ASSIGNMENT"
              ? "bg-blue-50 dark:bg-blue-950/30"
              : "bg-emerald-50 dark:bg-emerald-950/30"
          }`}>
            {post.type === "ASSIGNMENT" ? (
              <ClipboardList className="h-3.5 w-3.5 text-blue-500" />
            ) : (
              <StickyNote className="h-3.5 w-3.5 text-emerald-500" />
            )}
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {post.type === "ASSIGNMENT" ? "Assignment" : "Note"}
          </Badge>
          {post.status === "CLOSED" && (
            <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-[10px] dark:bg-gray-800/30 dark:text-gray-400">
              Closed
            </Badge>
          )}
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold leading-tight tracking-tight">{post.title}</h1>

        {/* Meta line */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {post.authorName || "Unknown"}
          </span>
          <span>·</span>
          <span>{formatDate(post.createdAt)}</span>
          {post.dueAt && (
            <>
              <span>·</span>
              <Badge
                variant="secondary"
                className={`gap-0.5 px-1.5 py-0 text-[10px] ${
                  isPastDue(post.dueAt)
                    ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                    : isDueSoon(post.dueAt)
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                    : ""
                }`}
              >
                <Clock className="h-3 w-3" />
                {isPastDue(post.dueAt) ? "Overdue" : `Due ${formatDate(post.dueAt)}`}
              </Badge>
            </>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="px-1.5 py-0 text-[10px]"
                style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
              >
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="my-4 border-t border-border/60" />

      {/* Body */}
      <article className="prose prose-sm dark:prose-invert max-w-none">
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {post.body}
        </div>
      </article>

      {/* Attachments — premium display */}
      {attachments.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-2">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {attachments.length} {attachments.length === 1 ? "attachment" : "attachments"}
            </span>
          </div>

          {/* Image gallery */}
          {attachments.filter((a) => a.mimeType.startsWith("image/")).length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {attachments
                .filter((a) => a.mimeType.startsWith("image/"))
                .map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => handleDownload(att.id, "post")}
                    className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border/40 bg-muted/30 transition-all hover:border-border hover:shadow-sm"
                  >
                    <Image
                      src={`/api/content/file/post/${att.id}`}
                      alt="Attachment"
                      fill
                      className="object-cover transition-transform group-hover:scale-[1.02]"
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/50 px-2 py-1 text-[10px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                      <Download className="h-3 w-3" />
                      Download
                    </div>
                  </button>
                ))}
            </div>
          )}

          {/* PDF files */}
          {attachments.filter((a) => a.mimeType === "application/pdf").map((att) => (
            <button
              key={att.id}
              type="button"
              onClick={() => handleDownload(att.id, "post")}
              className="flex w-full items-center gap-3 rounded-xl border border-border/40 bg-red-50/50 p-3 transition-all hover:border-red-200 hover:shadow-sm dark:bg-red-950/10 dark:hover:border-red-900/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-950/30">
                <FileText className="h-5 w-5 text-red-500" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium">{getFileName(att.storageKey)}</p>
                <p className="text-[11px] text-muted-foreground">
                  PDF · {formatFileSize(att.size)}
                </p>
              </div>
              <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}

          {/* Video files */}
          {attachments.filter((a) => a.mimeType.startsWith("video/")).map((att) => (
            <button
              key={att.id}
              type="button"
              onClick={() => handleDownload(att.id, "post")}
              className="flex w-full items-center gap-3 rounded-xl border border-border/40 bg-purple-50/50 p-3 transition-all hover:border-purple-200 hover:shadow-sm dark:bg-purple-950/10 dark:hover:border-purple-900/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-950/30">
                <Film className="h-5 w-5 text-purple-500" />
              </div>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium">{getFileName(att.storageKey)}</p>
                <p className="text-[11px] text-muted-foreground">
                  Video · {formatFileSize(att.size)}
                </p>
              </div>
              <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}

          {/* Other files */}
          {attachments
            .filter((a) => !a.mimeType.startsWith("image/") && a.mimeType !== "application/pdf" && !a.mimeType.startsWith("video/"))
            .map((att) => (
              <button
                key={att.id}
                type="button"
                onClick={() => handleDownload(att.id, "post")}
                className="flex w-full items-center gap-3 rounded-xl border border-border/40 p-3 transition-all hover:border-border hover:shadow-sm"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                  <Paperclip className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">{getFileName(att.storageKey)}</p>
                  <p className="text-[11px] text-muted-foreground">{formatFileSize(att.size)}</p>
                </div>
                <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
        </div>
      )}

      {/* Submission section — only for ASSIGNMENT */}
      {post.type === "ASSIGNMENT" && (
        <div className="mt-6 space-y-3">
          <div className="border-t border-border/60 pt-4">
            <h2 className="text-sm font-bold tracking-tight">Your Submission</h2>
          </div>

          {/* Existing submission */}
          {submission ? (
            <div className="rounded-xl border border-green-200 bg-green-50/50 p-3 dark:border-green-900/30 dark:bg-green-950/20">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-xs font-semibold text-green-700 dark:text-green-300">
                  {submission.status === "RESUBMITTED" ? "Resubmitted" : "Submitted"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  · {formatDateTime(submission.submittedAt)}
                </span>
              </div>

              {submission.textContent && (
                <p className="mt-2 whitespace-pre-wrap rounded-md bg-background/50 p-2 text-xs">
                  {submission.textContent}
                </p>
              )}

              {subAttachments.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {subAttachments.map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => handleDownload(att.id, "submission")}
                      className="flex w-full items-center gap-2 rounded-lg border bg-background/50 px-3 py-2 text-xs transition-colors hover:bg-background"
                    >
                      <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-left">{getFileName(att.storageKey)}</span>
                      <Download className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {/* Resubmit toggle */}
              {canSubmit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 gap-1 text-xs"
                  onClick={() => {
                    setShowSubmitForm(true);
                    setSubmitText(submission.textContent || "");
                  }}
                >
                  <RotateCcw className="h-3 w-3" />
                  Resubmit
                </Button>
              )}
            </div>
          ) : canSubmit ? (
            !showSubmitForm ? (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setShowSubmitForm(true)}
              >
                <Send className="h-4 w-4" />
                Submit Your Work
              </Button>
            ) : null
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              <FileText className="h-4 w-4 shrink-0" />
              {post.status === "CLOSED"
                ? "This assignment is closed for submissions."
                : post.dueAt && isPastDue(post.dueAt)
                ? "The due date has passed."
                : "Submissions are not available."}
            </div>
          )}

          {/* Submit form */}
          {showSubmitForm && canSubmit && (
            <div className="space-y-3 rounded-xl border border-border/60 bg-card p-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Response</Label>
                <Textarea
                  value={submitText}
                  onChange={(e) => setSubmitText(e.target.value)}
                  rows={4}
                  placeholder="Type your response here..."
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Files</Label>
                {submitFiles.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-muted-foreground">{(file.size / 1024).toFixed(0)}KB</span>
                    <button type="button" onClick={() => setSubmitFiles((prev) => prev.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted/30">
                  <Upload className="h-4 w-4" />
                  <span>Click to add files</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) setSubmitFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setShowSubmitForm(false);
                    setSubmitText("");
                    setSubmitFiles([]);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 flex-1 gap-1.5 text-xs"
                  disabled={submitting || (!submitText.trim() && submitFiles.length === 0)}
                  onClick={handleSubmit}
                >
                  {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
                  <Send className="h-3 w-3" />
                  {submission ? "Resubmit" : "Submit"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
