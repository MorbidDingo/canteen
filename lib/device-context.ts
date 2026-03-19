import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationDevice, organizationDeviceAssignment } from "@/lib/db/schema";

export type DeviceType = "GATE" | "KIOSK" | "LIBRARY";

export function getRequestIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwarded || realIp || null;
}

export function getRequestUserAgent(request: Request): string | null {
  return request.headers.get("user-agent")?.trim() || null;
}

export async function resolveOrganizationDeviceFromRequest(options: {
  request: Request;
  organizationId: string;
  allowedDeviceTypes?: DeviceType[];
  fallbackDeviceCode?: string | null;
}) {
  const { request, organizationId, allowedDeviceTypes, fallbackDeviceCode } = options;

  const headerDeviceId = request.headers.get("x-device-id")?.trim() || null;
  const headerDeviceCode = request.headers.get("x-device-code")?.trim().toUpperCase() || null;
  const resolvedDeviceCode = (fallbackDeviceCode || headerDeviceCode || null)?.trim().toUpperCase() || null;

  if (headerDeviceId) {
    const rows = await db
      .select({
        id: organizationDevice.id,
        deviceType: organizationDevice.deviceType,
        deviceCode: organizationDevice.deviceCode,
        status: organizationDevice.status,
      })
      .from(organizationDevice)
      .where(and(eq(organizationDevice.id, headerDeviceId), eq(organizationDevice.organizationId, organizationId)))
      .limit(1);

    const hit = rows[0] ?? null;
    if (!hit) return null;

    if (allowedDeviceTypes && !allowedDeviceTypes.includes(hit.deviceType as DeviceType)) {
      return null;
    }

    return hit;
  }

  if (resolvedDeviceCode) {
    const rows = await db
      .select({
        id: organizationDevice.id,
        deviceType: organizationDevice.deviceType,
        deviceCode: organizationDevice.deviceCode,
        status: organizationDevice.status,
      })
      .from(organizationDevice)
      .where(
        and(
          eq(organizationDevice.organizationId, organizationId),
          eq(organizationDevice.deviceCode, resolvedDeviceCode),
        ),
      )
      .limit(1);

    const hit = rows[0] ?? null;
    if (!hit) return null;

    if (allowedDeviceTypes && !allowedDeviceTypes.includes(hit.deviceType as DeviceType)) {
      return null;
    }

    return hit;
  }

  return null;
}

export async function touchOrganizationDevice(deviceId: string, request: Request) {
  const now = new Date();
  const currentIp = getRequestIp(request);
  const lastUserAgent = getRequestUserAgent(request);

  if (!currentIp && !lastUserAgent) {
    await db
      .update(organizationDevice)
      .set({
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(organizationDevice.id, deviceId));
    return;
  }

  const [existing] = await db
    .select({ currentIp: organizationDevice.currentIp })
    .from(organizationDevice)
    .where(eq(organizationDevice.id, deviceId))
    .limit(1);

  await db
    .update(organizationDevice)
    .set({
      currentIp: currentIp ?? existing?.currentIp ?? null,
      lastIp: currentIp && existing?.currentIp && existing.currentIp !== currentIp ? existing.currentIp : existing?.currentIp ?? null,
      lastUserAgent,
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(eq(organizationDevice.id, deviceId));
}

export async function getUserAccessibleDeviceIds(options: {
  organizationId: string;
  userId: string;
  allowedDeviceTypes?: DeviceType[];
}) {
  const { organizationId, userId, allowedDeviceTypes } = options;

  const loginRows = await db
    .select({ id: organizationDevice.id, deviceType: organizationDevice.deviceType })
    .from(organizationDevice)
    .where(
      and(
        eq(organizationDevice.organizationId, organizationId),
        eq(organizationDevice.loginUserId, userId),
        eq(organizationDevice.status, "ACTIVE"),
      ),
    );

  const assignmentRows = await db
    .select({ id: organizationDevice.id, deviceType: organizationDevice.deviceType })
    .from(organizationDeviceAssignment)
    .innerJoin(organizationDevice, eq(organizationDeviceAssignment.deviceId, organizationDevice.id))
    .where(
      and(
        eq(organizationDeviceAssignment.organizationId, organizationId),
        eq(organizationDeviceAssignment.userId, userId),
        eq(organizationDevice.status, "ACTIVE"),
      ),
    );

  const allRows = [...loginRows, ...assignmentRows];
  const filtered = allowedDeviceTypes
    ? allRows.filter((row) => allowedDeviceTypes.includes(row.deviceType as DeviceType))
    : allRows;

  return Array.from(new Set(filtered.map((row) => row.id)));
}

export async function getDeviceCodesByIds(deviceIds: string[]) {
  if (!deviceIds.length) return [];

  const rows = await db
    .select({ id: organizationDevice.id, code: organizationDevice.deviceCode })
    .from(organizationDevice)
    .where(inArray(organizationDevice.id, deviceIds));

  return rows;
}
