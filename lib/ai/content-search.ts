import { db } from "@/lib/db";
import {
  contentPost,
  contentPostAudience,
  contentGroupMember,
  child,
  user,
} from "@/lib/db/schema";
import { eq, and, inArray, sql, or } from "drizzle-orm";
import { generateQueryEmbedding } from "./content-embeddings";
import { checkSearchRateLimit, logAiUsage } from "./usage";

// ─── Audience-scoped post ID resolution ──────────────────────────────

/**
 * Resolve all post IDs that a user can access within an organization.
 * Mirrors the feed API's audience resolution logic.
 * Includes:
 *  - Posts authored by the user
 *  - Posts with ALL_ORG audience
 *  - Posts directly targeted to the user
 *  - Posts targeting any of the user's children's class/section
 *  - Posts targeting any group the user belongs to
 */
export async function getAccessiblePostIds(
  organizationId: string,
  userId: string,
  options?: { type?: "ASSIGNMENT" | "NOTE" },
): Promise<string[]> {
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
  const audienceConditions: ReturnType<typeof and>[] = [];

  audienceConditions.push(eq(contentPostAudience.audienceType, "ALL_ORG"));

  audienceConditions.push(
    and(
      eq(contentPostAudience.audienceType, "USER"),
      eq(contentPostAudience.userId, userId),
    )!,
  );

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

  if (groupIds.length > 0) {
    audienceConditions.push(
      and(
        eq(contentPostAudience.audienceType, "GROUP"),
        inArray(contentPostAudience.groupId, groupIds),
      )!,
    );
  }

  // 4. Query matching post IDs (PUBLISHED + audience match)
  const typeCondition =
    options?.type && ["ASSIGNMENT", "NOTE"].includes(options.type)
      ? eq(contentPost.type, options.type)
      : undefined;

  const audienceMatched = await db
    .selectDistinct({ postId: contentPostAudience.postId })
    .from(contentPostAudience)
    .innerJoin(contentPost, eq(contentPostAudience.postId, contentPost.id))
    .where(
      and(
        eq(contentPost.organizationId, organizationId),
        eq(contentPost.status, "PUBLISHED"),
        or(...audienceConditions),
        typeCondition,
      ),
    );

  // 5. Also include user's own posts (author always has access)
  const ownPosts = await db
    .selectDistinct({ postId: contentPost.id })
    .from(contentPost)
    .where(
      and(
        eq(contentPost.organizationId, organizationId),
        eq(contentPost.authorUserId, userId),
        typeCondition ?? undefined,
      ),
    );

  const postIdSet = new Set([
    ...audienceMatched.map((r) => r.postId),
    ...ownPosts.map((r) => r.postId),
  ]);

  return Array.from(postIdSet);
}

// ─── Vector search ───────────────────────────────────────────────────

interface ContentSearchResult {
  chunkId: string;
  postId: string;
  attachmentId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
  metadata: { page?: number; section?: string; filename?: string };
  // Hydrated post info for citations
  postTitle: string;
  postType: "ASSIGNMENT" | "NOTE";
  authorName: string;
}

interface ContentSearchOptions {
  topK?: number;
  similarityThreshold?: number;
  type?: "ASSIGNMENT" | "NOTE";
}

/**
 * Audience-scoped vector similarity search over content document chunks.
 * Only returns chunks from posts the user has access to.
 */
export async function queryContentChunks(
  organizationId: string,
  userId: string,
  query: string,
  options?: ContentSearchOptions,
): Promise<ContentSearchResult[]> {
  // Rate limit: 20 searches/hr/user
  if (!checkSearchRateLimit(userId)) {
    throw new Error("Search rate limit exceeded (20/hour). Please try again later.");
  }

  const topK = options?.topK ?? 5;
  const threshold = options?.similarityThreshold ?? 0.7;

  // 1. Resolve accessible post IDs
  const accessiblePostIds = await getAccessiblePostIds(
    organizationId,
    userId,
    { type: options?.type },
  );

  if (accessiblePostIds.length === 0) return [];

  // 2. Generate query embedding
  const queryEmbedding = await generateQueryEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // 3. Execute vector similarity search with audience scoping
  const results = await db.execute<{
    id: string;
    post_id: string;
    attachment_id: string;
    chunk_index: number;
    content: string;
    similarity: number;
    metadata: { page?: number; section?: string; filename?: string };
    post_title: string;
    post_type: "ASSIGNMENT" | "NOTE";
    author_name: string;
  }>(sql`
    SELECT
      c.id,
      c.post_id,
      c.attachment_id,
      c.chunk_index,
      c.content,
      1 - (c.embedding <=> ${embeddingStr}::vector) AS similarity,
      c.metadata,
      p.title AS post_title,
      p.type AS post_type,
      u.name AS author_name
    FROM content_document_chunk c
    INNER JOIN content_post p ON p.id = c.post_id
    INNER JOIN "user" u ON u.id = p.author_user_id
    WHERE c.organization_id = ${organizationId}
      AND c.post_id = ANY(${accessiblePostIds}::text[])
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> ${embeddingStr}::vector) > ${threshold}
    ORDER BY c.embedding <=> ${embeddingStr}::vector
    LIMIT ${topK}
  `);

  const mapped = results.rows.map((r) => ({
    chunkId: r.id,
    postId: r.post_id,
    attachmentId: r.attachment_id,
    chunkIndex: r.chunk_index,
    content: r.content,
    similarity: r.similarity,
    metadata: r.metadata ?? {},
    postTitle: r.post_title,
    postType: r.post_type,
    authorName: r.author_name,
  }));

  // Log usage (fire-and-forget)
  logAiUsage({
    userId,
    organizationId,
    type: "SEARCH",
    tokens: 0, // search queries use minimal tokens
    metadata: { query, resultsCount: mapped.length },
  });

  return mapped;
}
