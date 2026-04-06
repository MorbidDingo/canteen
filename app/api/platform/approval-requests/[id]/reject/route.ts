import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationApprovalRequest } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER", "PLATFORM_SUPPORT"],
    });

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reason = body.reason?.trim() || "Rejected by platform owner";

    const now = new Date();
    const [updated] = await db
      .update(organizationApprovalRequest)
      .set({
        status: "REJECTED",
        reviewedByUserId: access.actorUserId,
        reviewedAt: now,
        reviewNotes: reason,
        updatedAt: now,
      })
      .where(and(eq(organizationApprovalRequest.id, id), eq(organizationApprovalRequest.status, "PENDING")))
      .returning({ id: organizationApprovalRequest.id });

    if (!updated) {
      return NextResponse.json({ error: "Approval request not found or not pending" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Reject organization request error:", error);
    return NextResponse.json({ error: "Failed to reject organization request" }, { status: 500 });
  }
}
