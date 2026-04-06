import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookIssuance, bookCopy, book } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// POST /api/lib-operator/reject-return — reject a pending return (set back to ISSUED)
export async function POST(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "LIB_OPERATOR"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Library control endpoints are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  try {
    const { issuanceId } = (await request.json()) as { issuanceId: string };

    if (!issuanceId) {
      return NextResponse.json(
        { success: false, reason: "Missing issuance ID" },
        { status: 400 }
      );
    }

    const issuances = await db
      .select()
      .from(bookIssuance)
      .where(eq(bookIssuance.id, issuanceId))
      .limit(1);

    if (issuances.length === 0 || issuances[0].status !== "RETURN_PENDING") {
      return NextResponse.json(
        { success: false, reason: "Issuance not found or not in RETURN_PENDING status." },
        { status: 200 }
      );
    }

    await db
      .update(bookIssuance)
      .set({
        status: "ISSUED",
        updatedAt: new Date(),
      })
      .where(eq(bookIssuance.id, issuanceId));

    broadcast("library-updated");

    // Notify parent that return was rejected
    const bookDetails = await db
      .select({ title: book.title, accessionNumber: bookCopy.accessionNumber })
      .from(bookCopy)
      .innerJoin(book, eq(book.id, bookCopy.bookId))
      .where(eq(bookCopy.id, issuances[0].bookCopyId))
      .limit(1);
    notifyParentForChild({
      childId: issuances[0].childId,
      type: "LIBRARY_RETURN",
      title: "Return rejected",
      message: `The return of "${bookDetails[0]?.title ?? "a book"}" was rejected by the librarian. The book is still marked as issued.`,
      metadata: { issuanceId, status: "RETURN_REJECTED" },
    }).catch(() => {});

    await logAudit({
      organizationId: access.activeOrganizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole || "LIB_OPERATOR",
      action: AUDIT_ACTIONS.RETURN_REJECTED,
      details: { issuanceId, childId: issuances[0].childId },
      request,
    });

    return NextResponse.json({
      success: true,
      message: "Return rejected. Book is still marked as issued to the student.",
    });
  } catch (error) {
    console.error("[Lib Operator Reject Return] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
