import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readingSession, readableBook, certeSubscription } from "@/lib/db/schema";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { and, eq, gte, count } from "drizzle-orm";
import { READER_MAX_ACTIVE_BOOKS } from "@/lib/constants";

export async function GET() {
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

  const sessions = await db
    .select({
      id: readingSession.id,
      readableBookId: readingSession.readableBookId,
      currentChapter: readingSession.currentChapter,
      currentPage: readingSession.currentPage,
      readingMode: readingSession.readingMode,
      fontSize: readingSession.fontSize,
      startedAt: readingSession.startedAt,
      lastReadAt: readingSession.lastReadAt,
      bookTitle: readableBook.title,
      bookAuthor: readableBook.author,
      bookCover: readableBook.coverImageUrl,
      totalPages: readableBook.totalPages,
      totalChapters: readableBook.totalChapters,
      isAudioEnabled: readableBook.isAudioEnabled,
    })
    .from(readingSession)
    .innerJoin(readableBook, eq(readingSession.readableBookId, readableBook.id))
    .where(eq(readingSession.userId, session.user.id));

  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
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
  const organizationId = access.activeOrganizationId!;

  // Certe+ check
  const now = new Date();
  const [activeSub] = await db
    .select({ id: certeSubscription.id })
    .from(certeSubscription)
    .where(
      and(
        eq(certeSubscription.parentId, session.user.id),
        eq(certeSubscription.status, "ACTIVE"),
        gte(certeSubscription.endDate, now),
      ),
    )
    .limit(1);

  if (!activeSub) {
    return NextResponse.json(
      { error: "Certe+ subscription required", code: "CERTE_PLUS_REQUIRED" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const readableBookId =
    typeof body === "object" && body !== null && "readableBookId" in body
      ? String((body as { readableBookId: unknown }).readableBookId)
      : null;

  if (!readableBookId?.trim()) {
    return NextResponse.json({ error: "readableBookId is required" }, { status: 400 });
  }

  // Check book exists and belongs to org
  const [bookRow] = await db
    .select({ id: readableBook.id })
    .from(readableBook)
    .where(
      and(
        eq(readableBook.id, readableBookId),
        eq(readableBook.organizationId, organizationId),
        eq(readableBook.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!bookRow) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  // Check if already has a session for this book
  const [existing] = await db
    .select({ id: readingSession.id })
    .from(readingSession)
    .where(
      and(
        eq(readingSession.userId, session.user.id),
        eq(readingSession.readableBookId, readableBookId),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "You already have this book open", sessionId: existing.id }, { status: 409 });
  }

  // Enforce max 3 active books
  const [{ sessionCount }] = await db
    .select({ sessionCount: count() })
    .from(readingSession)
    .where(eq(readingSession.userId, session.user.id));

  if (sessionCount >= READER_MAX_ACTIVE_BOOKS) {
    return NextResponse.json(
      { error: `Maximum ${READER_MAX_ACTIVE_BOOKS} books can be read at a time. Close a book first.`, code: "MAX_SESSIONS_REACHED" },
      { status: 429 },
    );
  }

  const [newSession] = await db
    .insert(readingSession)
    .values({
      userId: session.user.id,
      readableBookId,
      organizationId,
    })
    .returning();

  return NextResponse.json({ session: newSession }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
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
  const sessionId = searchParams.get("sessionId");

  if (!sessionId?.trim()) {
    return NextResponse.json({ error: "sessionId query param is required" }, { status: 400 });
  }

  await db
    .delete(readingSession)
    .where(
      and(
        eq(readingSession.id, sessionId),
        eq(readingSession.userId, session.user.id),
      ),
    );

  return NextResponse.json({ success: true });
}
