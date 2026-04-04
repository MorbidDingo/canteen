import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contentPostAttachment,
  contentSubmissionAttachment,
  contentSubmission,
  contentPost,
} from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { checkAudienceAccess } from "@/lib/content-audience";
import { getPresignedUrl } from "@/lib/s3";

// GET — auth-gated file serving
// Key format: /api/content/file/post/<attachmentId> or /api/content/file/submission/<attachmentId>
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "OPERATOR", "LIB_OPERATOR", "ATTENDANCE", "PARENT", "GENERAL"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const organizationId = access.activeOrganizationId!;
  const userId = access.actorUserId;
  const { key } = await params;

  if (key.length < 2) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  const [fileType, attachmentId] = key;

  const { searchParams } = new URL(request.url);
  const wantDownload = searchParams.get("download") === "1";

  if (fileType === "post") {
    // Post attachment — verify audience access to the parent post
    const [att] = await db
      .select()
      .from(contentPostAttachment)
      .where(eq(contentPostAttachment.id, attachmentId))
      .limit(1);

    if (!att) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Fetch post to check org and authorship/audience
    const [post] = await db
      .select({ id: contentPost.id, organizationId: contentPost.organizationId, authorUserId: contentPost.authorUserId, title: contentPost.title })
      .from(contentPost)
      .where(eq(contentPost.id, att.postId))
      .limit(1);

    if (!post || post.organizationId !== organizationId) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Author always has access; otherwise check audience
    if (post.authorUserId !== userId) {
      const hasAccess = await checkAudienceAccess(organizationId, userId, post.id);
      if (!hasAccess) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
    }

    // Build download filename: postTitle-originalFileName
    let downloadName: string | undefined;
    if (wantDownload) {
      if (att.originalFileName) {
        downloadName = att.originalFileName;
      } else {
        const fileName = att.storageKey.split("/").pop()?.split("?")[0] || "file";
        const safeTitle = (post.title || "attachment").replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "_");
        downloadName = `${safeTitle}-${fileName}`;
      }
    }

    return redirectToFile(att.storageBackend, att.storageKey, downloadName);
  }

  if (fileType === "submission") {
    // Submission attachment — only the submitter or the post author can access
    const [att] = await db
      .select()
      .from(contentSubmissionAttachment)
      .where(eq(contentSubmissionAttachment.id, attachmentId))
      .limit(1);

    if (!att) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Fetch submission + post
    const [submission] = await db
      .select({
        id: contentSubmission.id,
        submittedByUserId: contentSubmission.submittedByUserId,
        postId: contentSubmission.postId,
      })
      .from(contentSubmission)
      .where(eq(contentSubmission.id, att.submissionId))
      .limit(1);

    if (!submission) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const [post] = await db
      .select({ authorUserId: contentPost.authorUserId, organizationId: contentPost.organizationId })
      .from(contentPost)
      .where(eq(contentPost.id, submission.postId))
      .limit(1);

    if (!post || post.organizationId !== organizationId) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Only the submitter or the post author can access submission files
    if (submission.submittedByUserId !== userId && post.authorUserId !== userId) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    let downloadName: string | undefined;
    if (wantDownload) {
      const fileName = att.storageKey.split("/").pop()?.split("?")[0] || "file";
      downloadName = `submission-${fileName}`;
    }

    return redirectToFile(att.storageBackend, att.storageKey, downloadName);
  }

  return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
}

async function redirectToFile(
  storageBackend: string,
  storageKey: string,
  downloadName?: string,
): Promise<NextResponse> {
  if (storageBackend === "S3") {
    const url = await getPresignedUrl(storageKey, 3600);
    if (downloadName) {
      // For S3, we redirect to presigned URL; download name is handled client-side
      return NextResponse.redirect(url);
    }
    return NextResponse.redirect(url);
  }

  if (storageBackend === "CLOUDINARY") {
    // storageKey is the full secure_url from Cloudinary
    let url: string;
    if (storageKey.startsWith("http://") || storageKey.startsWith("https://")) {
      url = storageKey;
    } else {
      // Fallback: construct URL from cloud name + public_id
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
      if (!cloudName) {
        return NextResponse.json({ error: "Cloudinary not configured" }, { status: 500 });
      }
      url = `https://res.cloudinary.com/${cloudName}/image/upload/${storageKey}`;
    }

    // Add Cloudinary fl_attachment flag for download with custom filename
    if (downloadName) {
      // Insert fl_attachment:<name> transformation
      const safeFileName = downloadName.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
      url = url.replace("/upload/", `/upload/fl_attachment:${safeFileName}/`);
    }

    return NextResponse.redirect(url);
  }

  return NextResponse.json({ error: "Unknown storage backend" }, { status: 500 });
}
