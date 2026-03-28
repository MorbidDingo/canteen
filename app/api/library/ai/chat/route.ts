import Anthropic from "@anthropic-ai/sdk";
import { and, count, desc, eq, gte, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { appSetting, book, bookCopy, bookIssuance, child } from "@/lib/db/schema";

const DAILY_SUMMARY_LIMIT = 5;
const SUMMARY_KEY_PREFIX = "library_ai_summary_usage";

type LibraryBookContext = {
  id?: string;
  title?: string;
  author?: string;
  isbn?: string | null;
  description?: string | null;
};

type ChatBody = {
  messages?: Anthropic.MessageParam[];
  summaryRequest?: boolean;
  book?: LibraryBookContext;
  childId?: string;
};

const LIBRARY_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "web_search_books",
    description:
      "Search the web for trustworthy information about a book (author pages, publisher listings, major catalog sources, and reviews). Use this before writing a summary when details are missing or uncertain.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Book search query with title and author",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_library_catalog",
    description:
      "Search the school library catalog for books by title, author, category, or keywords. Returns books available in our library.",
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
      "Get the recent reading/borrowing history for the selected child. Shows what they have read and their preferences.",
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
  {
    name: "get_popular_books",
    description:
      "Get the most borrowed books in the school library over the last 30 days.",
    input_schema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Max results (default 8, max 15)",
        },
        category: {
          type: "string",
          description: "Optional category filter",
        },
      },
      required: [],
    },
  },
  {
    name: "check_book_availability",
    description:
      "Check if a specific book is currently available to borrow (by title or book ID).",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Book title or book ID to check",
        },
      },
      required: ["query"],
    },
  },
];

function isoDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function usageSettingKey(orgId: string, userId: string, dateKey: string) {
  return `${SUMMARY_KEY_PREFIX}:${orgId}:${userId}:${dateKey}`;
}

async function getDailyUsage(orgId: string, userId: string, dateKey: string) {
  const key = usageSettingKey(orgId, userId, dateKey);
  const [row] = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(and(eq(appSetting.organizationId, orgId), eq(appSetting.key, key)))
    .limit(1);

  const usage = row ? Number.parseInt(row.value, 10) : 0;
  return Number.isFinite(usage) && usage > 0 ? usage : 0;
}

async function setDailyUsage(orgId: string, userId: string, dateKey: string, count: number) {
  const key = usageSettingKey(orgId, userId, dateKey);
  const value = String(Math.max(0, count));

  const [existing] = await db
    .select({ id: appSetting.id })
    .from(appSetting)
    .where(and(eq(appSetting.organizationId, orgId), eq(appSetting.key, key)))
    .limit(1);

  if (existing) {
    await db
      .update(appSetting)
      .set({
        value,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(appSetting.id, existing.id));
    return;
  }

  await db.insert(appSetting).values({
    organizationId: orgId,
    key,
    value,
    updatedBy: userId,
    updatedAt: new Date(),
  });
}

function extractPlainText(content: Anthropic.MessageParam["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => {
      if (typeof block === "object" && block && "type" in block && block.type === "text" && "text" in block) {
        return String(block.text ?? "");
      }
      return "";
    })
    .join(" ")
    .trim();
}

function isSummaryIntent(body: ChatBody, latestMessageText: string) {
  if (body.summaryRequest) return true;
  return /\b(summary|summarize|summarise|book\s+overview|tell\s+me\s+about\s+this\s+book)\b/i.test(latestMessageText);
}

