import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import {
  contentPost,
  contentPostAttachment,
  contentDocumentChunk,
  certeSubscription,
  user,
} from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { checkAudienceAccess } from "@/lib/content-audience";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    let access;
    try {
      access = await requireAccess({
        scope: "organization",
        allowedOrgRoles: ["PARENT", "GENERAL", "OWNER", "MANAGEMENT", "ADMIN", "OPERATOR"],
      });
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        return new Response(
          JSON.stringify({ error: error.message, code: error.code }),
          { status: error.status, headers: { "Content-Type": "application/json" } },
        );
      }
      throw error;
    }

    const userId = access.actorUserId;
    const orgId = access.activeOrganizationId!;
    const { id: postId } = await params;

    // Certe+ check
    const now = new Date();
    const [activeSub] = await db
      .select({ id: certeSubscription.id })
      .from(certeSubscription)
      .where(
        and(
          eq(certeSubscription.parentId, userId),
          eq(certeSubscription.status, "ACTIVE"),
          gte(certeSubscription.endDate, now),
        ),
      )
      .limit(1);

    if (!activeSub) {
      return new Response(
        JSON.stringify({ error: "Certe+ subscription required", code: "SUBSCRIPTION_REQUIRED" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // Fetch post
    const [post] = await db
      .select({
        id: contentPost.id,
        title: contentPost.title,
        body: contentPost.body,
        type: contentPost.type,
        dueAt: contentPost.dueAt,
        status: contentPost.status,
        authorUserId: contentPost.authorUserId,
      })
      .from(contentPost)
      .where(
        and(
          eq(contentPost.id, postId),
          eq(contentPost.organizationId, orgId),
        ),
      )
      .limit(1);

    if (!post) {
      return new Response(JSON.stringify({ error: "Post not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check audience access
    if (post.authorUserId !== userId) {
      const hasAccess = await checkAudienceAccess(orgId, userId, postId);
      if (!hasAccess) {
        return new Response(JSON.stringify({ error: "Access denied" }), {
          status: 403, headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Get author
    const [author] = await db.select({ name: user.name }).from(user).where(eq(user.id, post.authorUserId)).limit(1);

    // Get attachments count
    const attachments = await db
      .select({ id: contentPostAttachment.id, mimeType: contentPostAttachment.mimeType })
      .from(contentPostAttachment)
      .where(eq(contentPostAttachment.postId, postId));

    // Get document chunks
    const chunks = await db
      .select({ content: contentDocumentChunk.content, metadata: contentDocumentChunk.metadata })
      .from(contentDocumentChunk)
      .where(eq(contentDocumentChunk.postId, postId))
      .orderBy(contentDocumentChunk.chunkIndex);

    const docContent = chunks.map((c) => {
      const meta = c.metadata as { filename?: string } | null;
      return meta?.filename ? `[${meta.filename}]\n${c.content}` : c.content;
    }).join("\n\n");

    const fullContent = [
      `# ${post.title}`,
      `Type: ${post.type} | Author: ${author?.name ?? "Unknown"}${post.dueAt ? ` | Due: ${new Date(post.dueAt).toLocaleDateString("en-IN")}` : ""}`,
      "",
      post.body,
      docContent ? `\n--- Attached Documents ---\n\n${docContent}` : "",
      attachments.length > 0 ? `\n${attachments.length} file(s) attached.` : "",
    ].filter(Boolean).join("\n");

    // Call Anthropic for summary
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: `You are a helpful assistant that summarizes educational content. Provide a clear, concise summary with:
1. **Overview** — 1-2 sentence summary
2. **Key Points** — bullet list of main points
3. **Action Items** — what the student needs to do (for assignments)

Be brief and student-friendly. Format with Markdown. Reply in the language of the content.`,
      messages: [
        { role: "user", content: `Summarize this ${post.type.toLowerCase()}:\n\n${fullContent}` },
      ],
    });

    const summary = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return new Response(
      JSON.stringify({ summary }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[post-summarize] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
