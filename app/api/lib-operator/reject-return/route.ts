import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookIssuance } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { broadcast } from "@/lib/sse";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// POST /api/lib-operator/reject-return — reject a pending return (set back to ISSUED)
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "LIB_OPERATOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
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
