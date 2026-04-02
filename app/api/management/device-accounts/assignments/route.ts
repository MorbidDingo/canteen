import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationDevice, organizationDeviceAssignment, organizationMembership } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

type DeviceType = "GATE" | "KIOSK" | "LIBRARY";

function roleForDeviceType(deviceType: DeviceType): "ADMIN" | "LIB_OPERATOR" | "ATTENDANCE" {
  if (deviceType === "LIBRARY") return "LIB_OPERATOR";
  if (deviceType === "GATE") return "ATTENDANCE";
  return "ADMIN";
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const organizationId = access.activeOrganizationId!;

    const body = (await request.json().catch(() => ({}))) as {
      deviceId?: string;
      userId?: string;
    };

    const deviceId = body.deviceId?.trim();
    const userId = body.userId?.trim();

    if (!deviceId || !userId) {
      return NextResponse.json({ error: "deviceId and userId are required" }, { status: 400 });
    }

    const [device] = await db
      .select({ id: organizationDevice.id, deviceType: organizationDevice.deviceType })
      .from(organizationDevice)
      .where(and(eq(organizationDevice.id, deviceId), eq(organizationDevice.organizationId, organizationId)))
      .limit(1);

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const [membership] = await db
      .select({ id: organizationMembership.id, role: organizationMembership.role })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.userId, userId),
          eq(organizationMembership.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "User is not an active member of this organization" }, { status: 400 });
    }

    if (membership.role === "DEVICE") {
      return NextResponse.json(
        {
          error: "Device login accounts cannot be assigned as terminal operators",
          code: "DEVICE_ACCOUNT_NOT_ASSIGNABLE",
        },
        { status: 400 },
      );
    }

    const requiredRole = roleForDeviceType(device.deviceType as DeviceType);
    if (membership.role !== requiredRole) {
      return NextResponse.json(
        {
          error: `Only ${requiredRole} users can be assigned to this ${device.deviceType} device`,
          code: "ROLE_DEVICE_MISMATCH",
        },
        { status: 400 },
      );
    }

    const now = new Date();

    await db
      .insert(organizationDeviceAssignment)
      .values({
        id: crypto.randomUUID(),
        organizationId,
        deviceId,
        userId,
        assignedByUserId: access.actorUserId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    logAudit({
      organizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole ?? "MANAGEMENT",
      action: AUDIT_ACTIONS.DEVICE_ASSIGNED,
      details: { deviceId, assignedUserId: userId },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Assign device user error:", error);
    return NextResponse.json({ error: "Failed to assign user" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const organizationId = access.activeOrganizationId!;

    const body = (await request.json().catch(() => ({}))) as {
      deviceId?: string;
      userId?: string;
    };

    const deviceId = body.deviceId?.trim();
    const userId = body.userId?.trim();

    if (!deviceId || !userId) {
      return NextResponse.json({ error: "deviceId and userId are required" }, { status: 400 });
    }

    await db
      .delete(organizationDeviceAssignment)
      .where(
        and(
          eq(organizationDeviceAssignment.organizationId, organizationId),
          eq(organizationDeviceAssignment.deviceId, deviceId),
          eq(organizationDeviceAssignment.userId, userId),
        ),
      );

    logAudit({
      organizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole ?? "MANAGEMENT",
      action: AUDIT_ACTIONS.DEVICE_UNASSIGNED,
      details: { deviceId, unassignedUserId: userId },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Remove device user error:", error);
    return NextResponse.json({ error: "Failed to remove assignment" }, { status: 500 });
  }
}
