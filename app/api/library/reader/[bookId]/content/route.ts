import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookChapter, readableBook, readingSession } from "@/lib/db/schema";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { and, eq, asc } from "drizzle-orm";
import {
  fetchBookContent,
  parseIntoChapters,
  estimatePages,
} from "@/lib/gutenberg";

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

  // Verify user has an active session for this book
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
    return NextResponse.json(
      { error: "No active reading session for this book. Start reading first." },
      { status: 403 },
    );
  }

  // Get book info
  const [bookInfo] = await db
    .select({
      id: readableBook.id,
      title: readableBook.title,
      author: readableBook.author,
      totalPages: readableBook.totalPages,
      totalChapters: readableBook.totalChapters,
      isAudioEnabled: readableBook.isAudioEnabled,
      coverImageUrl: readableBook.coverImageUrl,
      isPublicDomain: readableBook.isPublicDomain,
      gutenbergId: readableBook.gutenbergId,
      contentType: readableBook.contentType,
    })
    .from(readableBook)
    .where(eq(readableBook.id, bookId))
    .limit(1);

  if (!bookInfo) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  // Get chapters
  let chapters = await db
    .select({
      id: bookChapter.id,
      chapterNumber: bookChapter.chapterNumber,
      title: bookChapter.title,
      content: bookChapter.content,
      pageStart: bookChapter.pageStart,
      pageEnd: bookChapter.pageEnd,
      audioUrl: bookChapter.audioUrl,
    })
    .from(bookChapter)
    .where(eq(bookChapter.readableBookId, bookId))
    .orderBy(asc(bookChapter.chapterNumber));

  // For public domain books, fetch content on-demand if no chapters exist
  if (chapters.length === 0 && bookInfo.isPublicDomain && bookInfo.gutenbergId) {
    const gutenbergId = parseInt(bookInfo.gutenbergId, 10);
    let rawText: string | null = null;
    try {
      rawText = await fetchBookContent(gutenbergId);
    } catch (error) {
      console.error(`Failed to fetch book content for Gutenberg ID ${gutenbergId}:`, error);
      return NextResponse.json(
        { error: "Failed to fetch book content from Project Gutenberg. Please try again later." },
        { status: 502 },
      );
    }

    if (rawText) {
      const parsed = parseIntoChapters(rawText);
      const totalPages = estimatePages(rawText);

      if (parsed.length > 0) {
        // Store fetched chapters
        await db.insert(bookChapter).values(
          parsed.map((ch) => ({
            readableBookId: bookId,
            chapterNumber: ch.chapterNumber,
            title: ch.title,
            content: ch.content,
            pageStart: ch.pageStart,
            pageEnd: ch.pageEnd,
          })),
        );

        // Update book metadata
        await db
          .update(readableBook)
          .set({
            totalPages,
            totalChapters: parsed.length,
            updatedAt: new Date(),
          })
          .where(eq(readableBook.id, bookId));

        // Re-fetch stored chapters
        chapters = await db
          .select({
            id: bookChapter.id,
            chapterNumber: bookChapter.chapterNumber,
            title: bookChapter.title,
            content: bookChapter.content,
            pageStart: bookChapter.pageStart,
            pageEnd: bookChapter.pageEnd,
            audioUrl: bookChapter.audioUrl,
          })
          .from(bookChapter)
          .where(eq(bookChapter.readableBookId, bookId))
          .orderBy(asc(bookChapter.chapterNumber));

        // Update returned book info
        bookInfo.totalPages = totalPages;
        bookInfo.totalChapters = parsed.length;
      }
    }
  }

  return NextResponse.json({
    book: {
      id: bookInfo.id,
      title: bookInfo.title,
      author: bookInfo.author,
      totalPages: bookInfo.totalPages,
      totalChapters: bookInfo.totalChapters,
      isAudioEnabled: bookInfo.isAudioEnabled,
      coverImageUrl: bookInfo.coverImageUrl,
      contentType: bookInfo.contentType,
    },
    chapters,
  });
}
