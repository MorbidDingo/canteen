import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { book, bookIssuance, bookCopy, child } from "@/lib/db/schema";

// ─── Rate Limiting ────────────────────────────────────────

const RATE_LIMIT = 20; // messages per hour
const RATE_WINDOW_MS = 60 * 60 * 1000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

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

// ─── Tool Definitions ─────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_library_catalog",
    description:
      "Search the school library catalog for books by title, author, category, or keywords. Returns available books from our library.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search keywords (title, author, topic, or genre)",
        },
        category: {
          type: "string",
          description:
            "Optional category filter: FICTION, NON_FICTION, SCIENCE, HISTORY, BIOGRAPHY, ADVENTURE, FANTASY, MYSTERY, POETRY, GENERAL",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 8, max 15)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_reading_history",
    description:
      "Get the recent reading/borrowing history for the selected child. Use this to understand what they have already read and their preferences.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Max records to return (default 10)",
        },
      },
      required: [],
    },
  },
];

// ─── Tool Execution ───────────────────────────────────────

async function executeLibraryTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: { orgId: string; childId: string | null },
): Promise<string> {
  if (toolName === "search_library_catalog") {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    const category = typeof input.category === "string" ? input.category.trim() : "";
    const limit = typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 15) : 8;

    try {
      const bookRows = await db
        .select({
          id: book.id,
          title: book.title,
          author: book.author,
          category: book.category,
          description: book.description,
          coverImageUrl: book.coverImageUrl,
          availableCopies: book.availableCopies,
        })
        .from(book)
        .where(
          and(
            eq(book.organizationId, ctx.orgId),
            query
              ? or(
                  sql`LOWER(${book.title}) LIKE LOWER(${"%" + query + "%"})`,
                  sql`LOWER(${book.author}) LIKE LOWER(${"%" + query + "%"})`,
                  sql`LOWER(COALESCE(${book.description}, '')) LIKE LOWER(${"%" + query + "%"})`,
                )
              : undefined,
            category ? eq(book.category, category) : undefined,
          ),
        )
        .limit(limit);

      return JSON.stringify({
        results: bookRows.map((b) => ({
          bookId: b.id,
          title: b.title,
          author: b.author,
          category: b.category,
          description: b.description ? b.description.slice(0, 200) : null,
          availableCopies: b.availableCopies,
          coverImageUrl: b.coverImageUrl,
        })),
        count: bookRows.length,
      });
    } catch (err) {
      return JSON.stringify({ error: "Failed to search catalog", details: String(err) });
    }
  }

  if (toolName === "get_reading_history") {
    if (!ctx.childId) {
      return JSON.stringify({ history: [], count: 0, note: "No child selected" });
    }
    const limit = typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 20) : 10;

    try {
      const history = await db
        .select({
          bookId: book.id,
          title: book.title,
          author: book.author,
          category: book.category,
          issuedAt: bookIssuance.issuedAt,
          returnedAt: bookIssuance.returnedAt,
          status: bookIssuance.status,
        })
        .from(bookIssuance)
        .innerJoin(bookCopy, eq(bookCopy.id, bookIssuance.bookCopyId))
        .innerJoin(book, eq(book.id, bookCopy.bookId))
        .where(eq(bookIssuance.childId, ctx.childId))
        .orderBy(desc(bookIssuance.issuedAt))
        .limit(limit);

      return JSON.stringify({
        history: history.map((h) => ({
          bookId: h.bookId,
          title: h.title,
          author: h.author,
          category: h.category,
          issuedAt: h.issuedAt?.toISOString(),
          returnedAt: h.returnedAt?.toISOString(),
          status: h.status,
        })),
        count: history.length,
      });
    } catch (err) {
      return JSON.stringify({ error: "Failed to fetch reading history", details: String(err) });
    }
  }

  return JSON.stringify({ error: `Unknown tool: ${toolName}` });
}

// ─── Book Recommendation Parsing ─────────────────────────

export type BookRecommendation = {
  bookId: string;
  title: string;
  author: string;
  category?: string;
  coverImageUrl?: string | null;
};

