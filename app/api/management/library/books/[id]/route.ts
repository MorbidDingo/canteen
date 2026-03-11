import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy, bookIssuance } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// GET — single book with copies
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user || !["MANAGEMENT", "LIB_OPERATOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const [foundBook] = await db
    .select()
    .from(book)
    .where(eq(book.id, id))
    .limit(1);

  if (!foundBook) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const copies = await db
    .select()
    .from(bookCopy)
    .where(eq(bookCopy.bookId, id))
    .orderBy(bookCopy.accessionNumber);

  return NextResponse.json({ book: foundBook, copies });
}

// PATCH — update book details
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user || !["MANAGEMENT", "LIB_OPERATOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { title, author, isbn, publisher, edition, category, description } = body;

    const [existing] = await db
      .select({ id: book.id })
      .from(book)
      .where(eq(book.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Check duplicate ISBN if changed
    if (isbn?.trim()) {
      const [dup] = await db
        .select({ id: book.id })
        .from(book)
        .where(and(eq(book.isbn, isbn.trim())))
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
      .where(eq(book.id, id))
      .returning();

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.BOOK_UPDATED,
      details: { bookId: id, changes: Object.keys(updates).filter((k) => k !== "updatedAt") },
      request,
    });

    return NextResponse.json({ book: updated });
  } catch (error) {
    console.error("Update book error:", error);
    return NextResponse.json({ error: "Failed to update book" }, { status: 500 });
  }
}

// DELETE — archive book (retire all copies)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user || !["MANAGEMENT", "LIB_OPERATOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;

    const [foundBook] = await db
      .select()
      .from(book)
      .where(eq(book.id, id))
      .limit(1);

    if (!foundBook) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Check for active issuances
    const copies = await db
      .select({ id: bookCopy.id })
      .from(bookCopy)
      .where(eq(bookCopy.bookId, id));

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
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.BOOK_ARCHIVED,
      details: { bookId: id, title: foundBook.title, copiesRetired: copies.length },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Archive book error:", error);
    return NextResponse.json({ error: "Failed to archive book" }, { status: 500 });
  }
}
