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

// GET — get the caller's own submission for a post
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
  const userId = access.actorUserId;
  const { id: postId } = await params;

  // Verify post exists and is published
  const [post] = await db
    .select({ id: contentPost.id, status: contentPost.status })
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

  // Verify audience access
  const hasAccess = await checkAudienceAccess(organizationId, userId, postId);
  if (!hasAccess) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // Fetch caller's submission
  const [submission] = await db
    .select()
    .from(contentSubmission)
    .where(
      and(
        eq(contentSubmission.postId, postId),
        eq(contentSubmission.submittedByUserId, userId),
      ),
    )
    .limit(1);

  if (!submission) {
    return NextResponse.json({ submission: null, attachments: [] });
  }

  const attachments = await db
    .select()
    .from(contentSubmissionAttachment)
    .where(eq(contentSubmissionAttachment.submissionId, submission.id));

  return NextResponse.json({
    submission: {
      ...submission,
      submittedAt: submission.createdAt,
    },
    attachments,
  });
}
