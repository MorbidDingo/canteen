import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  readableBook,
  readingSession,
  readingHighlight,
  readingBookmark,
} from "@/lib/db/schema";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { and, eq, count, desc, sql } from "drizzle-orm";

/**
 * GET /api/library/reader/stats
 *
 * Returns reader statistics:
 * - Most read books (by number of reading sessions)
 * - Trending books (most sessions started in last 7 days)
 * - Popular highlighted sections (most highlighted passages across users)
 * - Personal stats (user's own reading stats)
 */
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

  // Most read books — by total number of reading sessions across all users
  const mostReadBooks = await db
    .select({
      bookId: readableBook.id,
      title: readableBook.title,
      author: readableBook.author,
      coverImageUrl: readableBook.coverImageUrl,
      isPublicDomain: readableBook.isPublicDomain,
      readerCount: count(readingSession.id),
    })
    .from(readableBook)
    .leftJoin(readingSession, eq(readingSession.readableBookId, readableBook.id))
    .where(
      and(
        eq(readableBook.organizationId, organizationId),
        eq(readableBook.status, "ACTIVE"),
      ),
    )
    .groupBy(readableBook.id, readableBook.title, readableBook.author, readableBook.coverImageUrl, readableBook.isPublicDomain)
    .orderBy(desc(count(readingSession.id)))
    .limit(10);

  // Trending books — sessions started in the last 7 days
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const trendingBooks = await db
    .select({
      bookId: readableBook.id,
      title: readableBook.title,
      author: readableBook.author,
      coverImageUrl: readableBook.coverImageUrl,
      isPublicDomain: readableBook.isPublicDomain,
      recentReaders: count(readingSession.id),
    })
    .from(readableBook)
    .innerJoin(readingSession, eq(readingSession.readableBookId, readableBook.id))
    .where(
      and(
        eq(readableBook.organizationId, organizationId),
        eq(readableBook.status, "ACTIVE"),
        gte(readingSession.startedAt, sevenDaysAgo),
      ),
    )
    .groupBy(readableBook.id, readableBook.title, readableBook.author, readableBook.coverImageUrl, readableBook.isPublicDomain)
    .orderBy(desc(count(readingSession.id)))
    .limit(10);

  // Popular highlights — most highlighted passages across all users for org's books
  const popularHighlights = await db
    .select({
      highlightedText: readingHighlight.highlightedText,
      chapterNumber: readingHighlight.chapterNumber,
      page: readingHighlight.page,
      bookId: readableBook.id,
      bookTitle: readableBook.title,
      bookAuthor: readableBook.author,
      highlightCount: count(readingHighlight.id),
    })
    .from(readingHighlight)
    .innerJoin(readableBook, eq(readableBook.id, readingHighlight.readableBookId))
    .where(eq(readableBook.organizationId, organizationId))
    .groupBy(
      readingHighlight.highlightedText,
      readingHighlight.chapterNumber,
      readingHighlight.page,
      readableBook.id,
      readableBook.title,
      readableBook.author,
    )
    .orderBy(desc(count(readingHighlight.id)))
    .limit(15);

  // Personal stats
  const [personalSessionCount] = await db
    .select({ total: count() })
    .from(readingSession)
    .where(eq(readingSession.userId, session.user.id));

  const [personalHighlightCount] = await db
    .select({ total: count() })
    .from(readingHighlight)
    .where(eq(readingHighlight.userId, session.user.id));

  const [personalBookmarkCount] = await db
    .select({ total: count() })
    .from(readingBookmark)
    .where(eq(readingBookmark.userId, session.user.id));

  // Total readers in org
  const [totalReaders] = await db
    .select({ total: sql<number>`COUNT(DISTINCT ${readingSession.userId})` })
    .from(readingSession)
    .where(eq(readingSession.organizationId, organizationId));

  // Total books available
  const [totalBooks] = await db
    .select({ total: count() })
    .from(readableBook)
    .where(
      and(
        eq(readableBook.organizationId, organizationId),
        eq(readableBook.status, "ACTIVE"),
      ),
    );

  return NextResponse.json({
    mostRead: mostReadBooks,
    trending: trendingBooks,
    popularHighlights: popularHighlights.filter((h) => h.highlightCount > 1),
    personal: {
      activeBooks: personalSessionCount.total,
      totalHighlights: personalHighlightCount.total,
      totalBookmarks: personalBookmarkCount.total,
    },
    orgStats: {
      totalReaders: totalReaders.total,
      totalBooks: totalBooks.total,
    },
  });
}
