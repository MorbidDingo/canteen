import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { certeSubscription, aiUsageLog } from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";
import {
  getSession,
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
    "You are a writing assistant for a school communication platform. Improve the writing quality, clarity, and flow while preserving the original meaning and voice. Output only the improved text, no explanations.",
  continue:
    "You are a writing assistant for a school communication platform. Continue writing from where the text left off, matching the style and tone. Write 2-3 natural paragraphs. Output only the continuation text.",
  summarize:
    "You are a writing assistant for a school communication platform. Create a concise summary of the following text, capturing the key points. Output only the summary.",
  expand:
    "You are a writing assistant for a school communication platform. Expand on the given text with more detail, examples, and explanation while maintaining the same style. Output only the expanded text.",
  shorten:
    "You are a writing assistant for a school communication platform. Make the text more concise without losing the core message. Aim for 50% reduction. Output only the shortened text.",
  fix_grammar:
    "You are a writing assistant. Fix all grammar, spelling, and punctuation errors. Output only the corrected text, nothing else.",
  simplify:
    "You are a writing assistant for a school communication platform. Rewrite in simpler language suitable for parents and students. Use shorter sentences. Output only the simplified text.",
  translate:
    "You are a professional translator. Translate the text accurately while preserving formatting, tone, and meaning. Output only the translated text.",
  change_tone:
    "You are a writing assistant. Rewrite the text in the requested tone while preserving the content and meaning. Output only the rewritten text.",
  generate_quiz:
    "You are an educational content creator. Generate 5 multiple-choice questions based on this content. Format each question with a number, the question text, options labeled (a) through (d), and indicate the correct answer. Output the quiz only.",
  explain_concept:
    "You are a teacher. Explain the key concepts in this text in a simple, educational way suitable for students. Use examples where helpful. Output only the explanation.",
  custom:
    "You are a writing assistant for a school communication platform. Follow the user's instruction precisely. Output only the result.",
};

// ─── Types ───────────────────────────────────────────────

interface EditorAIRequest {
  action: string;
  selectedText?: string;
  fullContent?: string;
  customPrompt?: string;
  targetLanguage?: string;
  tone?: string;
  context?: {
    postType?: "ASSIGNMENT" | "NOTE";
    title?: string;
    audience?: string;
  };
}

// ─── POST Handler ────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    let access;
    try {
      access = await requireAccess({
        scope: "organization",
        allowedOrgRoles: [
          "OWNER",
          "ADMIN",
          "MANAGEMENT",
          "OPERATOR",
          "PARENT",
          "GENERAL",
        ],
      });
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        return new Response(
          JSON.stringify({ error: error.message, code: error.code }),
          {
            status: error.status,
            headers: { "Content-Type": "application/json" },
          },
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
          message: "Upgrade to Certe+ to use AI writing assistance.",
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

    // 4. Parse request body
    const body: EditorAIRequest = await request.json();
    const {
      action,
      selectedText,
      fullContent,
      customPrompt,
      targetLanguage,
      tone,
      context,
    } = body;

    if (!action || !SYSTEM_PROMPTS[action]) {
      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!selectedText && !fullContent && action !== "custom") {
      return new Response(
        JSON.stringify({ error: "No text provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 5. Build prompt
    let systemPrompt = SYSTEM_PROMPTS[action];

    if (action === "translate" && targetLanguage) {
      systemPrompt = systemPrompt.replace(
        "the text",
        `the text to ${targetLanguage}`,
      );
    }

    if (action === "change_tone" && tone) {
      systemPrompt = systemPrompt.replace("the requested tone", `a ${tone} tone`);
    }

    // Add context if provided
    if (context) {
      const contextParts: string[] = [];
      if (context.postType) {
        contextParts.push(
          `This is a school ${context.postType.toLowerCase()}.`,
        );
      }
      if (context.title) {
        contextParts.push(`Title: "${context.title}".`);
      }
      if (context.audience) {
        contextParts.push(`Audience: ${context.audience}.`);
      }
      if (contextParts.length > 0) {
        systemPrompt += "\n\nContext: " + contextParts.join(" ");
      }
    }

    // Build user message
    let userMessage = "";
    if (action === "custom" && customPrompt) {
      userMessage = customPrompt;
      if (selectedText) {
        userMessage += `\n\nText to work with:\n${selectedText}`;
      } else if (fullContent) {
        userMessage += `\n\nDocument content:\n${fullContent}`;
      }
    } else if (action === "continue") {
      userMessage = fullContent || selectedText || "";
    } else {
      userMessage = selectedText || fullContent || "";
    }

    // 6. Call Anthropic with streaming
    const anthropic = new Anthropic();
    const stream = anthropic.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    // 7. Create SSE response
    const encoder = new TextEncoder();
    let totalTokens = 0;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const data = JSON.stringify({
                type: "text",
                text: event.delta.text,
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }

            if (event.type === "message_delta" && event.usage) {
              totalTokens = event.usage.output_tokens;
            }
          }

          // Send done event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done" })}\n\n`,
            ),
          );
          controller.close();

          // Log usage (fire-and-forget)
          db.insert(aiUsageLog)
            .values({
              userId,
              organizationId: orgId,
              type: "CHAT",
              tokens: totalTokens,
              metadata: { source: "editor", action },
            })
            .catch((err: unknown) =>
              console.error("[ai-editor] Failed to log usage:", err),
            );
        } catch (err) {
          const errorData = JSON.stringify({
            type: "error",
            error: "AI generation failed",
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
          console.error("[ai-editor] Stream error:", err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[ai-editor] Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
