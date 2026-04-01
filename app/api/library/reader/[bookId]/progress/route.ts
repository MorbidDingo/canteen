import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readingSession } from "@/lib/db/schema";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { and, eq } from "drizzle-orm";

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

  const [progress] = await db
    .select({
      currentChapter: readingSession.currentChapter,
      currentPage: readingSession.currentPage,
      scrollPosition: readingSession.scrollPosition,
      readingMode: readingSession.readingMode,
      fontSize: readingSession.fontSize,
      lastReadAt: readingSession.lastReadAt,
    })
    .from(readingSession)
    .where(
      and(
        eq(readingSession.userId, session.user.id),
        eq(readingSession.readableBookId, bookId),
      ),
    )
    .limit(1);

  if (!progress) {
    return NextResponse.json({ error: "No active reading session" }, { status: 404 });
  }

  return NextResponse.json({ progress });
}

export async function PUT(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update = body as {
    currentChapter?: number;
    currentPage?: number;
    scrollPosition?: number;
    readingMode?: string;
    fontSize?: number;
  };

  const setFields: Record<string, unknown> = { lastReadAt: new Date() };
  if (update.currentChapter != null) setFields.currentChapter = update.currentChapter;
  if (update.currentPage != null) setFields.currentPage = update.currentPage;
  if (update.scrollPosition != null) setFields.scrollPosition = update.scrollPosition;
  if (update.readingMode) setFields.readingMode = update.readingMode;
  if (update.fontSize != null) setFields.fontSize = update.fontSize;

  const [updated] = await db
    .update(readingSession)
    .set(setFields)
    .where(
      and(
        eq(readingSession.userId, session.user.id),
        eq(readingSession.readableBookId, bookId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "No active reading session" }, { status: 404 });
  }

  return NextResponse.json({ progress: updated });
}
