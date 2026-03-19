import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization, organizationDevice, organizationDeviceAssignment, organizationMembership, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
    });

    const organizationId = access.activeOrganizationId!;

    const [orgRow] = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
      })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);

    const [membershipRow] = await db
      .select({ role: organizationMembership.role })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.userId, access.actorUserId),
          eq(organizationMembership.status, "ACTIVE"),
        ),
      )
      .limit(1);

    const loginDevices = await db
      .select({
        id: organizationDevice.id,
        deviceType: organizationDevice.deviceType,
        deviceName: organizationDevice.deviceName,
        deviceCode: organizationDevice.deviceCode,
        status: organizationDevice.status,
      })
      .from(organizationDevice)
      .where(
        and(
          eq(organizationDevice.organizationId, organizationId),
          eq(organizationDevice.loginUserId, access.actorUserId),
        ),
      );

    const assignedRows = await db
      .select({
        deviceId: organizationDeviceAssignment.deviceId,
      })
      .from(organizationDeviceAssignment)
      .where(
        and(
          eq(organizationDeviceAssignment.organizationId, organizationId),
          eq(organizationDeviceAssignment.userId, access.actorUserId),
        ),
      );

    const assignedDeviceIds = assignedRows.map((row) => row.deviceId);

    const assignedDevices = assignedDeviceIds.length
      ? await db
          .select({
            id: organizationDevice.id,
            deviceType: organizationDevice.deviceType,
            deviceName: organizationDevice.deviceName,
            deviceCode: organizationDevice.deviceCode,
            status: organizationDevice.status,
          })
          .from(organizationDevice)
          .where(
            and(
              eq(organizationDevice.organizationId, organizationId),
              inArray(organizationDevice.id, assignedDeviceIds),
            ),
          )
      : [];

    const deviceMap = new Map<string, {
      id: string;
      deviceType: string;
      deviceName: string;
      deviceCode: string;
      status: string;
    }>();

    for (const device of loginDevices) {
      deviceMap.set(device.id, device);
    }

    for (const device of assignedDevices) {
      deviceMap.set(device.id, device);
    }

    const devices = Array.from(deviceMap.values());

    return NextResponse.json({
      organization: orgRow,
      actor: {
        userId: access.actorUserId,
        name: access.session.user.name,
        email: access.session.user.email,
        role: membershipRow?.role || access.membershipRole,
      },
      devices,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Org context error:", error);
    return NextResponse.json({ error: "Failed to fetch org context" }, { status: 500 });
  }
}
