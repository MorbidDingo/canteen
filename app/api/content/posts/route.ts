import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contentPost,
  contentPostAudience,
  contentPostTag,
  contentSubmission,
  contentTag,
  contentFolder,
  contentFolderAudience,
  user,
} from "@/lib/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getContentPermission } from "@/lib/content-permission";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// POST — create a new content post
export async function POST(request: NextRequest) {
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

  const body = await request.json();
  const { type, title, body: postBody, dueAt, audience, tagIds, folderId } = body as {
    type?: string;
    title?: string;
    body?: string;
    dueAt?: string | null;
    audience?: Array<{
      audienceType: string;
      className?: string;
      section?: string;
      userId?: string;
      groupId?: string;
    }>;
    tagIds?: string[];
    folderId?: string;
  };

  if (!type || !["ASSIGNMENT", "NOTE"].includes(type)) {
    return NextResponse.json({ error: "type must be ASSIGNMENT or NOTE" }, { status: 400 });
  }

  // Check permission
  const perm = await getContentPermission(
    organizationId,
    access.actorUserId,
    type as "ASSIGNMENT" | "NOTE",
  );
  if (!perm) {
    return NextResponse.json({ error: "You do not have permission to post this content type" }, { status: 403 });
  }

  if (!title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!postBody?.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  // Check for duplicate title within the same org + type + author
  const [existing] = await db
    .select({ id: contentPost.id })
    .from(contentPost)
    .where(
      and(
        eq(contentPost.organizationId, organizationId),
        eq(contentPost.authorUserId, access.actorUserId),
        eq(contentPost.type, type as "ASSIGNMENT" | "NOTE"),
        sql`lower(${contentPost.title}) = lower(${title.trim()})`,
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: `A ${type.toLowerCase()} with this title already exists` },
      { status: 409 },
    );
  }

  if (!audience || audience.length === 0) {
    // If folderId is provided, inherit audience from folder
    if (folderId) {
      // Verify folder exists and belongs to the same org
      const [folder] = await db
        .select({ id: contentFolder.id })
        .from(contentFolder)
        .where(
          and(
            eq(contentFolder.id, folderId),
            eq(contentFolder.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }

      // Get folder's audience to copy to the post
      const folderAudiences = await db
        .select()
        .from(contentFolderAudience)
        .where(eq(contentFolderAudience.folderId, folderId));

      if (folderAudiences.length === 0) {
        return NextResponse.json({ error: "Folder has no audience targets configured" }, { status: 400 });
      }

      // Use folder audiences as post audiences
      const result = await db.transaction(async (tx) => {
        const [post] = await tx
          .insert(contentPost)
          .values({
            organizationId,
            authorUserId: access.actorUserId,
            folderId,
            type: type as "ASSIGNMENT" | "NOTE",
            title: title.trim(),
            body: postBody.trim(),
            dueAt: dueAt ? new Date(dueAt) : null,
            status: "DRAFT",
          })
          .returning();

        // Copy folder audience to post audience
        await tx.insert(contentPostAudience).values(
          folderAudiences.map((a) => ({
            postId: post.id,
            audienceType: a.audienceType,
            className: a.className,
            section: a.section,
            userId: a.userId,
            groupId: a.groupId,
          })),
        );

        // Insert tag links
        if (tagIds && tagIds.length > 0) {
          await tx.insert(contentPostTag).values(
            tagIds.map((tagId) => ({ postId: post.id, tagId })),
          );
        }

        return post;
      });

      logAudit({
        organizationId,
        userId: access.actorUserId,
        userRole: access.membershipRole ?? access.session.user.role,
        action: AUDIT_ACTIONS.CONTENT_POST_CREATED,
        details: { postId: result.id, type: result.type, title: result.title, folderId },
        request,
      });

      return NextResponse.json({ post: result }, { status: 201 });
    }

    return NextResponse.json({ error: "At least one audience target is required" }, { status: 400 });
  }

  // Validate audience rows
  const validAudienceTypes = ["ALL_ORG", "CLASS", "SECTION", "USER", "GROUP"];
  for (const a of audience) {
    if (!validAudienceTypes.includes(a.audienceType)) {
      return NextResponse.json({ error: `Invalid audienceType: ${a.audienceType}` }, { status: 400 });
    }
    if (a.audienceType === "CLASS" && !a.className) {
      return NextResponse.json({ error: "CLASS audience requires className" }, { status: 400 });
    }
    if (a.audienceType === "SECTION" && (!a.className || !a.section)) {
      return NextResponse.json({ error: "SECTION audience requires className and section" }, { status: 400 });
    }
    if (a.audienceType === "USER" && !a.userId) {
      return NextResponse.json({ error: "USER audience requires userId" }, { status: 400 });
    }
    if (a.audienceType === "GROUP" && !a.groupId) {
      return NextResponse.json({ error: "GROUP audience requires groupId" }, { status: 400 });
    }
  }

  const result = await db.transaction(async (tx) => {
    const [post] = await tx
      .insert(contentPost)
      .values({
        organizationId,
        authorUserId: access.actorUserId,
        folderId: folderId || null,
        type: type as "ASSIGNMENT" | "NOTE",
        title: title.trim(),
        body: postBody.trim(),
        dueAt: dueAt ? new Date(dueAt) : null,
        status: "DRAFT",
      })
      .returning();

    // Insert audience rows
    await tx.insert(contentPostAudience).values(
      audience.map((a) => ({
        postId: post.id,
        audienceType: a.audienceType as "ALL_ORG" | "CLASS" | "SECTION" | "USER" | "GROUP",
        className: a.className || null,
        section: a.section || null,
        userId: a.userId || null,
        groupId: a.groupId || null,
      })),
    );

    // Insert tag links
    if (tagIds && tagIds.length > 0) {
      await tx.insert(contentPostTag).values(
        tagIds.map((tagId) => ({ postId: post.id, tagId })),
      );
    }

    return post;
  });

  logAudit({
    organizationId,
    userId: access.actorUserId,
    userRole: access.membershipRole ?? access.session.user.role,
    action: AUDIT_ACTIONS.CONTENT_POST_CREATED,
    details: { postId: result.id, type: result.type, title: result.title },
    request,
  });

  return NextResponse.json({ post: result }, { status: 201 });
}

// GET — list caller's own posts with submission counts
export async function GET(request: NextRequest) {
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

  // Must have some content permission
  const perm = await getContentPermission(organizationId, access.actorUserId);
  const hasPermission = perm !== null;

  const { searchParams } = new URL(request.url);
  const tagId = searchParams.get("tagId");
  const typeFilter = searchParams.get("type");

  const posts = await db
    .select({
      id: contentPost.id,
      type: contentPost.type,
      title: contentPost.title,
      status: contentPost.status,
      dueAt: contentPost.dueAt,
      createdAt: contentPost.createdAt,
      updatedAt: contentPost.updatedAt,
      submissionCount: count(contentSubmission.id),
    })
    .from(contentPost)
    .leftJoin(contentSubmission, eq(contentSubmission.postId, contentPost.id))
    .where(
      and(
        eq(contentPost.organizationId, organizationId),
        eq(contentPost.authorUserId, access.actorUserId),
        typeFilter && ["ASSIGNMENT", "NOTE"].includes(typeFilter)
          ? eq(contentPost.type, typeFilter as "ASSIGNMENT" | "NOTE")
          : undefined,
        tagId
          ? sql`${contentPost.id} IN (SELECT ${contentPostTag.postId} FROM ${contentPostTag} WHERE ${contentPostTag.tagId} = ${tagId})`
          : undefined,
      ),
    )
    .groupBy(contentPost.id)
    .orderBy(sql`${contentPost.createdAt} DESC`);

  return NextResponse.json({
    posts,
    hasPermission,
    permissionScope: perm?.scope ?? null,
  });
}
