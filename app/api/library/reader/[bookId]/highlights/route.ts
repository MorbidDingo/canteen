import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readingHighlight, readingSession } from "@/lib/db/schema";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { and, eq, asc } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;

  let access;
  try {
    access = await requireLinkedAccount();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const session = access.session;

  const highlights = await db
    .select()
    .from(readingHighlight)
    .where(
      and(
        eq(readingHighlight.userId, session.user.id),
        eq(readingHighlight.readableBookId, bookId),
      ),
    )
    .orderBy(asc(readingHighlight.chapterNumber), asc(readingHighlight.page));

  return NextResponse.json({ highlights });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;

  let access;
  try {
    access = await requireLinkedAccount();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const session = access.session;

  // Verify active session
  const [activeSession] = await db
    .select({ id: readingSession.id })
    .from(readingSession)
    .where(
      and(
        eq(readingSession.userId, session.user.id),
        eq(readingSession.readableBookId, bookId),
      ),
    )
    .limit(1);

  if (!activeSession) {
    return NextResponse.json({ error: "No active reading session" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const h = body as {
    chapterNumber?: number;
    page?: number;
    startOffset?: number;
    endOffset?: number;
    highlightedText?: string;
    color?: string;
    note?: string;
  };

  if (!h.chapterNumber || !h.page || h.startOffset == null || h.endOffset == null || !h.highlightedText) {
    return NextResponse.json(
      { error: "chapterNumber, page, startOffset, endOffset, and highlightedText are required" },
      { status: 400 },
    );
  }

  const [highlight] = await db
    .insert(readingHighlight)
    .values({
      userId: session.user.id,
      readableBookId: bookId,
      chapterNumber: h.chapterNumber,
      page: h.page,
      startOffset: h.startOffset,
      endOffset: h.endOffset,
      highlightedText: h.highlightedText,
      color: h.color || "#fbbf24",
      note: h.note || null,
    })
    .returning();

  return NextResponse.json({ highlight }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;

  let access;
  try {
    access = await requireLinkedAccount();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const session = access.session;
  const { searchParams } = new URL(request.url);
  const highlightId = searchParams.get("highlightId");

  if (!highlightId?.trim()) {
    return NextResponse.json({ error: "highlightId query param is required" }, { status: 400 });
  }

  await db
    .delete(readingHighlight)
    .where(
      and(
        eq(readingHighlight.id, highlightId),
        eq(readingHighlight.userId, session.user.id),
        eq(readingHighlight.readableBookId, bookId),
      ),
    );

  return NextResponse.json({ success: true });
}
