import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contentPost,
  contentSubmission,
  contentSubmissionAttachment,
  user,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// GET — list all submissions for a post (author only)
export async function GET(
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
  const { id: postId } = await params;

  // Only the post author can see all submissions
  const [post] = await db
    .select({ id: contentPost.id, authorUserId: contentPost.authorUserId })
    .from(contentPost)
    .where(
      and(
        eq(contentPost.id, postId),
        eq(contentPost.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.authorUserId !== access.actorUserId) {
    return NextResponse.json({ error: "Only the post author can view submissions" }, { status: 403 });
  }

  const submissions = await db
    .select({
      id: contentSubmission.id,
      submittedByUserId: contentSubmission.submittedByUserId,
      submitterName: user.name,
      submitterEmail: user.email,
      status: contentSubmission.status,
      textContent: contentSubmission.textContent,
      createdAt: contentSubmission.createdAt,
      updatedAt: contentSubmission.updatedAt,
    })
    .from(contentSubmission)
    .innerJoin(user, eq(contentSubmission.submittedByUserId, user.id))
    .where(eq(contentSubmission.postId, postId))
    .orderBy(contentSubmission.createdAt);

  // Fetch attachments for all submissions
  const submissionIds = submissions.map((s) => s.id);
  let attachments: Array<{
    id: string;
    submissionId: string;
    storageBackend: string;
    storageKey: string;
    mimeType: string;
    size: number;
  }> = [];

  if (submissionIds.length > 0) {
    attachments = await db
      .select({
        id: contentSubmissionAttachment.id,
        submissionId: contentSubmissionAttachment.submissionId,
        storageBackend: contentSubmissionAttachment.storageBackend,
        storageKey: contentSubmissionAttachment.storageKey,
        mimeType: contentSubmissionAttachment.mimeType,
        size: contentSubmissionAttachment.size,
      })
      .from(contentSubmissionAttachment)
      .where(
        eq(contentSubmissionAttachment.submissionId, submissionIds[0]),
      );

    // For multiple submissions, query each
    if (submissionIds.length > 1) {
      const { inArray } = await import("drizzle-orm");
      attachments = await db
        .select({
          id: contentSubmissionAttachment.id,
          submissionId: contentSubmissionAttachment.submissionId,
          storageBackend: contentSubmissionAttachment.storageBackend,
          storageKey: contentSubmissionAttachment.storageKey,
          mimeType: contentSubmissionAttachment.mimeType,
          size: contentSubmissionAttachment.size,
        })
        .from(contentSubmissionAttachment)
        .where(inArray(contentSubmissionAttachment.submissionId, submissionIds));
    }
  }

  // Group attachments by submission
  const attachmentMap = new Map<string, typeof attachments>();
  for (const att of attachments) {
    const existing = attachmentMap.get(att.submissionId) || [];
    existing.push(att);
    attachmentMap.set(att.submissionId, existing);
  }

  const result = submissions.map((s) => ({
    ...s,
    attachments: attachmentMap.get(s.id) || [],
  }));

  return NextResponse.json({ submissions: result });
}