function compactText(value: string, maxLen: number) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}...` : trimmed;
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function runBookWebSearch(query: string) {
  const safeQuery = compactText(query, 180);
  if (!safeQuery) {
    return JSON.stringify({ error: "Query is required" });
  }

  const encoded = encodeURIComponent(safeQuery);

  const [googleResult, openLibraryResult] = await Promise.allSettled([
    fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?q=${encoded}&maxResults=3`, 7_000),
    fetchWithTimeout(`https://openlibrary.org/search.json?q=${encoded}&limit=3`, 7_000),
  ]);

  const googleSnippets: string[] = [];
  if (googleResult.status === "fulfilled" && googleResult.value.ok) {
    try {
      const payload = (await googleResult.value.json()) as {
        items?: Array<{
          volumeInfo?: {
            title?: string;
            authors?: string[];
            description?: string;
            publishedDate?: string;
            publisher?: string;
          };
        }>;
      };
      for (const item of payload.items ?? []) {
        const info = item.volumeInfo;
        if (!info) continue;
        const parts = [
          info.title ? `Title: ${info.title}` : "",
          info.authors?.length ? `Author: ${info.authors.join(", ")}` : "",
          info.publisher ? `Publisher: ${info.publisher}` : "",
          info.publishedDate ? `Published: ${info.publishedDate}` : "",
          info.description ? `Notes: ${compactText(info.description, 420)}` : "",
        ].filter(Boolean);
        if (parts.length > 0) {
          googleSnippets.push(parts.join(" | "));
        }
      }
    } catch {
      // Ignore malformed upstream payloads.
    }
  }

  const openLibrarySnippets: string[] = [];
  if (openLibraryResult.status === "fulfilled" && openLibraryResult.value.ok) {
    try {
      const payload = (await openLibraryResult.value.json()) as {
        docs?: Array<{
          title?: string;
          author_name?: string[];
          first_publish_year?: number;
          publisher?: string[];
          subject?: string[];
        }>;
      };
      for (const doc of payload.docs ?? []) {
        const parts = [
          doc.title ? `Title: ${doc.title}` : "",
          doc.author_name?.length ? `Author: ${doc.author_name.join(", ")}` : "",
          doc.first_publish_year ? `First published: ${doc.first_publish_year}` : "",
          doc.publisher?.length ? `Publisher: ${doc.publisher[0]}` : "",
          doc.subject?.length ? `Subjects: ${doc.subject.slice(0, 5).join(", ")}` : "",
        ].filter(Boolean);
        if (parts.length > 0) {
          openLibrarySnippets.push(parts.join(" | "));
        }
      }
    } catch {
      // Ignore malformed upstream payloads.
    }
  }

  return JSON.stringify({
    query: safeQuery,
    sources: [
      {
        name: "Google Books",
        snippets: googleSnippets,
      },
      {
        name: "OpenLibrary",
        snippets: openLibrarySnippets,
      },
    ],
    guidance:
      "Prioritize facts seen in multiple sources. If details conflict, mention uncertainty instead of inventing facts.",
  });
}

