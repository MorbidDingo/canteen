import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy, bookIssuance } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// Helper to recalculate cached book copy counts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recalcCopyCounts(tx: any, bookId: string, organizationId: string) {
  const allCopies = await tx
    .select({ status: bookCopy.status })
    .from(bookCopy)
    .where(and(eq(bookCopy.bookId, bookId), eq(bookCopy.organizationId, organizationId)));

  const total = allCopies.filter((c: { status: string }) => c.status !== "RETIRED").length;
  const available = allCopies.filter((c: { status: string }) => c.status === "AVAILABLE").length;

  await tx
    .update(book)
    .set({ totalCopies: total, availableCopies: available, updatedAt: new Date() })
    .where(and(eq(book.id, bookId), eq(book.organizationId, organizationId)));
}

// PATCH — update copy details (condition, location, status)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; copyId: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "LIB_OPERATOR"],
    });

    const { id, copyId } = await params;
    const body = await request.json();
    const { condition, location, status } = body;

    const [existing] = await db
      .select()
      .from(bookCopy)
      .where(and(eq(bookCopy.id, copyId), eq(bookCopy.bookId, id), eq(bookCopy.organizationId, access.activeOrganizationId!)))
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
            inArray(bookIssuance.status, ["ISSUED", "OVERDUE", "RETURN_PENDING"]),
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
        .where(and(eq(bookCopy.id, copyId), eq(bookCopy.organizationId, access.activeOrganizationId!)));

      if (status !== undefined) {
        await recalcCopyCounts(tx, id, access.activeOrganizationId!);
      }
    });

    const [updated] = await db
      .select()
      .from(bookCopy)
      .where(and(eq(bookCopy.id, copyId), eq(bookCopy.organizationId, access.activeOrganizationId!)))
      .limit(1);

    await logAudit({
      userId: access.actorUserId,
      userRole: access.membershipRole || access.session.user.role,
      action: AUDIT_ACTIONS.BOOK_COPY_UPDATED,
      details: {
        organizationId: access.activeOrganizationId,
        bookId: id,
        copyId,
        accessionNumber: existing.accessionNumber,
        changes: Object.keys(updates).filter((k) => k !== "updatedAt"),
      },
      request,
    });

    return NextResponse.json({ copy: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Update copy error:", error);
    return NextResponse.json({ error: "Failed to update copy" }, { status: 500 });
  }
}

// DELETE — retire a copy (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; copyId: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "LIB_OPERATOR"],
    });

    const { id, copyId } = await params;

    const [existing] = await db
      .select()
      .from(bookCopy)
      .where(and(eq(bookCopy.id, copyId), eq(bookCopy.bookId, id), eq(bookCopy.organizationId, access.activeOrganizationId!)))
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
          inArray(bookIssuance.status, ["ISSUED", "OVERDUE", "RETURN_PENDING"]),
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
        .where(and(eq(bookCopy.id, copyId), eq(bookCopy.organizationId, access.activeOrganizationId!)));

      await recalcCopyCounts(tx, id, access.activeOrganizationId!);
    });

    await logAudit({
      userId: access.actorUserId,
      userRole: access.membershipRole || access.session.user.role,
      action: AUDIT_ACTIONS.BOOK_COPY_RETIRED,
      details: {
        organizationId: access.activeOrganizationId,
        bookId: id,
        copyId,
        accessionNumber: existing.accessionNumber,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Retire copy error:", error);
    return NextResponse.json({ error: "Failed to retire copy" }, { status: 500 });
  }
}

