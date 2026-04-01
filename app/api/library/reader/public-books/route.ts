import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readableBook, bookChapter, certeSubscription } from "@/lib/db/schema";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { and, eq, gte } from "drizzle-orm";
import {
  searchGutenbergBooks,
  getGutenbergBook,
  getCoverImageUrl,
  formatAuthorName,
  mapCategory,
  fetchBookContent,
  parseIntoChapters,
  estimatePages,
} from "@/lib/gutenberg";
import { searchBookImage } from "@/lib/book-search";

/**
 * GET /api/library/reader/public-books
 *
 * Fetches popular public domain books from Project Gutenberg.
 * If the organisation doesn't have them yet, seeds them into readable_book.
 * Returns the list of public domain books available for the org.
 */
export async function GET(request: NextRequest) {
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

  // Certe+ subscription check
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

  // Check if org already has public domain books seeded
  const existingPublicBooks = await db
    .select({
      id: readableBook.id,
      title: readableBook.title,
      author: readableBook.author,
      category: readableBook.category,
      description: readableBook.description,
      coverImageUrl: readableBook.coverImageUrl,
      language: readableBook.language,
      totalPages: readableBook.totalPages,
      totalChapters: readableBook.totalChapters,
      isPublicDomain: readableBook.isPublicDomain,
      gutenbergId: readableBook.gutenbergId,
      contentType: readableBook.contentType,
    })
    .from(readableBook)
    .where(
      and(
        eq(readableBook.organizationId, organizationId),
        eq(readableBook.isPublicDomain, true),
        eq(readableBook.status, "ACTIVE"),
      ),
    );

  if (existingPublicBooks.length > 0) {
    return NextResponse.json({ books: existingPublicBooks, seeded: false });
  }

  // Seed popular public domain books from Gutenberg
  const { search, topic } = Object.fromEntries(new URL(request.url).searchParams);
  try {
    const { books: gutenbergBooks } = await searchGutenbergBooks({
      search: search || undefined,
      topic: topic || undefined,
      languages: "en",
    });

    // Take top 20 popular English books
    const booksToSeed = gutenbergBooks.slice(0, 20);
    const seededBooks = [];

    for (const gb of booksToSeed) {
      // Check if this Gutenberg book already exists for the org
      const [existing] = await db
        .select({ id: readableBook.id })
        .from(readableBook)
        .where(
          and(
            eq(readableBook.organizationId, organizationId),
            eq(readableBook.gutenbergId, String(gb.id)),
          ),
        )
        .limit(1);

      if (existing) continue;

      // Get cover image — try Gutenberg's own, then Open Library
      let coverUrl = getCoverImageUrl(gb);
      if (!coverUrl) {
        try {
          const imageResult = await searchBookImage(gb.title, formatAuthorName(gb));
          coverUrl = imageResult?.imageUrl ?? null;
        } catch {
          // Silently skip cover search failures
        }
      }

      const author = formatAuthorName(gb);
      const category = mapCategory(gb.subjects);
      const description = gb.subjects.slice(0, 3).join(", ") || null;
      const language = gb.languages[0] || "en";

      const [inserted] = await db
        .insert(readableBook)
        .values({
          organizationId,
          title: gb.title.length > 200 ? gb.title.slice(0, 200) : gb.title,
          author,
          category,
          description,
          coverImageUrl: coverUrl,
          language,
          totalPages: 0, // Updated when content is fetched
          totalChapters: 0,
          isPublicDomain: true,
          gutenbergId: String(gb.id),
          sourceUrl: `https://www.gutenberg.org/ebooks/${gb.id}`,
          contentType: "TEXT",
          status: "ACTIVE",
        })
        .returning();

      seededBooks.push(inserted);
    }

    // Return all public domain books (including newly seeded)
    const allPublicBooks = await db
      .select({
        id: readableBook.id,
        title: readableBook.title,
        author: readableBook.author,
        category: readableBook.category,
        description: readableBook.description,
        coverImageUrl: readableBook.coverImageUrl,
        language: readableBook.language,
        totalPages: readableBook.totalPages,
        totalChapters: readableBook.totalChapters,
        isPublicDomain: readableBook.isPublicDomain,
        gutenbergId: readableBook.gutenbergId,
        contentType: readableBook.contentType,
      })
      .from(readableBook)
      .where(
        and(
          eq(readableBook.organizationId, organizationId),
          eq(readableBook.isPublicDomain, true),
          eq(readableBook.status, "ACTIVE"),
        ),
      );

    return NextResponse.json({ books: allPublicBooks, seeded: true, seededCount: seededBooks.length });
  } catch (error) {
    console.error("Failed to seed public domain books:", error);
    return NextResponse.json(
      { error: "Failed to fetch public domain books from Gutenberg" },
      { status: 502 },
    );
  }
}

/**
 * POST /api/library/reader/public-books
 *
 * Fetches and stores the content (chapters) for a specific public domain book.
 * Called on-demand when a user opens a public domain book for reading.
 * Body: { readableBookId: string }
 */
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

  const organizationId = access.activeOrganizationId!;

  // Get the book
  const [bookRow] = await db
    .select({
      id: readableBook.id,
      gutenbergId: readableBook.gutenbergId,
      isPublicDomain: readableBook.isPublicDomain,
      totalChapters: readableBook.totalChapters,
    })
    .from(readableBook)
    .where(
      and(
        eq(readableBook.id, readableBookId),
        eq(readableBook.organizationId, organizationId),
        eq(readableBook.isPublicDomain, true),
      ),
    )
    .limit(1);

  if (!bookRow) {
    return NextResponse.json({ error: "Public domain book not found" }, { status: 404 });
  }

  // If chapters already exist, skip fetching
  if (bookRow.totalChapters > 0) {
    return NextResponse.json({ message: "Content already loaded", chapters: bookRow.totalChapters });
  }

  if (!bookRow.gutenbergId) {
    return NextResponse.json({ error: "No Gutenberg ID found for this book" }, { status: 400 });
  }

  const gutenbergId = parseInt(bookRow.gutenbergId, 10);

  // Fetch content from Gutenberg
  const rawText = await fetchBookContent(gutenbergId);
  if (!rawText) {
    return NextResponse.json({ error: "Failed to fetch book content from Project Gutenberg" }, { status: 502 });
  }

  // Parse into chapters
  const chapters = parseIntoChapters(rawText);
  if (chapters.length === 0) {
    return NextResponse.json({ error: "Could not parse book content into chapters" }, { status: 500 });
  }

  const totalPages = estimatePages(rawText);

  // Insert chapters
  await db.insert(bookChapter).values(
    chapters.map((ch) => ({
      readableBookId: bookRow.id,
      chapterNumber: ch.chapterNumber,
      title: ch.title,
      content: ch.content,
      pageStart: ch.pageStart,
      pageEnd: ch.pageEnd,
    })),
  );

  // Update the book's totalPages and totalChapters
  await db
    .update(readableBook)
    .set({
      totalPages,
      totalChapters: chapters.length,
      updatedAt: new Date(),
    })
    .where(eq(readableBook.id, bookRow.id));

  return NextResponse.json({
    message: "Content loaded successfully",
    chapters: chapters.length,
    totalPages,
  });
}
