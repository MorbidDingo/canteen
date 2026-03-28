import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { appSetting } from "@/lib/db/schema";

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
): Promise<string> {
  switch (toolName) {
    case "web_search_books":
      return runBookWebSearch(String(input.query ?? ""));
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

function buildLibrarySystemPrompt(book: LibraryBookContext | undefined) {
  const contextBits = [
    book?.title ? `Book title: ${book.title}` : "",
    book?.author ? `Book author: ${book.author}` : "",
    book?.isbn ? `ISBN: ${book.isbn}` : "",
    book?.description ? `Catalog description: ${compactText(book.description, 500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    "You are Certe Library AI Assistant.",
    "Goal: help users understand books quickly and accurately.",
    "For book summaries, produce concise sections: Overview, Themes, Reading Level, Why It May Suit This Reader.",
    "Never fabricate plot points or claims. If uncertain, say what is uncertain.",
    "When key details are missing, call the web_search_books tool before answering.",
    "Keep tone practical and student-friendly.",
    contextBits ? `Known context:\n${contextBits}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
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

  try {
    const anthropic = new Anthropic();
    const systemPrompt = buildLibrarySystemPrompt(body.book);
    const conversation: Anthropic.MessageParam[] = [...messages];

    let finalText = "";
    const MAX_ROUNDS = 6;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 900,
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
