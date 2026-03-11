import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// GET — list copies for a book
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user || !["MANAGEMENT", "LIB_OPERATOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const copies = await db
    .select()
    .from(bookCopy)
    .where(eq(bookCopy.bookId, id))
    .orderBy(bookCopy.accessionNumber);

  return NextResponse.json({ copies });
}

// POST — add a new copy
export async function POST(
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
    const { accessionNumber, condition, location } = body;

    if (!accessionNumber?.trim()) {
      return NextResponse.json({ error: "Accession number is required" }, { status: 400 });
    }

    // Verify book exists
    const [parentBook] = await db
      .select({ id: book.id, title: book.title })
      .from(book)
      .where(eq(book.id, id))
      .limit(1);

    if (!parentBook) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Check accession number uniqueness
    const [dup] = await db
      .select({ id: bookCopy.id })
      .from(bookCopy)
      .where(eq(bookCopy.accessionNumber, accessionNumber.trim()))
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
          bookId: id,
          accessionNumber: accessionNumber.trim(),
          condition: condition || "NEW",
          status: "AVAILABLE",
          location: location?.trim() || null,
        })
        .returning();

      // Update cached counts
      await tx
        .update(book)
        .set({
          totalCopies: parentBook.title ? undefined : 0, // placeholder
          updatedAt: new Date(),
        })
        .where(eq(book.id, id));

      // Recalculate counts from source of truth
      const allCopies = await tx
        .select({ status: bookCopy.status })
        .from(bookCopy)
        .where(eq(bookCopy.bookId, id));

      const total = allCopies.filter((c) => c.status !== "RETIRED").length;
      const available = allCopies.filter((c) => c.status === "AVAILABLE").length;

      await tx
        .update(book)
        .set({ totalCopies: total, availableCopies: available, updatedAt: new Date() })
        .where(eq(book.id, id));

      return [copy];
    });

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.BOOK_COPY_ADDED,
      details: {
        bookId: id,
        bookTitle: parentBook.title,
        copyId: created.id,
        accessionNumber: created.accessionNumber,
      },
      request,
    });

    return NextResponse.json({ copy: created }, { status: 201 });
  } catch (error) {
    console.error("Add copy error:", error);
    return NextResponse.json({ error: "Failed to add copy" }, { status: 500 });
  }
}
