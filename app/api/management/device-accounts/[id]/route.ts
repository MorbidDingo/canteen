import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationDevice } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const organizationId = access.activeOrganizationId!;
    const { id } = await params;

    const body = (await request.json().catch(() => ({}))) as {
      status?: "ACTIVE" | "DISABLED";
    };

    if (!body.status || !["ACTIVE", "DISABLED"].includes(body.status)) {
      return NextResponse.json({ error: "Valid status is required" }, { status: 400 });
    }

    const [updated] = await db
      .update(organizationDevice)
      .set({
        status: body.status,
        updatedAt: new Date(),
      })
      .where(and(eq(organizationDevice.id, id), eq(organizationDevice.organizationId, organizationId)))
      .returning({ id: organizationDevice.id, status: organizationDevice.status });

    if (!updated) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    logAudit({
      organizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole ?? "MANAGEMENT",
      action: AUDIT_ACTIONS.DEVICE_STATUS_UPDATED,
      details: { deviceId: id, status: body.status },
      request,
    });

    return NextResponse.json({ success: true, device: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Device status update error:", error);
    return NextResponse.json({ error: "Failed to update device" }, { status: 500 });
  }
}
