import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy, bookIssuance } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// GET — single book with copies
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "LIB_OPERATOR"],
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

// PATCH — update book details
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "LIB_OPERATOR"],
    });

    const { id } = await params;
    const body = await request.json();
    const { title, author, isbn, publisher, edition, category, description } = body;

    const [existing] = await db
      .select({ id: book.id })
      .from(book)
      .where(and(eq(book.id, id), eq(book.organizationId, access.activeOrganizationId!)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Check duplicate ISBN if changed
    if (isbn?.trim()) {
      const [dup] = await db
        .select({ id: book.id })
        .from(book)
        .where(and(eq(book.isbn, isbn.trim()), eq(book.organizationId, access.activeOrganizationId!)))
        .limit(1);
      if (dup && dup.id !== id) {
        return NextResponse.json(
          { error: `A book with ISBN ${isbn.trim()} already exists` },
          { status: 409 },
        );
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title.trim();
    if (author !== undefined) updates.author = author.trim();
    if (isbn !== undefined) updates.isbn = isbn?.trim() || null;
    if (publisher !== undefined) updates.publisher = publisher?.trim() || null;
    if (edition !== undefined) updates.edition = edition?.trim() || null;
    if (category !== undefined) updates.category = category;
    if (description !== undefined) updates.description = description?.trim() || null;

    const [updated] = await db
      .update(book)
      .set(updates)
      .where(and(eq(book.id, id), eq(book.organizationId, access.activeOrganizationId!)))
      .returning();

    await logAudit({
      userId: access.actorUserId,
      userRole: access.membershipRole || access.session.user.role,
      action: AUDIT_ACTIONS.BOOK_UPDATED,
      details: {
        organizationId: access.activeOrganizationId,
        bookId: id,
        changes: Object.keys(updates).filter((k) => k !== "updatedAt"),
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

// DELETE — archive book (retire all copies)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "LIB_OPERATOR"],
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
            inArray(bookIssuance.status, ["ISSUED", "RETURN_PENDING"]),
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