async function executeLibraryTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: { orgId: string; childId: string | null },
): Promise<string> {
  switch (toolName) {
    case "web_search_books":
      return runBookWebSearch(String(input.query ?? ""));

    case "search_library_catalog": {
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

    case "get_reading_history": {
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

    case "get_popular_books": {
      const limit = typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 15) : 8;
      const category = typeof input.category === "string" ? input.category.trim() : "";
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      try {
        const popular = await db
          .select({
            bookId: book.id,
            title: book.title,
            author: book.author,
            category: book.category,
            coverImageUrl: book.coverImageUrl,
            availableCopies: book.availableCopies,
            borrowCount: count(bookIssuance.id),
          })
          .from(bookIssuance)
          .innerJoin(bookCopy, eq(bookCopy.id, bookIssuance.bookCopyId))
          .innerJoin(book, eq(book.id, bookCopy.bookId))
          .where(
            and(
              eq(book.organizationId, ctx.orgId),
              gte(bookIssuance.issuedAt, thirtyDaysAgo),
              category ? eq(book.category, category) : undefined,
            ),
          )
          .groupBy(book.id, book.title, book.author, book.category, book.coverImageUrl, book.availableCopies)
          .orderBy(desc(count(bookIssuance.id)))
          .limit(limit);

        return JSON.stringify({
          results: popular.map((b) => ({
            bookId: b.bookId,
            title: b.title,
            author: b.author,
            category: b.category,
            coverImageUrl: b.coverImageUrl,
            availableCopies: b.availableCopies,
            borrowCount: b.borrowCount,
          })),
          count: popular.length,
        });
      } catch (err) {
        return JSON.stringify({ error: "Failed to fetch popular books", details: String(err) });
      }
    }

    case "check_book_availability": {
      const query = typeof input.query === "string" ? input.query.trim() : "";
      if (!query) return JSON.stringify({ error: "Query is required" });

      try {
        const results = await db
          .select({
            bookId: book.id,
            title: book.title,
            author: book.author,
            totalCopies: book.totalCopies,
            availableCopies: book.availableCopies,
            coverImageUrl: book.coverImageUrl,
          })
          .from(book)
          .where(
            and(
              eq(book.organizationId, ctx.orgId),
              or(
                eq(book.id, query),
                sql`LOWER(${book.title}) LIKE LOWER(${"%" + query + "%"})`,
              ),
            ),
          )
          .limit(5);

        return JSON.stringify({
          results: results.map((b) => ({
            bookId: b.bookId,
            title: b.title,
            author: b.author,
            totalCopies: b.totalCopies,
            availableCopies: b.availableCopies,
            available: (b.availableCopies ?? 0) > 0,
            coverImageUrl: b.coverImageUrl,
          })),
          count: results.length,
        });
      } catch (err) {
        return JSON.stringify({ error: "Failed to check availability", details: String(err) });
      }
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

function buildLibrarySystemPrompt(bookCtx: LibraryBookContext | undefined) {
  const contextBits = [
    bookCtx?.title ? `Book title: ${bookCtx.title}` : "",
    bookCtx?.author ? `Book author: ${bookCtx.author}` : "",
    bookCtx?.isbn ? `ISBN: ${bookCtx.isbn}` : "",
    bookCtx?.description ? `Catalog description: ${compactText(bookCtx.description, 500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    "You are Certe Library AI — a brief, tool-driven library assistant.",
    "",
    "CRITICAL RULES:",
    "1. ALWAYS call tools BEFORE responding. Never answer from memory alone.",
    "2. Keep every reply to 1-3 short sentences MAX. No paragraphs, no intros, no filler.",
    "3. Never fabricate book details. Only reference books confirmed by tool results.",
    "",
    "Tool-use workflow:",
    "- For book summaries: call web_search_books first, then give a brief Overview, Themes, Reading Level, and Suitability — each in one sentence.",
    "- For catalog searches: call search_library_catalog with relevant keywords.",
    "- For reading history: call get_reading_history.",
    "- For popularity: call get_popular_books.",
    "- For availability: call check_book_availability.",
    "- If uncertain about a book, call web_search_books before answering.",
    "",
    "Always prefer tool results over guessing. If no data is found, say so in one sentence.",
    contextBits ? `\nKnown context:\n${contextBits}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["PARENT", "GENERAL", "OWNER", "MANAGEMENT", "LIB_OPERATOR", "OPERATOR"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = access.actorUserId;
  const organizationId = access.activeOrganizationId!;

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages array is required" }, { status: 400 });
  }

  const lastMessage = [...messages].reverse().find((message) => message.role === "user");
  const latestText = lastMessage ? extractPlainText(lastMessage.content) : "";
  const summaryRequest = isSummaryIntent(body, latestText);

  const dateKey = isoDateKey();
  const usedToday = await getDailyUsage(organizationId, userId, dateKey);

  if (summaryRequest && usedToday >= DAILY_SUMMARY_LIMIT) {
    return NextResponse.json(
      {
        error: "Daily summary limit reached (5/5). Try again tomorrow.",
        code: "DAILY_SUMMARY_LIMIT",
        usage: {
          used: usedToday,
          remaining: 0,
          limit: DAILY_SUMMARY_LIMIT,
        },
      },
      { status: 429 },
    );
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

  const toolCtx = { orgId: organizationId, childId };

  try {
    const anthropic = new Anthropic();
    const systemPrompt = buildLibrarySystemPrompt(body.book);
    const conversation: Anthropic.MessageParam[] = [...messages];

    let finalText = "";
    const MAX_ROUNDS = 8;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: systemPrompt,
        tools: LIBRARY_TOOL_DEFINITIONS,
        messages: conversation,
      });

      if (response.stop_reason === "tool_use") {
        conversation.push({ role: "assistant", content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          const result = await executeLibraryTool(
            block.name,
            (block.input ?? {}) as Record<string, unknown>,
            toolCtx,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }

        conversation.push({ role: "user", content: toolResults });
        continue;
      }

      finalText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      break;
    }

    if (!finalText) {
      finalText = "I could not generate a summary right now. Please try again.";
    }

    let updatedUsage = usedToday;
    if (summaryRequest && finalText) {
      updatedUsage = usedToday + 1;
      await setDailyUsage(organizationId, userId, dateKey, updatedUsage);
    }

    return NextResponse.json({
      reply: finalText,
      usage: {
        used: updatedUsage,
        remaining: Math.max(0, DAILY_SUMMARY_LIMIT - updatedUsage),
        limit: DAILY_SUMMARY_LIMIT,
      },
    });
  } catch (error) {
    console.error("[Library AI Chat] Failed", error);
    return NextResponse.json({ error: "Failed to process library AI request" }, { status: 500 });
  }
}