function parseBookRecommendations(text: string): {
  cleanText: string;
  books: BookRecommendation[];
} {
  const books: BookRecommendation[] = [];
  let cleanText = text;

  const regex = /\[\[BOOK_RECOMMENDATIONS\]\]\s*\n?([\s\S]*?)\n?\[\[\/BOOK_RECOMMENDATIONS\]\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.bookId && item.title && item.author) {
            books.push({
              bookId: String(item.bookId),
              title: String(item.title),
              author: String(item.author),
              category: item.category ? String(item.category) : undefined,
              coverImageUrl: item.coverImageUrl ? String(item.coverImageUrl) : null,
            });
          }
        }
      }
    } catch {
      // Skip malformed JSON
    }
    cleanText = cleanText.replace(match[0], "").trim();
  }

  return { cleanText: cleanText.replace(/\n{3,}/g, "\n\n").trim(), books };
}

// ─── Text Chunker ─────────────────────────────────────────

function chunkText(text: string, avgWords = 20): string[] {
  const words = text.split(/(\s+)/);
  const chunks: string[] = [];
  let current = "";
  let wordCount = 0;

  for (const word of words) {
    current += word;
    if (word.trim()) wordCount++;
    if (wordCount >= avgWords) {
      chunks.push(current);
      current = "";
      wordCount = 0;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

// ─── System Prompt ────────────────────────────────────────

const SYSTEM_PROMPT = `You are Certe Library AI — a friendly, knowledgeable library assistant for school students and parents.

Your goals:
1. Help students find books that match their interests, reading level, and history
2. Answer questions about books, authors, genres, and reading
3. Give personalized recommendations based on what they have read before

When recommending books:
- Always use the search_library_catalog tool to find actual books from our library
- Use the get_reading_history tool to see what the child has already read (avoid duplicates)
- Recommend the top 3 most suitable books
- After your response text, output the book data in this EXACT format (no extra text or newlines around the JSON):

[[BOOK_RECOMMENDATIONS]]
[{"bookId":"id","title":"Book Title","author":"Author Name","category":"CATEGORY","coverImageUrl":"url_or_null"}]
[[/BOOK_RECOMMENDATIONS]]

Keep responses concise, warm, and student-friendly. Never fabricate book details — only recommend books found in our catalog via the search tool.`;

// ─── POST Handler ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["PARENT", "GENERAL", "OWNER", "MANAGEMENT", "LIB_OPERATOR", "OPERATOR"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return new Response(
        JSON.stringify({ error: error.message, code: error.code }),
        { status: error.status, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = access.actorUserId;
  const orgId = access.activeOrganizationId!;

  if (!checkRateLimit(userId)) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Please try again later.", code: "RATE_LIMITED" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { messages?: unknown; childId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const messages = Array.isArray(body.messages)
    ? (body.messages as Anthropic.MessageParam[]).slice(-20)
    : [];
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages array is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Resolve childId
  let childId: string | null = body.childId ?? null;
  if (!childId) {
    const [firstChild] = await db
      .select({ id: child.id })
      .from(child)
      .where(eq(child.parentId, userId))
      .limit(1);
    if (firstChild) childId = firstChild.id;
  }

  const toolCtx = { orgId, childId };
  const anthropic = new Anthropic();
  const allMessages: Anthropic.MessageParam[] = [...messages];
  let finalResponse = "";
  const MAX_ROUNDS = 6;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: allMessages,
      });

      if (response.stop_reason === "end_turn") {
        finalResponse = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        break;
      }

      if (response.stop_reason === "tool_use") {
        allMessages.push({ role: "assistant", content: response.content });
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          const result = await executeLibraryTool(
            block.name,
            (block.input ?? {}) as Record<string, unknown>,
            toolCtx,
          );
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
        }
        allMessages.push({ role: "user", content: toolResults });
        continue;
      }

      // Fallback for other stop reasons
      finalResponse = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      break;
    }
  } catch (err) {
    console.error("[Library AI Chat Stream] Anthropic error:", err);
    return new Response(JSON.stringify({ error: "Failed to process library AI request" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { cleanText, books } = parseBookRecommendations(finalResponse);
  const chunks = chunkText(cleanText, 20);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let index = 0;

      function sendNext() {
        if (index < chunks.length) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "text", text: chunks[index] })}\n\n`,
            ),
          );
          index++;
          if (index < chunks.length) {
            setTimeout(sendNext, 15);
          } else {
            if (books.length > 0) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "actions",
                    actions: [{ type: "book_recommendations", books }],
                  })}\n\n`,
                ),
              );
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`),
            );
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
}
