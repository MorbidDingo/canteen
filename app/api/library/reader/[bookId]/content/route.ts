import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookChapter, readableBook, readingSession } from "@/lib/db/schema";
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
    })
    .from(readableBook)
    .where(eq(readableBook.id, bookId))
    .limit(1);

  if (!bookInfo) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  // Get chapters
  const chapters = await db
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

  return NextResponse.json({ book: bookInfo, chapters });
}
