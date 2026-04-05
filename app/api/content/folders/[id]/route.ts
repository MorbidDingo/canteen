import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contentFolder,
  contentFolderAudience,
  contentPost,
  contentPostAudience,
  contentPostAttachment,
  contentPostTag,
  contentTag,
  contentSubmission,
  user,
} from "@/lib/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { checkAudienceAccess } from "@/lib/content-audience";

// GET — get folder detail with posts
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

  const [folder] = await db
    .select({
      id: contentFolder.id,
      name: contentFolder.name,
      description: contentFolder.description,
      authorUserId: contentFolder.authorUserId,
      createdAt: contentFolder.createdAt,
      updatedAt: contentFolder.updatedAt,
    })
    .from(contentFolder)
    .where(
      and(
        eq(contentFolder.id, id),
        eq(contentFolder.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  // Fetch author name
  const [author] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, folder.authorUserId))
    .limit(1);

  // Fetch audiences
  const audiences = await db
    .select()
    .from(contentFolderAudience)
    .where(eq(contentFolderAudience.folderId, id));

  // Fetch posts in this folder
  const posts = await db
    .select({
      id: contentPost.id,
      type: contentPost.type,
      title: contentPost.title,
      body: contentPost.body,
      dueAt: contentPost.dueAt,
      status: contentPost.status,
      createdAt: contentPost.createdAt,
      authorName: user.name,
    })
    .from(contentPost)
    .innerJoin(user, eq(contentPost.authorUserId, user.id))
    .where(
      and(
        eq(contentPost.folderId, id),
        eq(contentPost.organizationId, organizationId),
        // Non-authors can only see PUBLISHED posts
        folder.authorUserId !== userId
          ? eq(contentPost.status, "PUBLISHED")
          : undefined,
      ),
    )
    .orderBy(sql`${contentPost.createdAt} DESC`);

  // Fetch attachments for all posts
  const postIds = posts.map((p) => p.id);
  let attachmentsByPost = new Map<string, Array<{ id: string; mimeType: string; size: number }>>();

  if (postIds.length > 0) {
    const postAttachments = await db
      .select({
        id: contentPostAttachment.id,
        postId: contentPostAttachment.postId,
        mimeType: contentPostAttachment.mimeType,
        size: contentPostAttachment.size,
      })
      .from(contentPostAttachment)
      .where(inArray(contentPostAttachment.postId, postIds));

    for (const att of postAttachments) {
      const arr = attachmentsByPost.get(att.postId) || [];
      arr.push({ id: att.id, mimeType: att.mimeType, size: att.size });
      attachmentsByPost.set(att.postId, arr);
    }
  }

  const postsWithAttachments = posts.map((p) => ({
    ...p,
    attachments: attachmentsByPost.get(p.id) || [],
  }));

  return NextResponse.json({
    folder: { ...folder, authorName: author?.name ?? null },
    audiences,
    posts: postsWithAttachments,
  });
}

// PATCH — update folder (name, description, audiences)
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

  const [folder] = await db
    .select()
    .from(contentFolder)
    .where(
      and(
        eq(contentFolder.id, id),
        eq(contentFolder.organizationId, organizationId),
        eq(contentFolder.authorUserId, access.actorUserId),
      ),
    )
    .limit(1);

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const body = await request.json();
  const { name, description, audience } = body as {
    name?: string;
    description?: string;
    audience?: Array<{
      audienceType: string;
      className?: string;
      section?: string;
      userId?: string;
      groupId?: string;
    }>;
  };

  const result = await db.transaction(async (tx) => {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;

    const [updated] = await tx
      .update(contentFolder)
      .set(updates)
      .where(eq(contentFolder.id, id))
      .returning();

    // Replace audiences if provided
    if (audience !== undefined) {
      await tx.delete(contentFolderAudience).where(eq(contentFolderAudience.folderId, id));
      if (audience.length > 0) {
        await tx.insert(contentFolderAudience).values(
          audience.map((a) => ({
            folderId: id,
            audienceType: a.audienceType as "ALL_ORG" | "CLASS" | "SECTION" | "USER" | "GROUP",
            className: a.className || null,
            section: a.section || null,
            userId: a.userId || null,
            groupId: a.groupId || null,
          })),
        );
      }
    }

    return updated;
  });

  return NextResponse.json({ folder: result });
}

// DELETE — delete folder (posts inside become folder-less)
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

  const [folder] = await db
    .select({ id: contentFolder.id })
    .from(contentFolder)
    .where(
      and(
        eq(contentFolder.id, id),
        eq(contentFolder.organizationId, organizationId),
        eq(contentFolder.authorUserId, access.actorUserId),
      ),
    )
    .limit(1);

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  // Posts inside the folder will have folder_id set to NULL (ON DELETE SET NULL)
  await db.delete(contentFolder).where(eq(contentFolder.id, id));

  return NextResponse.json({ success: true });
}
