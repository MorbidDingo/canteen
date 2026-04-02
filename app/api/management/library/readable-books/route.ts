import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readableBook, bookChapter, library } from "@/lib/db/schema";
import { and, eq, or, ilike, count } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { searchBookImage } from "@/lib/book-search";

/**
 * GET /api/management/library/readable-books
 *
 * List all readable (digital) books for the organization.
 * Supports search by title/author, filtering by content type.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "LIB_OPERATOR"],
    });

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const contentType = searchParams.get("contentType")?.trim();
    const category = searchParams.get("category")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = (page - 1) * limit;

    const organizationId = access.activeOrganizationId!;

    const conditions = [eq(readableBook.organizationId, organizationId)];

    if (q) {
      conditions.push(
        or(
          ilike(readableBook.title, `%${q}%`),
          ilike(readableBook.author, `%${q}%`),
          ilike(readableBook.isbn, `%${q}%`),
        )!,
      );
    }

    if (contentType && ["TEXT", "PDF", "SCANNED"].includes(contentType)) {
      conditions.push(eq(readableBook.contentType, contentType as "TEXT" | "PDF" | "SCANNED"));
    }

    if (category) {
      conditions.push(eq(readableBook.category, category.toUpperCase()));
    }

    const [totalResult] = await db
      .select({ total: count() })
      .from(readableBook)
      .where(and(...conditions));

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
        isbn: readableBook.isbn,
        status: readableBook.status,
        createdAt: readableBook.createdAt,
        updatedAt: readableBook.updatedAt,
      })
      .from(readableBook)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      books,
      pagination: {
        page,
        limit,
        total: totalResult.total,
        totalPages: Math.ceil(totalResult.total / limit),
      },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}

/**
 * POST /api/management/library/readable-books
 *
 * Create a new readable book with content type (TEXT, PDF, or SCANNED).
 * For TEXT type, chapters can be provided inline.
 * For PDF type, the pdfUrl should be provided.
 * For SCANNED type, the pdfUrl should be provided — no vectorization/AI support.
 * Cover image can be uploaded via coverImageUrl, or fetched via ISBN.
 */
export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "LIB_OPERATOR"],
    });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    const {
      title,
      author,
      isbn,
      category,
      description,
      coverImageUrl: providedCoverUrl,
      language,
      contentType,
      libraryId,
      chapters: chaptersInput,
      pdfUrl,
    } = body as Record<string, unknown>;

    // Validate required fields
    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (typeof author !== "string" || !author.trim()) {
      return NextResponse.json({ error: "author is required" }, { status: 400 });
    }

    // Validate content type
    const validContentTypes = ["TEXT", "PDF", "SCANNED"];
    const normalizedContentType = typeof contentType === "string" && validContentTypes.includes(contentType.toUpperCase())
      ? contentType.toUpperCase() as "TEXT" | "PDF" | "SCANNED"
      : "TEXT";

    const organizationId = access.activeOrganizationId!;

    // Validate libraryId if provided
    let normalizedLibraryId: string | null = null;
    if (typeof libraryId === "string" && libraryId.trim()) {
      const [lib] = await db
        .select({ id: library.id })
        .from(library)
        .where(
          and(
            eq(library.id, libraryId.trim()),
            eq(library.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!lib) {
        return NextResponse.json({ error: "Library not found in this organization" }, { status: 404 });
      }
      normalizedLibraryId = lib.id;
    }

    // Determine cover image
    let coverUrl: string | null = typeof providedCoverUrl === "string" && providedCoverUrl.trim()
      ? providedCoverUrl.trim()
      : null;

    if (!coverUrl) {
      // Try to fetch cover via ISBN or title/author
      try {
        const isbnStr = typeof isbn === "string" ? isbn.trim() : null;
        const imageResult = await searchBookImage(title.trim(), author.trim(), isbnStr || null);
        if (imageResult?.imageUrl) {
          coverUrl = imageResult.imageUrl;
        }
      } catch {
        // Silently skip cover fetch failures
      }
    }

    // Normalize category
    const normalizedCategory = typeof category === "string" && category.trim()
      ? category.trim().replace(/\s+/g, "_").toUpperCase()
      : "GENERAL";

    // Create readable book
    const [inserted] = await db
      .insert(readableBook)
      .values({
        organizationId,
        libraryId: normalizedLibraryId,
        title: title.trim(),
        author: author.trim(),
        isbn: typeof isbn === "string" ? isbn.trim() || null : null,
        category: normalizedCategory,
        description: typeof description === "string" ? description.trim() || null : null,
        coverImageUrl: coverUrl,
        language: typeof language === "string" && language.trim() ? language.trim() : "en",
        contentType: normalizedContentType,
        isPublicDomain: false,
        sourceUrl: typeof pdfUrl === "string" ? pdfUrl.trim() || null : null,
        status: "ACTIVE",
      })
      .returning();

    // For TEXT type, insert chapters if provided
    if (normalizedContentType === "TEXT" && Array.isArray(chaptersInput) && chaptersInput.length > 0) {
      const validChapters = chaptersInput
        .filter(
          (ch): ch is { title: string; content: string; chapterNumber?: number } =>
            typeof ch === "object" &&
            ch !== null &&
            typeof (ch as Record<string, unknown>).title === "string" &&
            typeof (ch as Record<string, unknown>).content === "string",
        )
        .map((ch, index) => ({
          readableBookId: inserted.id,
          chapterNumber: typeof ch.chapterNumber === "number" ? ch.chapterNumber : index + 1,
          title: ch.title.trim(),
          content: ch.content,
          pageStart: 1,
          pageEnd: 1,
        }));

      if (validChapters.length > 0) {
        await db.insert(bookChapter).values(validChapters);

        // Update total chapters and approximate pages
        const totalChars = validChapters.reduce((sum, ch) => sum + ch.content.length, 0);
        const estimatedPages = Math.max(1, Math.ceil(totalChars / 2000));

        await db
          .update(readableBook)
          .set({
            totalChapters: validChapters.length,
            totalPages: estimatedPages,
          })
          .where(eq(readableBook.id, inserted.id));

        inserted.totalChapters = validChapters.length;
        inserted.totalPages = estimatedPages;
      }
    }

    // Audit log
    try {
      await logAudit({
        organizationId,
        action: AUDIT_ACTIONS.READABLE_BOOK_CREATED,
        userId: access.session.user.id,
        userRole: access.membershipRole ?? "UNKNOWN",
        details: {
          readableBookId: inserted.id,
          title: inserted.title,
          contentType: normalizedContentType,
        },
      });
    } catch {
      // Non-critical — don't fail the request
    }

    return NextResponse.json({ book: inserted }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
