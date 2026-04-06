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

// Rate limit: 20 messages per post per user per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

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

    // Rate limit
    if (!checkRateLimit(`${userId}:${postId}`)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later.", code: "RATE_LIMITED" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
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
      return new Response(
        JSON.stringify({ error: "Post not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check audience access (unless author)
    if (post.authorUserId !== userId) {
      const hasAccess = await checkAudienceAccess(orgId, userId, postId);
      if (!hasAccess) {
        return new Response(
          JSON.stringify({ error: "You don't have access to this post" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Get author name
    const [author] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, post.authorUserId))
      .limit(1);

    // Get attachments
    const attachments = await db
      .select({
        id: contentPostAttachment.id,
        mimeType: contentPostAttachment.mimeType,
        size: contentPostAttachment.size,
      })
      .from(contentPostAttachment)
      .where(eq(contentPostAttachment.postId, postId));

    // Get all document chunks (the full extracted text)
    const chunks = await db
      .select({
        content: contentDocumentChunk.content,
        chunkIndex: contentDocumentChunk.chunkIndex,
        metadata: contentDocumentChunk.metadata,
      })
      .from(contentDocumentChunk)
      .where(eq(contentDocumentChunk.postId, postId))
      .orderBy(contentDocumentChunk.chunkIndex);

    // Build system prompt with full post context
    const docContent = chunks.length > 0
      ? chunks
          .map((c) => {
            const meta = c.metadata as { filename?: string } | null;
            const label = meta?.filename ? ` (from ${meta.filename})` : "";
            return `--- Document chunk${label} ---\n${c.content}`;
          })
          .join("\n\n")
      : "";

    const systemPrompt = `You are an AI assistant helping a student/parent understand a specific ${post.type.toLowerCase()}.

## Context

**Title:** ${post.title}
**Type:** ${post.type}
**Author:** ${author?.name ?? "Unknown"}
**Status:** ${post.status}${post.dueAt ? `\n**Due Date:** ${new Date(post.dueAt).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}` : ""}

**Content:**
${post.body}

${docContent ? `## Attached Documents\n\n${docContent}` : ""}
${attachments.length > 0 ? `\n## Attachments\n${attachments.length} file(s) attached (${attachments.map((a) => a.mimeType).join(", ")})` : ""}

## Instructions
- Only answer questions about THIS specific ${post.type.toLowerCase()}. Do not discuss other topics.
- If the user asks about something unrelated, politely redirect them to the general AI assistant.
- Be concise and helpful. Use the document content to provide accurate answers.
- If summarizing, provide a clear, structured summary with key points.
- For assignments, help the student understand the requirements and expectations.
- For notes, help explain concepts and answer questions about the material.
- Reply in the same language the user uses (Hindi, English, or mixed).
- Format using Markdown when helpful.`;

    // Parse messages
    const body = await request.json();
    const messages: Anthropic.MessageParam[] = body.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const trimmedMessages = messages.slice(-20);

    // Call Anthropic
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: trimmedMessages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Stream as SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[post-chat] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
