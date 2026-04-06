import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentPost, contentPostAttachment } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// DELETE — remove an attachment from a post
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attId: string }> },
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
  const { id: postId, attId } = await params;

  // Verify post ownership
  const [post] = await db
    .select({ id: contentPost.id })
    .from(contentPost)
    .where(
      and(
        eq(contentPost.id, postId),
        eq(contentPost.organizationId, organizationId),
        eq(contentPost.authorUserId, access.actorUserId),
      ),
    )
    .limit(1);

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const [attachment] = await db
    .select()
    .from(contentPostAttachment)
    .where(
      and(
        eq(contentPostAttachment.id, attId),
        eq(contentPostAttachment.postId, postId),
      ),
    )
    .limit(1);

  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  // TODO: Delete from S3/Cloudinary storage (best-effort, non-blocking)
  // For S3: deleteFileFromS3(attachment.storageKey)
  // For Cloudinary: cloudinary.v2.uploader.destroy(publicId)

  await db.delete(contentPostAttachment).where(eq(contentPostAttachment.id, attId));

  return NextResponse.json({ success: true });
}
