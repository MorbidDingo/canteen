"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  Download,
  FileText,
  Clock,
  User,
  Paperclip,
} from "lucide-react";

type Submission = {
  id: string;
  userId: string;
  textContent: string | null;
  status: string;
  submittedAt: string;
  gradedAt: string | null;
  grade: string | null;
  feedback: string | null;
  user?: { name: string; email: string };
  attachments?: { id: string; storageKey: string; mimeType: string; size: number }[];
};

export default function SubmissionsPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [postTitle, setPostTitle] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [postRes, subsRes] = await Promise.all([
        fetch(`/api/content/posts/${postId}`),
        fetch(`/api/content/posts/${postId}/submissions`),
      ]);

      if (postRes.ok) {
        const data = await postRes.json();
        setPostTitle(data.post.title);
      }

      if (subsRes.ok) {
        const data = await subsRes.json();
        setSubmissions(data.submissions || []);
      } else if (subsRes.status === 403) {
        toast.error("Not authorized");
        router.push("/content");
        return;
      }
    } catch {
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, [postId, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-28">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/content/${postId}/edit`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold">Submissions</h1>
          <p className="truncate text-xs text-muted-foreground">{postTitle}</p>
        </div>
        <Badge variant="secondary" className="text-xs">
          {submissions.length} total
        </Badge>
      </div>

      {/* Submissions list */}
      {submissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No submissions yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map((sub) => (
            <div key={sub.id} className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {sub.user?.name || sub.userId.slice(0, 8) + "..."}
                    </p>
                    {sub.user?.email && (
                      <p className="text-[11px] text-muted-foreground">{sub.user.email}</p>
                    )}
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={`text-[10px] ${
                    sub.status === "SUBMITTED"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                      : sub.status === "GRADED"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                      : sub.status === "RESUBMITTED"
                      ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                      : ""
                  }`}
                >
                  {sub.status}
                </Badge>
              </div>

              {/* Submitted at */}
              <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDate(sub.submittedAt)}
              </div>

              {/* Text content */}
              {sub.textContent && (
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs">
                  {sub.textContent}
                </p>
              )}

              {/* Grade/Feedback */}
              {sub.grade && (
                <div className="mt-2 text-xs">
                  <span className="font-medium">Grade:</span> {sub.grade}
                </div>
              )}
              {sub.feedback && (
                <div className="mt-1 text-xs text-muted-foreground">
                  <span className="font-medium">Feedback:</span> {sub.feedback}
                </div>
              )}

              {/* Attachments */}
              {sub.attachments && sub.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sub.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={`/api/content/posts/${postId}/submissions/${sub.id}/files/${att.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted"
                    >
                      <Paperclip className="h-3 w-3" />
                      {att.storageKey.split("/").pop() || "file"}
                      <span className="text-muted-foreground/60">
                        ({(att.size / 1024).toFixed(0)}KB)
                      </span>
                      <Download className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
