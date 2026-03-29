import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy, bookIssuance, library } from "@/lib/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

const MAX_EDITABLE_QUANTITY = 5000;
const ACTIVE_ISSUANCE_STATUSES = ["ISSUED", "OVERDUE", "RETURN_PENDING"] as const;
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

async function recalcCopyCounts(tx: DbTransaction, bookId: string, organizationId: string, now: Date) {
  const allCopies = await tx
    .select({ status: bookCopy.status })
    .from(bookCopy)
    .where(and(eq(bookCopy.bookId, bookId), eq(bookCopy.organizationId, organizationId)));

  const total = allCopies.filter((c: { status: string }) => c.status !== "RETIRED").length;
  const available = allCopies.filter((c: { status: string }) => c.status === "AVAILABLE").length;

  await tx
    .update(book)
    .set({ totalCopies: total, availableCopies: available, updatedAt: now })
    .where(and(eq(book.id, bookId), eq(book.organizationId, organizationId)));
}

async function adjustBookQuantity(tx: DbTransaction, params: { organizationId: string; bookId: string; targetAvailable: number; now: Date }) {
  const { organizationId, bookId, targetAvailable, now } = params;

  const [currentBook] = await tx
    .select({ availableCopies: book.availableCopies, libraryId: book.libraryId })
    .from(book)
    .where(and(eq(book.id, bookId), eq(book.organizationId, organizationId)))
    .limit(1);

  if (!currentBook) {
    throw new Error("Book not found");
  }

  const currentAvailable = currentBook.availableCopies;

  if (targetAvailable > currentAvailable) {
    await createAutoCopies(
      tx,
      organizationId,
      bookId,
      targetAvailable - currentAvailable,
      currentBook.libraryId,
    );
  } else if (targetAvailable < currentAvailable) {
    const toRetireCount = currentAvailable - targetAvailable;
    const availableCopies = await tx
      .select({ id: bookCopy.id, accessionNumber: bookCopy.accessionNumber })
      .from(bookCopy)
      .where(
        and(
          eq(bookCopy.bookId, bookId),
          eq(bookCopy.organizationId, organizationId),
          eq(bookCopy.status, "AVAILABLE"),
        ),
      );

    if (availableCopies.length < toRetireCount) {
      throw new Error("Not enough available copies to reduce quantity");
    }

    const sorted = [...availableCopies].sort((a, b) => {
      const aAuto = a.accessionNumber.startsWith("AUTO-") ? 0 : 1;
      const bAuto = b.accessionNumber.startsWith("AUTO-") ? 0 : 1;
      return aAuto - bAuto;
    });

    const idsToRetire = sorted.slice(0, toRetireCount).map((copy) => copy.id);

    await tx
      .update(bookCopy)
      .set({ status: "RETIRED", updatedAt: now })
      .where(inArray(bookCopy.id, idsToRetire));
  }

  await recalcCopyCounts(tx, bookId, organizationId, now);
}

// GET - single book with copies
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "LIB_OPERATOR"],
    });

    const { id } = await params;

    const [foundBook] = await db
      .select()
      .from(book)
      .where(and(eq(book.id, id), eq(book.organizationId, access.activeOrganizationId!)))
      .limit(1);

    if (!foundBook) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const copies = await db
      .select()
      .from(bookCopy)
      .where(and(eq(bookCopy.bookId, id), eq(bookCopy.organizationId, access.activeOrganizationId!)))
      .orderBy(bookCopy.accessionNumber);

    return NextResponse.json({ book: foundBook, copies });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Management library book detail error:", error);
    return NextResponse.json({ error: "Failed to fetch book" }, { status: 500 });
  }
}

