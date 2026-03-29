import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy, library } from "@/lib/db/schema";
import { and, eq, or, ilike, count, isNull } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { searchBookImage } from "@/lib/book-search";

const MAX_EDITABLE_QUANTITY = 5000;
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function normalizeCategoryInput(input: unknown): string {
  if (typeof input !== "string") return "GENERAL";
  const normalized = input.trim().replace(/\s+/g, "_").toUpperCase();
  return normalized || "GENERAL";
}

function parseQuantityInput(input: unknown): number | null {
  if (input === undefined || input === null || input === "") return 0;

  const parsed = Number.parseInt(String(input), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  if (parsed > MAX_EDITABLE_QUANTITY) return null;
  return parsed;
}

function generateAutoAccessionNumber(bookId: string): string {
  const bookHint = bookId.replace(/-/g, "").slice(0, 6).toUpperCase() || "BOOK";
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `AUTO-${bookHint}-${randomPart}`;
}

async function createAutoCopies(
  tx: DbTransaction,
  organizationId: string,
  bookId: string,
  quantity: number,
  libraryId: string | null,
) {
  if (quantity <= 0) return;

  const values = Array.from({ length: quantity }, () => ({
    organizationId,
    libraryId,
    bookId,
    accessionNumber: generateAutoAccessionNumber(bookId),
    condition: "NEW" as const,
    status: "AVAILABLE" as const,
    location: "AUTO",
  }));

  await tx.insert(bookCopy).values(values);
}

// GET - list/search books with copy counts
export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "LIB_OPERATOR"],
    });

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const category = searchParams.get("category")?.trim();
    const libraryId = searchParams.get("libraryId")?.trim() || null;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = (page - 1) * limit;

    if (libraryId) {
      const [libraryRow] = await db
        .select({ id: library.id })
        .from(library)
        .where(and(eq(library.id, libraryId), eq(library.organizationId, access.activeOrganizationId!)))
        .limit(1);
      if (!libraryRow) {
        return NextResponse.json({ error: "Invalid library selected" }, { status: 400 });
      }
    }

    const conditions = [eq(book.organizationId, access.activeOrganizationId!)];

    if (libraryId) {
      conditions.push(eq(book.libraryId, libraryId));
    }

    if (q && q.length >= 2) {
      conditions.push(
        or(
          ilike(book.title, `%${q}%`),
          ilike(book.author, `%${q}%`),
          ilike(book.isbn, `%${q}%`),
        )!,
      );
    }

    if (category) {
      conditions.push(eq(book.category, category));
    }

    const where = and(...conditions);
    const categoryConditions = [eq(book.organizationId, access.activeOrganizationId!)];
    if (libraryId) {
      categoryConditions.push(eq(book.libraryId, libraryId));
    }

    const [books, [total], categoryRows] = await Promise.all([
      db
        .select({
          id: book.id,
          isbn: book.isbn,
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          edition: book.edition,
          category: book.category,
          description: book.description,
          libraryId: book.libraryId,
          libraryName: library.name,
          libraryLocation: library.location,
          totalCopies: book.totalCopies,
          availableCopies: book.availableCopies,
          createdAt: book.createdAt,
          updatedAt: book.updatedAt,
        })
        .from(book)
        .leftJoin(library, eq(book.libraryId, library.id))
        .where(where)
        .orderBy(book.title)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(book)
        .where(where),
      db
        .select({ category: book.category })
        .from(book)
        .where(and(...categoryConditions))
        .groupBy(book.category)
        .orderBy(book.category),
    ]);

    return NextResponse.json({
      books,
      categories: categoryRows.map((row) => row.category),
      pagination: {
        page,
        limit,
        total: total?.count ?? 0,
        totalPages: Math.ceil((total?.count ?? 0) / limit),
      },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Management library books list error:", error);
    return NextResponse.json({ error: "Failed to fetch books" }, { status: 500 });
  }
}

// POST - create a new book
export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "LIB_OPERATOR"],
    });

    const body = await request.json();
    const {
      title,
      author,
      isbn,
      publisher,
      edition,
      category,
      description,
      quantity,
      libraryId,
    } = body;

    const normalizedLibraryId =
      typeof libraryId === "string" && libraryId.trim().length > 0
        ? libraryId.trim()
        : null;

    if (normalizedLibraryId) {
      const [libraryRow] = await db
        .select({ id: library.id })
        .from(library)
        .where(
          and(
            eq(library.id, normalizedLibraryId),
            eq(library.organizationId, access.activeOrganizationId!),
          ),
        )
        .limit(1);

      if (!libraryRow) {
        return NextResponse.json({ error: "Invalid library selected" }, { status: 400 });
      }
    }

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!author?.trim()) {
      return NextResponse.json({ error: "Author is required" }, { status: 400 });
    }

    const parsedQuantity = parseQuantityInput(quantity);
    if (parsedQuantity === null) {
      return NextResponse.json(
        { error: `Quantity must be a whole number between 0 and ${MAX_EDITABLE_QUANTITY}` },
        { status: 400 },
      );
    }

    // Check duplicate ISBN if provided
    if (isbn?.trim()) {
      const [existing] = await db
        .select({ id: book.id })
        .from(book)
        .where(
          and(
            eq(book.isbn, isbn.trim()),
            eq(book.organizationId, access.activeOrganizationId!),
            normalizedLibraryId
              ? eq(book.libraryId, normalizedLibraryId)
              : isNull(book.libraryId),
          ),
        )
        .limit(1);
      if (existing) {
        return NextResponse.json(
          { error: `A book with ISBN ${isbn.trim()} already exists in this library` },
          { status: 409 },
        );
      }
    }

    // Search for book cover image online
    let coverImageUrl: string | null = null;
    try {
      const imageResult = await searchBookImage(title.trim(), author.trim(), isbn?.trim() || null);
      if (imageResult?.imageUrl) {
        coverImageUrl = imageResult.imageUrl;
      }
    } catch {
      // Silently skip image search on error; continue with book creation
    }

    const created = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(book)
        .values({
          title: title.trim(),
          author: author.trim(),
          isbn: isbn?.trim() || null,
          publisher: publisher?.trim() || null,
          edition: edition?.trim() || null,
          category: normalizeCategoryInput(category),
          description: description?.trim() || null,
          coverImageUrl,
          libraryId: normalizedLibraryId,
          organizationId: access.activeOrganizationId!,
          totalCopies: parsedQuantity,
          availableCopies: parsedQuantity,
        })
        .returning();

      await createAutoCopies(
        tx,
        access.activeOrganizationId!,
        inserted.id,
        parsedQuantity,
        normalizedLibraryId,
      );

      return inserted;
    });

    await logAudit({
      userId: access.actorUserId,
      userRole: access.membershipRole || access.session.user.role,
      action: AUDIT_ACTIONS.BOOK_CREATED,
      details: {
        organizationId: access.activeOrganizationId,
        bookId: created.id,
        title: created.title,
        isbn: created.isbn,
        libraryId: created.libraryId,
        category: created.category,
        quantity: parsedQuantity,
      },
      request,
    });

    return NextResponse.json({ book: created }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Create book error:", error);
    return NextResponse.json({ error: "Failed to create book" }, { status: 500 });
  }
}
