import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// GET - list copies for a book
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

    const copies = await db
      .select()
      .from(bookCopy)
      .where(and(eq(bookCopy.bookId, id), eq(bookCopy.organizationId, access.activeOrganizationId!)))
      .orderBy(bookCopy.accessionNumber);

    return NextResponse.json({ copies });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Management library copies list error:", error);
    return NextResponse.json({ error: "Failed to fetch copies" }, { status: 500 });
  }
}

// POST - add a new copy
export async function POST(
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
    const { accessionNumber, condition, location } = body;

    if (!accessionNumber?.trim()) {
      return NextResponse.json({ error: "Accession number is required" }, { status: 400 });
    }

    // Verify book exists
    const [parentBook] = await db
      .select({ id: book.id, title: book.title, libraryId: book.libraryId })
      .from(book)
      .where(and(eq(book.id, id), eq(book.organizationId, access.activeOrganizationId!)))
      .limit(1);

    if (!parentBook) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Check accession number uniqueness
    const [dup] = await db
      .select({ id: bookCopy.id })
      .from(bookCopy)
      .where(and(eq(bookCopy.accessionNumber, accessionNumber.trim()), eq(bookCopy.organizationId, access.activeOrganizationId!)))
      .limit(1);

    if (dup) {
      return NextResponse.json(
        { error: `Accession number ${accessionNumber.trim()} already exists` },
        { status: 409 },
      );
    }

    const [created] = await db.transaction(async (tx) => {
      const [copy] = await tx
        .insert(bookCopy)
        .values({
          organizationId: access.activeOrganizationId!,
          libraryId: parentBook.libraryId,
          bookId: id,
          accessionNumber: accessionNumber.trim(),
          condition: condition || "NEW",
          status: "AVAILABLE",
          location: location?.trim() || null,
        })
        .returning();

      // Recalculate counts from source of truth
      const allCopies = await tx
        .select({ status: bookCopy.status })
        .from(bookCopy)
        .where(and(eq(bookCopy.bookId, id), eq(bookCopy.organizationId, access.activeOrganizationId!)));

      const total = allCopies.filter((c) => c.status !== "RETIRED").length;
      const available = allCopies.filter((c) => c.status === "AVAILABLE").length;

      await tx
        .update(book)
        .set({ totalCopies: total, availableCopies: available, updatedAt: new Date() })
        .where(eq(book.id, id));

      return [copy];
    });

    await logAudit({
      userId: access.actorUserId,
      userRole: access.membershipRole || access.session.user.role,
      action: AUDIT_ACTIONS.BOOK_COPY_ADDED,
      details: {
        organizationId: access.activeOrganizationId,
        bookId: id,
        bookTitle: parentBook.title,
        copyId: created.id,
        accessionNumber: created.accessionNumber,
      },
      request,
    });

    return NextResponse.json({ copy: created }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Add copy error:", error);
    return NextResponse.json({ error: "Failed to add copy" }, { status: 500 });
  }
}
