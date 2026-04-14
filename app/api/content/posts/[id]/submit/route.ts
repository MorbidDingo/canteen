import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contentPost,
  contentSubmission,
  contentSubmissionAttachment,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { checkAudienceAccess } from "@/lib/content-audience";
import { uploadFileToS3 } from "@/lib/s3";
import { configureCloudinary } from "@/lib/cloudinary";
import cloudinary from "cloudinary";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const MAX_S3_SIZE = 50 * 1024 * 1024;
const MAX_CLOUDINARY_SIZE = 20 * 1024 * 1024;

// POST — submit work on an assignment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
  const { id: postId } = await params;

  // Fetch the post
  const [post] = await db
    .select()
    .from(contentPost)
    .where(
      and(
        eq(contentPost.id, postId),
        eq(contentPost.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!post || post.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.type !== "ASSIGNMENT") {
    return NextResponse.json({ error: "Only assignments accept submissions" }, { status: 400 });
  }

  if (post.dueAt && new Date(post.dueAt) < new Date()) {
    return NextResponse.json({ error: "Submission deadline has passed" }, { status: 400 });
  }

  // Verify audience access
  const hasAccess = await checkAudienceAccess(organizationId, userId, postId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // Check for existing submission
  const [existing] = await db
    .select({ id: contentSubmission.id })
    .from(contentSubmission)
    .where(
      and(
        eq(contentSubmission.postId, postId),
        eq(contentSubmission.submittedByUserId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "Already submitted. Use PATCH to resubmit." }, { status: 409 });
  }

  const formData = await request.formData();
  const textContent = formData.get("textContent") as string | null;
  const files = formData.getAll("files") as File[];

  if (!textContent && files.length === 0) {
    return NextResponse.json({ error: "Submission must include text or at least one file" }, { status: 400 });
  }

  // Create submission
  const [submission] = await db
    .insert(contentSubmission)
    .values({
      postId,
      submittedByUserId: userId,
      status: "SUBMITTED",
      textContent: textContent || null,
    })
    .returning();

  // Upload attachments
  const attachments = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    const isImage = IMAGE_TYPES.has(mimeType);

    if (isImage && buffer.length > MAX_CLOUDINARY_SIZE) {
      return NextResponse.json({ error: `Image ${file.name} exceeds 20 MB` }, { status: 400 });
    }
    if (!isImage && buffer.length > MAX_S3_SIZE) {
      return NextResponse.json({ error: `File ${file.name} exceeds 50 MB` }, { status: 400 });
    }

    let storageBackend: "S3" | "CLOUDINARY";
    let storageKey: string;

    if (isImage) {
      configureCloudinary();
      const result = await new Promise<cloudinary.UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.v2.uploader.upload_stream(
          {
            folder: `content/submissions/${submission.id}`,
            resource_type: "image",
          },
          (error, result) => {
            if (error || !result) reject(error || new Error("Upload failed"));
            else resolve(result);
          },
        );
        stream.end(buffer);
      });
      storageBackend = "CLOUDINARY";
      storageKey = result.public_id;
    } else {
      const key = `content/submissions/${submission.id}/${crypto.randomUUID()}-${file.name}`;
      await uploadFileToS3(key, buffer, mimeType);
      storageBackend = "S3";
      storageKey = key;
    }

    const [att] = await db
      .insert(contentSubmissionAttachment)
      .values({
        submissionId: submission.id,
        storageBackend,
        storageKey,
        mimeType,
        size: buffer.length,
      })
      .returning();

    attachments.push(att);
  }

  logAudit({
    organizationId,
    userId: access.actorUserId,
    userRole: access.membershipRole ?? access.session.user.role,
    action: AUDIT_ACTIONS.CONTENT_SUBMITTED,
    details: { postId, submissionId: submission.id },
    request,
  });

  return NextResponse.json({
    submission: { ...submission, submittedAt: submission.createdAt },
    attachments,
  }, { status: 201 });
}

// PATCH — resubmit (update status, replace attachments)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
  const { id: postId } = await params;

  // Fetch the post
  const [post] = await db
    .select()
    .from(contentPost)
    .where(
      and(
        eq(contentPost.id, postId),
        eq(contentPost.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!post || post.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.type !== "ASSIGNMENT") {
    return NextResponse.json({ error: "Only assignments accept submissions" }, { status: 400 });
  }

  if (post.dueAt && new Date(post.dueAt) < new Date()) {
    return NextResponse.json({ error: "Submission deadline has passed" }, { status: 400 });
  }

  // Find existing submission
  const [existing] = await db
    .select()
    .from(contentSubmission)
    .where(
      and(
        eq(contentSubmission.postId, postId),
        eq(contentSubmission.submittedByUserId, userId),
      ),
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "No existing submission to resubmit" }, { status: 404 });
  }

  const formData = await request.formData();
  const textContent = formData.get("textContent") as string | null;
  const files = formData.getAll("files") as File[];

  // Update submission status and text
  const [submission] = await db
    .update(contentSubmission)
    .set({
      status: "RESUBMITTED" as const,
      textContent: textContent !== undefined ? (textContent || null) : existing.textContent,
      updatedAt: new Date(),
    })
    .where(eq(contentSubmission.id, existing.id))
    .returning();

  // If new files provided, delete old attachments and upload new ones
  if (files.length > 0) {
    // Delete old attachment rows (cascade from storage is TODO)
    await db
      .delete(contentSubmissionAttachment)
      .where(eq(contentSubmissionAttachment.submissionId, existing.id));

    const attachments = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = file.type || "application/octet-stream";
      const isImage = IMAGE_TYPES.has(mimeType);

      if (isImage && buffer.length > MAX_CLOUDINARY_SIZE) {
        return NextResponse.json({ error: `Image ${file.name} exceeds 20 MB` }, { status: 400 });
      }
      if (!isImage && buffer.length > MAX_S3_SIZE) {
        return NextResponse.json({ error: `File ${file.name} exceeds 50 MB` }, { status: 400 });
      }

      let storageBackend: "S3" | "CLOUDINARY";
      let storageKey: string;

      if (isImage) {
        configureCloudinary();
        const result = await new Promise<cloudinary.UploadApiResponse>((resolve, reject) => {
          const stream = cloudinary.v2.uploader.upload_stream(
            {
              folder: `content/submissions/${existing.id}`,
              resource_type: "image",
            },
            (error, result) => {
              if (error || !result) reject(error || new Error("Upload failed"));
              else resolve(result);
            },
          );
          stream.end(buffer);
        });
        storageBackend = "CLOUDINARY";
        storageKey = result.public_id;
      } else {
        const key = `content/submissions/${existing.id}/${crypto.randomUUID()}-${file.name}`;
        await uploadFileToS3(key, buffer, mimeType);
        storageBackend = "S3";
        storageKey = key;
      }

      const [att] = await db
        .insert(contentSubmissionAttachment)
        .values({
          submissionId: existing.id,
          storageBackend,
          storageKey,
          mimeType,
          size: buffer.length,
        })
        .returning();

      attachments.push(att);
    }

    return NextResponse.json({
      submission: { ...submission, submittedAt: submission.createdAt },
      attachments,
    });
  }

  // If no new files, return existing attachments
  const attachments = await db
    .select()
    .from(contentSubmissionAttachment)
    .where(eq(contentSubmissionAttachment.submissionId, existing.id));

  return NextResponse.json({
    submission: { ...submission, submittedAt: submission.createdAt },
    attachments,
  });
}
