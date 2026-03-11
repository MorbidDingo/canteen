import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy, bookIssuance } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// Helper to recalculate cached book copy counts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recalcCopyCounts(tx: any, bookId: string) {
  const allCopies = await tx
    .select({ status: bookCopy.status })
    .from(bookCopy)
    .where(eq(bookCopy.bookId, bookId));

  const total = allCopies.filter((c: { status: string }) => c.status !== "RETIRED").length;
  const available = allCopies.filter((c: { status: string }) => c.status === "AVAILABLE").length;

  await tx
    .update(book)
    .set({ totalCopies: total, availableCopies: available, updatedAt: new Date() })
    .where(eq(book.id, bookId));
}

// PATCH — update copy details (condition, location, status)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; copyId: string }> },
) {
  const session = await getSession();
  if (!session?.user || !["MANAGEMENT", "LIB_OPERATOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id, copyId } = await params;
    const body = await request.json();
    const { condition, location, status } = body;

    const [existing] = await db
      .select()
      .from(bookCopy)
      .where(and(eq(bookCopy.id, copyId), eq(bookCopy.bookId, id)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Copy not found" }, { status: 404 });
    }

    // Don't allow setting status to AVAILABLE/ISSUED directly if currently active
    if (
      status &&
      existing.status === "ISSUED" &&
      status !== "ISSUED" &&
      status !== "LOST"
    ) {
      // Check if there's an active issuance
      const [active] = await db
        .select({ id: bookIssuance.id })
        .from(bookIssuance)
        .where(
          and(
            eq(bookIssuance.bookCopyId, copyId),
            inArray(bookIssuance.status, ["ISSUED", "RETURN_PENDING"]),
          ),
        )
        .limit(1);

      if (active) {
        return NextResponse.json(
          { error: "Cannot change status: copy has an active issuance" },
          { status: 409 },
        );
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (condition !== undefined) updates.condition = condition;
    if (location !== undefined) updates.location = location?.trim() || null;
    if (status !== undefined) updates.status = status;

    await db.transaction(async (tx) => {
      await tx
        .update(bookCopy)
        .set(updates)
        .where(eq(bookCopy.id, copyId));

      if (status !== undefined) {
        await recalcCopyCounts(tx, id);
      }
    });

    const [updated] = await db
      .select()
      .from(bookCopy)
      .where(eq(bookCopy.id, copyId))
      .limit(1);

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.BOOK_COPY_UPDATED,
      details: {
        bookId: id,
        copyId,
        accessionNumber: existing.accessionNumber,
        changes: Object.keys(updates).filter((k) => k !== "updatedAt"),
      },
      request,
    });

    return NextResponse.json({ copy: updated });
  } catch (error) {
    console.error("Update copy error:", error);
    return NextResponse.json({ error: "Failed to update copy" }, { status: 500 });
  }
}

// DELETE — retire a copy (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; copyId: string }> },
) {
  const session = await getSession();
  if (!session?.user || !["MANAGEMENT", "LIB_OPERATOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id, copyId } = await params;

    const [existing] = await db
      .select()
      .from(bookCopy)
      .where(and(eq(bookCopy.id, copyId), eq(bookCopy.bookId, id)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Copy not found" }, { status: 404 });
    }

    // Check active issuances
    const [active] = await db
      .select({ id: bookIssuance.id })
      .from(bookIssuance)
      .where(
        and(
          eq(bookIssuance.bookCopyId, copyId),
          inArray(bookIssuance.status, ["ISSUED", "RETURN_PENDING"]),
        ),
      )
      .limit(1);

    if (active) {
      return NextResponse.json(
        { error: "Cannot retire: copy has an active issuance" },
        { status: 409 },
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(bookCopy)
        .set({ status: "RETIRED", updatedAt: new Date() })
        .where(eq(bookCopy.id, copyId));

      await recalcCopyCounts(tx, id);
    });

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.BOOK_COPY_RETIRED,
      details: {
        bookId: id,
        copyId,
        accessionNumber: existing.accessionNumber,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Retire copy error:", error);
    return NextResponse.json({ error: "Failed to retire copy" }, { status: 500 });
  }
}
