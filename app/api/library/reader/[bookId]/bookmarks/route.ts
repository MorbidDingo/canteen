import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readingBookmark, readingSession } from "@/lib/db/schema";
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

  const bookmarks = await db
    .select()
    .from(readingBookmark)
    .where(
      and(
        eq(readingBookmark.userId, session.user.id),
        eq(readingBookmark.readableBookId, bookId),
      ),
    )
    .orderBy(asc(readingBookmark.chapterNumber), asc(readingBookmark.page));

  return NextResponse.json({ bookmarks });
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

  const b = body as { chapterNumber?: number; page?: number; label?: string };
  if (!b.chapterNumber || !b.page) {
    return NextResponse.json({ error: "chapterNumber and page are required" }, { status: 400 });
  }

  const [bookmark] = await db
    .insert(readingBookmark)
    .values({
      userId: session.user.id,
      readableBookId: bookId,
      chapterNumber: b.chapterNumber,
      page: b.page,
      label: b.label || null,
    })
    .returning();

  return NextResponse.json({ bookmark }, { status: 201 });
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
  const bookmarkId = searchParams.get("bookmarkId");

  if (!bookmarkId?.trim()) {
    return NextResponse.json({ error: "bookmarkId query param is required" }, { status: 400 });
  }

  await db
    .delete(readingBookmark)
    .where(
      and(
        eq(readingBookmark.id, bookmarkId),
        eq(readingBookmark.userId, session.user.id),
        eq(readingBookmark.readableBookId, bookId),
      ),
    );

  return NextResponse.json({ success: true });
}
