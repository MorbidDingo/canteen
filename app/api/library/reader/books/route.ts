import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readableBook, readingSession } from "@/lib/db/schema";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { and, eq, count } from "drizzle-orm";
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
  const organizationId = access.activeOrganizationId!;

  // Get available readable books for this org
  const books = await db
    .select({
      id: readableBook.id,
      bookId: readableBook.bookId,
      title: readableBook.title,
      author: readableBook.author,
      category: readableBook.category,
      description: readableBook.description,
      coverImageUrl: readableBook.coverImageUrl,
      language: readableBook.language,
      totalPages: readableBook.totalPages,
      totalChapters: readableBook.totalChapters,
      isAudioEnabled: readableBook.isAudioEnabled,
      isPublicDomain: readableBook.isPublicDomain,
      contentType: readableBook.contentType,
      gutenbergId: readableBook.gutenbergId,
    })
    .from(readableBook)
    .where(
      and(
        eq(readableBook.organizationId, organizationId),
        eq(readableBook.status, "ACTIVE"),
      ),
    );

  // Get user's active sessions count
  const [{ sessionCount }] = await db
    .select({ sessionCount: count() })
    .from(readingSession)
    .where(eq(readingSession.userId, session.user.id));

  // Get user's active session book IDs
  const activeSessions = await db
    .select({ readableBookId: readingSession.readableBookId })
    .from(readingSession)
    .where(eq(readingSession.userId, session.user.id));

  const activeBookIds = new Set(activeSessions.map((s) => s.readableBookId));

  return NextResponse.json({
    books: books.map((b) => ({ ...b, isActive: activeBookIds.has(b.id) })),
    activeSessionCount: sessionCount,
    maxActiveSessions: READER_MAX_ACTIVE_BOOKS,
  });
}
