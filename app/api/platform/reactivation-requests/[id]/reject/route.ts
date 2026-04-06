import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationReactivationRequest } from "@/lib/db/schema";
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

    const [requestRow] = await db
      .select({ id: organizationReactivationRequest.id, status: organizationReactivationRequest.status })
      .from(organizationReactivationRequest)
      .where(eq(organizationReactivationRequest.id, id))
      .limit(1);

    if (!requestRow) {
      return NextResponse.json({ error: "Reactivation request not found" }, { status: 404 });
    }

    if (requestRow.status !== "PENDING") {
      return NextResponse.json({ error: "Reactivation request is not pending" }, { status: 400 });
    }

    await db
      .update(organizationReactivationRequest)
      .set({
        status: "REJECTED",
        reviewedByUserId: access.actorUserId,
        reviewedAt: new Date(),
        reviewNotes: reason,
        updatedAt: new Date(),
      })
      .where(eq(organizationReactivationRequest.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Reject reactivation request error:", error);
    return NextResponse.json({ error: "Failed to reject reactivation request" }, { status: 500 });
  }
}
