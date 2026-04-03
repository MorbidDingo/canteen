import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contentPost,
  contentPostAudience,
  contentPostTag,
  contentPostAttachment,
  contentSubmission,
  contentTag,
  contentGroupMember,
  child,
  user,
} from "@/lib/db/schema";
import { eq, and, inArray, sql, or } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getContentPermission } from "@/lib/content-permission";

// GET — content feed for the current user (audience-resolved)
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
  const userId = access.actorUserId;

  // Check if user has content creation permission
  const contentPerm = await getContentPermission(organizationId, userId);
  const canCreate = contentPerm !== null;
  const permissionScope: string | null = contentPerm?.scope ?? null;

  const { searchParams } = new URL(request.url);
  const tagFilter = searchParams.get("tagId");
  const typeFilter = searchParams.get("type");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  // 1. Resolve caller's children → (className, section) pairs
  const children = await db
    .select({ className: child.className, section: child.section })
    .from(child)
    .where(
      and(
        eq(child.parentId, userId),
        eq(child.organizationId, organizationId),
      ),
    );

  // 2. Resolve caller's group memberships
  const groupMemberships = await db
    .select({ groupId: contentGroupMember.groupId })
    .from(contentGroupMember)
    .where(eq(contentGroupMember.userId, userId));

  const groupIds = groupMemberships.map((g) => g.groupId);

  // 3. Build audience conditions
  // A post is visible if ANY of its audience rows match the caller
  const audienceConditions: ReturnType<typeof and>[] = [];

  // ALL_ORG — always matches
  audienceConditions.push(
    eq(contentPostAudience.audienceType, "ALL_ORG"),
  );

  // USER — direct targeting
  audienceConditions.push(
    and(
      eq(contentPostAudience.audienceType, "USER"),
      eq(contentPostAudience.userId, userId),
    )!,
  );

  // CLASS / SECTION — based on children's class/section
  for (const c of children) {
    if (c.className) {
      audienceConditions.push(
        and(
          eq(contentPostAudience.audienceType, "CLASS"),
          eq(contentPostAudience.className, c.className),
        )!,
      );

      if (c.section) {
        audienceConditions.push(
          and(
            eq(contentPostAudience.audienceType, "SECTION"),
            eq(contentPostAudience.className, c.className),
            eq(contentPostAudience.section, c.section),
          )!,
        );
      }
    }
  }

  // GROUP — based on group memberships
  if (groupIds.length > 0) {
    audienceConditions.push(
      and(
        eq(contentPostAudience.audienceType, "GROUP"),
        inArray(contentPostAudience.groupId, groupIds),
      )!,
    );
  }

  // 4. Query matching post IDs via audience table
  // We need distinct post IDs that are PUBLISHED and match audience
  const matchingPostIdsQuery = db
    .selectDistinct({ postId: contentPostAudience.postId })
    .from(contentPostAudience)
    .innerJoin(contentPost, eq(contentPostAudience.postId, contentPost.id))
    .where(
      and(
        eq(contentPost.organizationId, organizationId),
        eq(contentPost.status, "PUBLISHED"),
        or(...audienceConditions),
        // Apply tag filter at the post level if specified
        tagFilter
          ? sql`${contentPost.id} IN (
              SELECT ${contentPostTag.postId} FROM ${contentPostTag}
              WHERE ${contentPostTag.tagId} = ${tagFilter}
            )`
          : undefined,
        typeFilter && ["ASSIGNMENT", "NOTE"].includes(typeFilter)
          ? eq(contentPost.type, typeFilter as "ASSIGNMENT" | "NOTE")
          : undefined,
      ),
    );

  // Get total count for pagination
  const countResult = await db
    .select({ total: sql<number>`count(*)` })
    .from(matchingPostIdsQuery.as("matched"));

  const total = Number(countResult[0]?.total ?? 0);

  // Get paginated post IDs ordered by creation date
  const matchedPostIds = await db
    .select({ postId: sql<string>`"post_id"` })
    .from(
      db
        .selectDistinct({ post_id: contentPostAudience.postId })
        .from(contentPostAudience)
        .innerJoin(contentPost, eq(contentPostAudience.postId, contentPost.id))
        .where(
          and(
            eq(contentPost.organizationId, organizationId),
            eq(contentPost.status, "PUBLISHED"),
            or(...audienceConditions),
            tagFilter
              ? sql`${contentPost.id} IN (
                  SELECT ${contentPostTag.postId} FROM ${contentPostTag}
                  WHERE ${contentPostTag.tagId} = ${tagFilter}
                )`
              : undefined,
            typeFilter && ["ASSIGNMENT", "NOTE"].includes(typeFilter)
              ? eq(contentPost.type, typeFilter as "ASSIGNMENT" | "NOTE")
              : undefined,
          ),
        )
        .as("matched"),
    )
    .orderBy(sql`"post_id" DESC`)
    .limit(limit)
    .offset(offset);

  if (matchedPostIds.length === 0) {
    return NextResponse.json({ posts: [], total, page, limit, canCreate, permissionScope });
  }

  const postIds = matchedPostIds.map((r) => r.postId);

  // 5. Fetch full post data
  const posts = await db
    .select({
      id: contentPost.id,
      type: contentPost.type,
      title: contentPost.title,
      body: contentPost.body,
      dueAt: contentPost.dueAt,
      status: contentPost.status,
      createdAt: contentPost.createdAt,
      updatedAt: contentPost.updatedAt,
      authorUserId: contentPost.authorUserId,
      authorName: user.name,
    })
    .from(contentPost)
    .innerJoin(user, eq(contentPost.authorUserId, user.id))
    .where(inArray(contentPost.id, postIds))
    .orderBy(sql`${contentPost.createdAt} DESC`);

  // 6. Fetch tags for matched posts
  const postTags = await db
    .select({
      postId: contentPostTag.postId,
      tagId: contentTag.id,
      tagName: contentTag.name,
      tagColor: contentTag.color,
    })
    .from(contentPostTag)
    .innerJoin(contentTag, eq(contentPostTag.tagId, contentTag.id))
    .where(inArray(contentPostTag.postId, postIds));

  // 7. Check user's submissions (hasSubmitted boolean)
  const submissions = await db
    .select({
      postId: contentSubmission.postId,
    })
    .from(contentSubmission)
    .where(
      and(
        inArray(contentSubmission.postId, postIds),
        eq(contentSubmission.submittedByUserId, userId),
      ),
    );

  const submittedPostIds = new Set(submissions.map((s) => s.postId));

  // 8. Fetch attachments for matched posts
  const postAttachments = await db
    .select({
      id: contentPostAttachment.id,
      postId: contentPostAttachment.postId,
      storageBackend: contentPostAttachment.storageBackend,
      storageKey: contentPostAttachment.storageKey,
      mimeType: contentPostAttachment.mimeType,
      size: contentPostAttachment.size,
    })
    .from(contentPostAttachment)
    .where(inArray(contentPostAttachment.postId, postIds));

  // Group attachments by postId
  const attachmentsByPost = new Map<string, Array<{ id: string; mimeType: string; size: number }>>();
  for (const att of postAttachments) {
    const arr = attachmentsByPost.get(att.postId) || [];
    arr.push({ id: att.id, mimeType: att.mimeType, size: att.size });
    attachmentsByPost.set(att.postId, arr);
  }

  // Group tags by postId
  const tagsByPost = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
  for (const t of postTags) {
    const arr = tagsByPost.get(t.postId) || [];
    arr.push({ id: t.tagId, name: t.tagName, color: t.tagColor });
    tagsByPost.set(t.postId, arr);
  }

  // 9. Assemble response
  const feed = posts.map((p) => ({
    ...p,
    tags: tagsByPost.get(p.id) || [],
    hasSubmitted: submittedPostIds.has(p.id),
    attachments: attachmentsByPost.get(p.id) || [],
  }));

  return NextResponse.json({ posts: feed, total, page, limit, canCreate, permissionScope });
}
