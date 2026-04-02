import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contentPost,
  contentPostAttachment,
  contentPostAudience,
  contentPostTag,
  contentTag,
  contentGroupMember,
  child,
  user,
} from "@/lib/db/schema";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getContentPermission } from "@/lib/content-permission";
import { checkAudienceAccess } from "@/lib/content-audience";

// GET — get a single post (author view OR reader view with audience verification)
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
  const { id } = await params;

  // Fetch post (org-scoped, no author filter)
  const [post] = await db
    .select()
    .from(contentPost)
    .where(
      and(
        eq(contentPost.id, id),
        eq(contentPost.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const isAuthor = post.authorUserId === userId;

  // If not the author, verify audience access and only show PUBLISHED posts
  if (!isAuthor) {
    if (post.status !== "PUBLISHED") {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const hasAccess = await checkAudienceAccess(organizationId, userId, id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
  }

  const [attachments, tags] = await Promise.all([
    db
      .select()
      .from(contentPostAttachment)
      .where(eq(contentPostAttachment.postId, id)),
    db
      .select({ id: contentTag.id, name: contentTag.name, color: contentTag.color })
      .from(contentPostTag)
      .innerJoin(contentTag, eq(contentPostTag.tagId, contentTag.id))
      .where(eq(contentPostTag.postId, id)),
  ]);

  // Author gets audiences; readers don't
  if (isAuthor) {
    const audiences = await db
      .select()
      .from(contentPostAudience)
      .where(eq(contentPostAudience.postId, id));

    return NextResponse.json({ post, attachments, audiences, tags });
  }

  // Fetch author name for reader view
  const [author] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, post.authorUserId))
    .limit(1);

  return NextResponse.json({
    post: { ...post, authorName: author?.name ?? null },
    attachments,
    tags,
  });
}

// PATCH — edit post
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
  const { id } = await params;

  const [post] = await db
    .select()
    .from(contentPost)
    .where(
      and(
        eq(contentPost.id, id),
        eq(contentPost.organizationId, organizationId),
        eq(contentPost.authorUserId, access.actorUserId),
      ),
    )
    .limit(1);

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const body = await request.json();
  const { title, body: postBody, dueAt, status, tagIds } = body as {
    title?: string;
    body?: string;
    dueAt?: string | null;
    status?: string;
    tagIds?: string[];
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (title !== undefined) {
    if (!title.trim()) {
      return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    }
    updates.title = title.trim();
  }

  if (postBody !== undefined) {
    // Cannot edit body of a CLOSED assignment
    if (post.status === "CLOSED" && post.type === "ASSIGNMENT") {
      return NextResponse.json(
        { error: "Cannot edit body of a closed assignment" },
        { status: 400 },
      );
    }
    updates.body = postBody.trim();
  }

  if (dueAt !== undefined) {
    updates.dueAt = dueAt ? new Date(dueAt) : null;
  }

  if (status !== undefined) {
    if (!["DRAFT", "PUBLISHED", "CLOSED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = status;
  }

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(contentPost)
      .set(updates)
      .where(eq(contentPost.id, id))
      .returning();

    // Replace tags if provided
    if (tagIds !== undefined) {
      await tx.delete(contentPostTag).where(eq(contentPostTag.postId, id));
      if (tagIds.length > 0) {
        await tx.insert(contentPostTag).values(
          tagIds.map((tagId) => ({ postId: id, tagId })),
        );
      }
    }

    return updated;
  });

  return NextResponse.json({ post: result });
}

// DELETE — delete post (cascade removes attachments, audience, submissions)
export async function DELETE(
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
  const { id } = await params;

  const [post] = await db
    .select({ id: contentPost.id })
    .from(contentPost)
    .where(
      and(
        eq(contentPost.id, id),
        eq(contentPost.organizationId, organizationId),
        eq(contentPost.authorUserId, access.actorUserId),
      ),
    )
    .limit(1);

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  await db.delete(contentPost).where(eq(contentPost.id, id));

  return NextResponse.json({ success: true });
}
