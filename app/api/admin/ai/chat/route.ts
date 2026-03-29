import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { ADMIN_TOOL_DEFINITIONS, executeAdminTool, type AdminToolContext } from "@/lib/ai/admin-tools";
import { buildAdminSystemPromptContext, buildAdminSystemPrompt } from "@/lib/ai/admin-system-prompt";

// Rate limiting (in-memory)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 50;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth - require ADMIN role
    let access;
    try {
      access = await requireAccess({
        scope: "organization",
        allowedOrgRoles: ["ADMIN"],
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

    // 2. Rate limit
    if (!checkRateLimit(userId)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", code: "RATE_LIMITED" }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Parse body
    const body = await request.json();
    const messages: Anthropic.MessageParam[] = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const trimmedMessages = messages.slice(-20);

    // 4. Build context
    const toolCtx: AdminToolContext = { userId, orgId };
    const promptCtx = await buildAdminSystemPromptContext(userId, session.user.name, orgId);
    const systemPrompt = buildAdminSystemPrompt(promptCtx);

    // 5. Tool-use loop (same as parent chat)
    const anthropic = new Anthropic();
    const allMessages: Anthropic.MessageParam[] = [...trimmedMessages];
    let finalResponse = "";
    const MAX_TOOL_ROUNDS = 8;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        tools: ADMIN_TOOL_DEFINITIONS,
        messages: allMessages,
      });

      if (response.stop_reason === "end_turn") {
        finalResponse = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");
        break;
      }

      if (response.stop_reason === "tool_use") {
        allMessages.push({ role: "assistant", content: response.content });
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type === "tool_use") {
            const result = await executeAdminTool(block.name, block.input as Record<string, unknown>, toolCtx);
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
          }
        }
        allMessages.push({ role: "user", content: toolResults });
        continue;
      }

      finalResponse = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
      break;
    }

    // 6. Stream response via SSE (simulated streaming)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const chunks = chunkText(finalResponse, 20);
        let index = 0;
        function sendNext() {
          if (index < chunks.length) {
            const data = JSON.stringify({ type: "text", text: chunks[index] });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            index++;
            if (index < chunks.length) {
              setTimeout(sendNext, 15);
            } else {
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
    console.error("Admin AI chat error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process chat request" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

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
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}