// PATCH - update book details
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "LIB_OPERATOR"],
    });

    const { id } = await params;
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
        : libraryId === null
          ? null
          : undefined;

    const [existing] = await db
      .select({
        id: book.id,
        availableCopies: book.availableCopies,
        libraryId: book.libraryId,
      })
      .from(book)
      .where(and(eq(book.id, id), eq(book.organizationId, access.activeOrganizationId!)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    if (normalizedLibraryId !== undefined && normalizedLibraryId !== null) {
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

    const targetLibraryId =
      normalizedLibraryId === undefined ? existing.libraryId : normalizedLibraryId;

    // Check duplicate ISBN if changed
    if (isbn?.trim()) {
      const [dup] = await db
        .select({ id: book.id })
        .from(book)
        .where(
          and(
            eq(book.isbn, isbn.trim()),
            eq(book.organizationId, access.activeOrganizationId!),
            targetLibraryId ? eq(book.libraryId, targetLibraryId) : isNull(book.libraryId),
          ),
        )
        .limit(1);
      if (dup && dup.id !== id) {
        return NextResponse.json(
          { error: `A book with ISBN ${isbn.trim()} already exists in this library` },
          { status: 409 },
        );
      }
    }

    const quantityProvided = Object.prototype.hasOwnProperty.call(body, "quantity");
    const parsedQuantity = quantityProvided ? parseQuantityInput(quantity) : null;

    if (quantityProvided && parsedQuantity === null) {
      return NextResponse.json(
        { error: `Quantity must be a whole number between 0 and ${MAX_EDITABLE_QUANTITY}` },
        { status: 400 },
      );
    }

    const now = new Date();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (title !== undefined) {
      if (!String(title).trim()) {
        return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
      }
      updates.title = String(title).trim();
    }
    if (author !== undefined) {
      if (!String(author).trim()) {
        return NextResponse.json({ error: "Author cannot be empty" }, { status: 400 });
      }
      updates.author = String(author).trim();
    }
    if (isbn !== undefined) updates.isbn = isbn?.trim() || null;
    if (publisher !== undefined) updates.publisher = publisher?.trim() || null;
    if (edition !== undefined) updates.edition = edition?.trim() || null;
    if (category !== undefined) updates.category = normalizeCategoryInput(category);
    if (description !== undefined) updates.description = description?.trim() || null;
    if (normalizedLibraryId !== undefined) updates.libraryId = normalizedLibraryId;

    let updated: typeof book.$inferSelect | undefined;

    try {
      await db.transaction(async (tx) => {
        if (Object.keys(updates).length > 1) {
          await tx
            .update(book)
            .set(updates)
            .where(and(eq(book.id, id), eq(book.organizationId, access.activeOrganizationId!)));
        }

        if (quantityProvided) {
          await adjustBookQuantity(tx, {
            organizationId: access.activeOrganizationId!,
            bookId: id,
            targetAvailable: parsedQuantity!,
            now,
          });
        }

        if (normalizedLibraryId !== undefined) {
          await tx
            .update(bookCopy)
            .set({ libraryId: normalizedLibraryId, updatedAt: now })
            .where(and(eq(bookCopy.bookId, id), eq(bookCopy.organizationId, access.activeOrganizationId!)));
        }

        const [latest] = await tx
          .select()
          .from(book)
          .where(and(eq(book.id, id), eq(book.organizationId, access.activeOrganizationId!)))
          .limit(1);

        updated = latest;
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Not enough available copies")) {
        return NextResponse.json(
          {
            error:
              "Cannot reduce quantity below currently available stock constraints. Return or retire copies first.",
          },
          { status: 409 },
        );
      }
      throw error;
    }

    if (!updated) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    await logAudit({
      userId: access.actorUserId,
      userRole: access.membershipRole || access.session.user.role,
      action: AUDIT_ACTIONS.BOOK_UPDATED,
      details: {
        organizationId: access.activeOrganizationId,
        bookId: id,
        changes: Object.keys(updates).filter((k) => k !== "updatedAt"),
        quantityChange: quantityProvided
          ? {
              from: existing.availableCopies,
              to: parsedQuantity,
            }
          : null,
      },
      request,
    });

    return NextResponse.json({ book: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Update book error:", error);
    return NextResponse.json({ error: "Failed to update book" }, { status: 500 });
  }
}

// DELETE - archive book (retire all copies)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "LIB_OPERATOR"],
    });

    const { id } = await params;

    const [foundBook] = await db
      .select()
      .from(book)
      .where(and(eq(book.id, id), eq(book.organizationId, access.activeOrganizationId!)))
      .limit(1);

    if (!foundBook) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Check for active issuances
    const copies = await db
      .select({ id: bookCopy.id })
      .from(bookCopy)
      .where(and(eq(bookCopy.bookId, id), eq(bookCopy.organizationId, access.activeOrganizationId!)));

    if (copies.length > 0) {
      const copyIds = copies.map((c) => c.id);
      const activeIssuances = await db
        .select({ id: bookIssuance.id })
        .from(bookIssuance)
        .where(
          and(
            inArray(bookIssuance.bookCopyId, copyIds),
            inArray(bookIssuance.status, [...ACTIVE_ISSUANCE_STATUSES]),
          ),
        )
        .limit(1);

      if (activeIssuances.length > 0) {
        return NextResponse.json(
          { error: "Cannot archive: book has active issuances. Return all copies first." },
          { status: 409 },
        );
      }
    }

    // Retire all copies and zero out counts
    await db.transaction(async (tx) => {
      if (copies.length > 0) {
        await tx
          .update(bookCopy)
          .set({ status: "RETIRED", updatedAt: new Date() })
          .where(eq(bookCopy.bookId, id));
      }

      await tx
        .update(book)
        .set({ availableCopies: 0, totalCopies: 0, updatedAt: new Date() })
        .where(eq(book.id, id));
    });

    await logAudit({
      userId: access.actorUserId,
      userRole: access.membershipRole || access.session.user.role,
      action: AUDIT_ACTIONS.BOOK_ARCHIVED,
      details: {
        organizationId: access.activeOrganizationId,
        bookId: id,
        title: foundBook.title,
        copiesRetired: copies.length,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Archive book error:", error);
    return NextResponse.json({ error: "Failed to archive book" }, { status: 500 });
  }
}
