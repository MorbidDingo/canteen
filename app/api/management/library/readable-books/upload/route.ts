import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readableBook, bookChapter, library } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { uploadFileToS3 } from "@/lib/s3";
import { parseIntoChapters, estimatePages } from "@/lib/gutenberg";
import { searchBookImage } from "@/lib/book-search";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/html",
]);

/**
 * POST /api/management/library/readable-books/upload
 *
 * Upload a book file (PDF or plain text) and create a readable book entry.
 * FormData fields:
 *   file      - the book file (required)
 *   title     - book title (required)
 *   author    - book author (required)
 *   category  - category string (optional, default "GENERAL")
 *   description - description (optional)
 *   language  - language code (optional, default "en")
 *   libraryId - library uuid (optional)
 *   isbn      - ISBN (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "LIB_OPERATOR"],
    });

    const organizationId = access.activeOrganizationId!;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string)?.trim();
    const author = (formData.get("author") as string)?.trim();
    const category = ((formData.get("category") as string)?.trim() || "GENERAL").replace(/\s+/g, "_").toUpperCase();
    const description = (formData.get("description") as string)?.trim() || null;
    const language = (formData.get("language") as string)?.trim() || "en";
    const libraryId = (formData.get("libraryId") as string)?.trim() || null;
    const isbn = (formData.get("isbn") as string)?.trim() || null;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!author) {
      return NextResponse.json({ error: "Author is required" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Allowed: PDF, plain text, HTML.` },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum: 50MB.` },
        { status: 400 },
      );
    }

    // Validate libraryId
    let normalizedLibraryId: string | null = null;
    if (libraryId) {
      const [lib] = await db
        .select({ id: library.id })
        .from(library)
        .where(and(eq(library.id, libraryId), eq(library.organizationId, organizationId)))
        .limit(1);
      if (!lib) {
        return NextResponse.json({ error: "Library not found" }, { status: 404 });
      }
      normalizedLibraryId = lib.id;
    }

    // Determine content type from MIME
    const isPdf = file.type === "application/pdf";
    const contentType: "TEXT" | "PDF" = isPdf ? "PDF" : "TEXT";

    // Create the readableBook first to get its ID
    // Try to get a cover image
    let coverUrl: string | null = null;
    try {
      const imageResult = await searchBookImage(title, author, isbn);
      if (imageResult?.imageUrl) coverUrl = imageResult.imageUrl;
    } catch {
      // Non-critical
    }

    const [inserted] = await db
      .insert(readableBook)
      .values({
        organizationId,
        libraryId: normalizedLibraryId,
        title,
        author,
        isbn,
        category,
        description,
        coverImageUrl: coverUrl,
        language,
        contentType,
        isPublicDomain: false,
        status: "ACTIVE",
      })
      .returning();

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to S3
    const ext = isPdf ? "pdf" : "txt";
    const s3Key = `books/${inserted.id}/content.${ext}`;
    await uploadFileToS3(s3Key, buffer, file.type);

    // Store the S3 key as sourceUrl
    await db
      .update(readableBook)
      .set({ sourceUrl: s3Key, updatedAt: new Date() })
      .where(eq(readableBook.id, inserted.id));

    // For text files, parse into chapters
    if (!isPdf) {
      const textContent = buffer.toString("utf-8");
      const chapters = parseIntoChapters(textContent);
      const totalPages = estimatePages(textContent);

      if (chapters.length > 0) {
        await db.insert(bookChapter).values(
          chapters.map((ch) => ({
            readableBookId: inserted.id,
            chapterNumber: ch.chapterNumber,
            title: ch.title,
            content: ch.content,
            pageStart: ch.pageStart,
            pageEnd: ch.pageEnd,
          })),
        );

        await db
          .update(readableBook)
          .set({
            totalChapters: chapters.length,
            totalPages,
            updatedAt: new Date(),
          })
          .where(eq(readableBook.id, inserted.id));

        inserted.totalChapters = chapters.length;
        inserted.totalPages = totalPages;
      }
    }

    // Audit
    try {
      await logAudit({
        organizationId,
        action: AUDIT_ACTIONS.READABLE_BOOK_CREATED,
        userId: access.session.user.id,
        userRole: access.membershipRole ?? "UNKNOWN",
        details: {
          readableBookId: inserted.id,
          title,
          contentType,
          fileSize: file.size,
          s3Key,
        },
      });
    } catch {
      // Non-critical
    }

    return NextResponse.json(
      {
        book: { ...inserted, sourceUrl: s3Key },
        message: isPdf
          ? "PDF uploaded. Book is available for reading."
          : `Text file uploaded. ${inserted.totalChapters} chapters extracted.`,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
