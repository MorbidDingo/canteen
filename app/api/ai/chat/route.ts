import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { child, certeSubscription } from "@/lib/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import {
  getSession,
  AccessDeniedError,
  requireAccess,
} from "@/lib/auth-server";
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "@/lib/ai/tools";
import { buildSystemPromptContext, buildSystemPrompt } from "@/lib/ai/system-prompt";

// ─── Rate Limiting (in-memory, per-instance) ─────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // messages per hour
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

// ─── POST Handler ────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    let access;
    try {
      access = await requireAccess({
        scope: "organization",
        allowedOrgRoles: ["PARENT", "GENERAL"],
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
          message: "Upgrade to Certe+ to use the AI assistant.",
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
    const body = await request.json();
    const messages: Anthropic.MessageParam[] = body.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Limit conversation history to prevent token bloat
    const trimmedMessages = messages.slice(-20);

    // 5. Build context
    const children = await db
      .select({ id: child.id })
      .from(child)
      .where(eq(child.parentId, userId));

    const childIds = children.map((c) => c.id);

    const toolCtx: ToolContext = { userId, orgId, childIds };

    const promptCtx = await buildSystemPromptContext(
      userId,
      session.user.name,
      session.user.role ?? "PARENT",
      orgId,
    );
    const systemPrompt = buildSystemPrompt(promptCtx);

    // 6. Create Anthropic client and stream
    const anthropic = new Anthropic();

    // Use a non-streaming approach with tool-use loop, then stream the final response
    // This handles the tool-use round trips server-side
    const allMessages: Anthropic.MessageParam[] = [...trimmedMessages];
    let finalResponse = "";
    const MAX_TOOL_ROUNDS = 8;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOL_DEFINITIONS,
        messages: allMessages,
      });

      // Process the response
      if (response.stop_reason === "end_turn") {
        // Extract text from content blocks
        finalResponse = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");
        break;
      }

      if (response.stop_reason === "tool_use") {
        // Add assistant's response (with tool_use blocks) to conversation
        allMessages.push({ role: "assistant", content: response.content });

        // Execute each tool call
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            const result = await executeTool(
              block.name,
              block.input as Record<string, unknown>,
              toolCtx,
            );
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        // Add tool results to conversation
        allMessages.push({ role: "user", content: toolResults });
        continue;
      }

      // Unexpected stop reason — extract any text and break
      finalResponse = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      break;
    }

    // 7. Parse structured actions from the response
    const { cleanText, actions } = parseActions(finalResponse);

    // 8. Stream the final response using SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send the complete response as a single SSE event
        // Client can process it as streaming for a consistent UX
        const chunks = chunkText(cleanText, 20);
        let index = 0;

        function sendNext() {
          if (index < chunks.length) {
            const data = JSON.stringify({ type: "text", text: chunks[index] });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            index++;
            // Small delay between chunks for streaming effect
            if (index < chunks.length) {
              setTimeout(sendNext, 15);
            } else {
              // Send actions before done
              if (actions.length > 0) {
                const actionsData = JSON.stringify({ type: "actions", actions });
                controller.enqueue(encoder.encode(`data: ${actionsData}\n\n`));
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
              controller.close();
            }
          }
        }

        sendNext();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process chat request" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * Parse structured action markers from Claude's response text.
 * Returns clean text (markers removed) and extracted actions.
 */
type ChatAction =
  | { type: "menu_items"; items: Array<Record<string, unknown>> }
  | { type: "topup"; amount: number }
  | { type: "control"; controlType: string; value: string };

function parseActions(text: string): { cleanText: string; actions: ChatAction[] } {
  const actions: ChatAction[] = [];
  let cleanText = text;

  // Parse [[MENU_ITEMS]]...[json]...[[/MENU_ITEMS]]
  const menuRegex = /\[\[MENU_ITEMS\]\]\s*\n?([\s\S]*?)\n?\[\[\/MENU_ITEMS\]\]/g;
  let match;
  while ((match = menuRegex.exec(text)) !== null) {
    try {
      const items = JSON.parse(match[1].trim());
      if (Array.isArray(items)) {
        actions.push({ type: "menu_items", items });
      }
    } catch {
      // Skip invalid JSON
    }
    cleanText = cleanText.replace(match[0], "").trim();
  }

  // Parse [[TOPUP:amount]]
  const topupRegex = /\[\[TOPUP:(\d+)\]\]/g;
  while ((match = topupRegex.exec(text)) !== null) {
    actions.push({ type: "topup", amount: parseInt(match[1], 10) });
    cleanText = cleanText.replace(match[0], "").trim();
  }

  // Parse [[CONTROL:type:value]]
  const controlRegex = /\[\[CONTROL:([^:]+):([^\]]+)\]\]/g;
  while ((match = controlRegex.exec(text)) !== null) {
    actions.push({ type: "control", controlType: match[1], value: match[2] });
    cleanText = cleanText.replace(match[0], "").trim();
  }

  return { cleanText: cleanText.trim(), actions };

  // Clean up extra newlines
  cleanText = cleanText.replace(/\n{3,}/g, "\n\n").trim();

  return { cleanText, actions };
}

/**
 * Split text into word-boundary-aware chunks for simulated streaming.
 */
function chunkText(text: string, avgWordsPerChunk: number): string[] {
  const words = text.split(/(\s+)/);
  const chunks: string[] = [];
  let current = "";
  let wordCount = 0;

  for (const word of words) {
    current += word;
    if (word.trim()) wordCount++;

    if (wordCount >= avgWordsPerChunk) {
      chunks.push(current);
      current = "";
      wordCount = 0;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [text];
}
