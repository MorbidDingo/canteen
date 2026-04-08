import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { certeSubscription, aiUsageLog } from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";
import {
  AccessDeniedError,
  requireAccess,
} from "@/lib/auth-server";

// ─── Rate Limiting (in-memory, per-instance) ─────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // editor actions per hour
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// ─── System Prompts ──────────────────────────────────────

const SYSTEM_PROMPTS: Record<string, string> = {
  improve:
    "Improve the writing quality, clarity, and flow while preserving the original meaning and voice. Output only the improved text. Do not add any preamble or explanation.",
  continue:
    "Continue writing from where the text left off, matching the style and tone. Write 2-3 natural paragraphs. Output only the continuation text.",
  summarize:
    "Create a concise summary of the following text, capturing the key points. Output only the summary.",
  expand:
    "Expand on the given text with more detail, examples, and explanation while maintaining the same style. Output only the expanded text.",
  shorten:
    "Make the text more concise without losing the core message. Aim for 50% reduction. Output only the shortened text.",
  fix_grammar:
    "Fix all grammar, spelling, and punctuation errors. Output only the corrected text with no explanation.",
  simplify:
    "Rewrite in simpler language suitable for parents and students. Use shorter sentences. Output only the simplified text.",
  translate: "Translate to {targetLanguage}. Preserve formatting, tone, and meaning. Output only the translated text.",
  change_tone:
    "Rewrite in a {tone} tone while preserving the content and meaning. Output only the rewritten text.",
  generate_quiz:
    "Generate 5 multiple-choice questions based on this content. Format as a numbered list with options (a-d) and indicate the correct answer at the end of each question.",
  explain_concept:
    "Explain the key concepts in this text in a simple, educational way suitable for students. Use examples where helpful.",
  custom: "Follow the user's instruction precisely. Output only the result.",
};

// ─── POST Handler ────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    let access;
    try {
      access = await requireAccess({
        scope: "organization",
        allowedOrgRoles: ["PARENT", "GENERAL", "ADMIN", "MANAGEMENT", "OWNER"],
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

    const session = access.session;
    const userId = session.user.id;
    const orgId = access.activeOrganizationId!;

    // 2. Certe+ subscription check
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
        JSON.stringify({
          error: "Certe+ subscription required",
          code: "SUBSCRIPTION_REQUIRED",
          message: "Upgrade to Certe+ to use the AI writing assistant.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Rate limit check
    if (!checkRateLimit(userId)) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded. Please try again later.",
          code: "RATE_LIMITED",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    // 4. Parse request
    const body = await request.json();
    const {
      action,
      selectedText,
      fullContent,
      customPrompt,
      targetLanguage,
      tone,
    } = body;

    if (!action || !SYSTEM_PROMPTS[action]) {
      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 5. Build system prompt
    let systemPrompt = SYSTEM_PROMPTS[action];
    if (action === "translate" && targetLanguage) {
      systemPrompt = systemPrompt.replace("{targetLanguage}", targetLanguage);
    }
    if (action === "change_tone" && tone) {
      systemPrompt = systemPrompt.replace("{tone}", tone);
    }
    if (action === "custom" && customPrompt) {
      systemPrompt = `${systemPrompt}\n\nUser instruction: ${customPrompt}`;
    }

    // 6. Build user message
    const text = selectedText || fullContent || "";
    if (!text.trim() && action !== "continue") {
      return new Response(
        JSON.stringify({ error: "No text provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const userMessage =
      action === "continue"
        ? `Continue writing from the following text:\n\n${text}`
        : text;

    // 7. Stream response
    const anthropic = new Anthropic();
    const stream = anthropic.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    let totalTokens = 0;

    const responseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const data = JSON.stringify({ text: event.delta.text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
            if (event.type === "message_delta" && event.usage) {
              totalTokens = event.usage.output_tokens;
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          const errMsg =
            err instanceof Error ? err.message : "AI generation failed";
          const data = JSON.stringify({ error: errMsg });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } finally {
          controller.close();

          // Fire-and-forget usage logging
          db.insert(aiUsageLog)
            .values({
              userId,
              organizationId: orgId,
              type: "CHAT", // Using CHAT type since EDITOR may not exist in enum
              tokens: totalTokens,
              metadata: { action, source: "editor" },
            })
            .catch((err: unknown) =>
              console.error("[ai-editor] Usage log error:", err),
            );
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[ai-editor] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
