import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import crypto from "crypto";
import { db } from "@/lib/db";
import {
  account,
  organizationDevice,
  organizationDeviceAssignment,
  organizationMembership,
  user,
} from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

type DeviceType = "GATE" | "KIOSK" | "LIBRARY";

type DeviceRole = "OWNER" | "ADMIN" | "MANAGEMENT" | "OPERATOR" | "LIB_OPERATOR" | "ATTENDANCE";

const ASSIGNABLE_ROLES: DeviceRole[] = [
  "OPERATOR",
  "LIB_OPERATOR",
  "ATTENDANCE",
];

function roleForDeviceType(deviceType: DeviceType): "OPERATOR" | "LIB_OPERATOR" | "ATTENDANCE" {
  if (deviceType === "LIBRARY") return "LIB_OPERATOR";
  if (deviceType === "GATE") return "ATTENDANCE";
  return "OPERATOR";
}

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const organizationId = access.activeOrganizationId!;

    const devices = await db
      .select({
        id: organizationDevice.id,
        deviceType: organizationDevice.deviceType,
        deviceName: organizationDevice.deviceName,
        deviceCode: organizationDevice.deviceCode,
        status: organizationDevice.status,
        loginUserId: organizationDevice.loginUserId,
        currentIp: organizationDevice.currentIp,
        lastIp: organizationDevice.lastIp,
        lastSeenAt: organizationDevice.lastSeenAt,
        createdAt: organizationDevice.createdAt,
      })
      .from(organizationDevice)
      .where(eq(organizationDevice.organizationId, organizationId));

    const loginUserIds = Array.from(new Set(devices.map((device) => device.loginUserId).filter(Boolean))) as string[];

    const loginUsers = loginUserIds.length
      ? await db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: organizationMembership.role,
          })
          .from(user)
          .innerJoin(
            organizationMembership,
            and(
              eq(organizationMembership.userId, user.id),
              eq(organizationMembership.organizationId, organizationId),
              eq(organizationMembership.status, "ACTIVE"),
            ),
          )
          .where(inArray(user.id, loginUserIds))
      : [];

    const loginUserMap = new Map(loginUsers.map((row) => [row.id, row]));

    const assignmentRows = await db
      .select({
        deviceId: organizationDeviceAssignment.deviceId,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        role: organizationMembership.role,
      })
      .from(organizationDeviceAssignment)
      .innerJoin(user, eq(organizationDeviceAssignment.userId, user.id))
      .innerJoin(
        organizationMembership,
        and(
          eq(organizationMembership.userId, user.id),
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.status, "ACTIVE"),
        ),
      )
      .where(eq(organizationDeviceAssignment.organizationId, organizationId));

    const assignmentsByDevice = new Map<string, Array<{
      userId: string;
      userName: string;
      userEmail: string;
      role: string;
    }>>();

    for (const row of assignmentRows) {
      const existing = assignmentsByDevice.get(row.deviceId) ?? [];
      existing.push({
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        role: row.role,
      });
      assignmentsByDevice.set(row.deviceId, existing);
    }

    const staffUsers = await db
      .select({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        role: organizationMembership.role,
      })
      .from(organizationMembership)
      .innerJoin(user, eq(organizationMembership.userId, user.id))
      .where(
        and(
          eq(organizationMembership.organizationId, organizationId),
          eq(organizationMembership.status, "ACTIVE"),
          inArray(organizationMembership.role, ASSIGNABLE_ROLES),
        ),
      );

    return NextResponse.json({
      devices: devices.map((device) => ({
        ...device,
        requiredRole: roleForDeviceType(device.deviceType as DeviceType),
        loginUser: device.loginUserId ? loginUserMap.get(device.loginUserId) ?? null : null,
        assignments: assignmentsByDevice.get(device.id) ?? [],
      })),
      staffUsers,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Device accounts list error:", error);
    return NextResponse.json({ error: "Failed to fetch device accounts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const organizationId = access.activeOrganizationId!;

    const body = (await request.json().catch(() => ({}))) as {
      deviceType?: DeviceType;
      deviceName?: string;
      deviceCode?: string;
      accountName?: string;
      accountEmail?: string;
      accountPassword?: string;
    };

    const deviceType = body.deviceType;
    const deviceName = body.deviceName?.trim();
    const deviceCode = body.deviceCode?.trim().toUpperCase();
    const accountName = body.accountName?.trim();
    const accountEmail = body.accountEmail?.trim().toLowerCase();
    const accountPassword = body.accountPassword?.trim();

    if (!deviceType || !["GATE", "KIOSK", "LIBRARY"].includes(deviceType)) {
      return NextResponse.json({ error: "Invalid device type" }, { status: 400 });
    }

    if (!deviceName || !deviceCode || !accountName || !accountEmail || !accountPassword) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    if (accountPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const [existingDevice] = await db
      .select({ id: organizationDevice.id })
      .from(organizationDevice)
      .where(
        and(
          eq(organizationDevice.organizationId, organizationId),
          eq(organizationDevice.deviceType, deviceType),
          eq(organizationDevice.deviceCode, deviceCode),
        ),
      )
      .limit(1);

    if (existingDevice) {
      return NextResponse.json({ error: "Device code already exists in this organization" }, { status: 409 });
    }

    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, accountEmail))
      .limit(1);

    if (existingUser) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const { hashPassword } = await import("better-auth/crypto");
    const userId = crypto.randomUUID();
    const now = new Date();
    const hashedPassword = await hashPassword(accountPassword);
    const authTokenHash = crypto
      .createHash("sha256")
      .update(`${deviceType}:${deviceCode}:${userId}:${Date.now()}`)
      .digest("hex");
    const currentIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || null;
    const lastUserAgent = request.headers.get("user-agent")?.trim() || null;

    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name: accountName,
        email: accountEmail,
        emailVerified: false,
        role: "DEVICE",
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(account).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(organizationMembership).values({
        id: crypto.randomUUID(),
        organizationId,
        userId,
        role: "DEVICE",
        status: "ACTIVE",
        invitedByUserId: access.actorUserId,
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(organizationDevice).values({
        id: crypto.randomUUID(),
        organizationId,
        deviceType,
        deviceName,
        deviceCode,
        authTokenHash,
        currentIp,
        lastUserAgent,
        loginUserId: userId,
        createdByUserId: access.actorUserId,
        status: "ACTIVE",
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    return NextResponse.json({
      success: true,
      login: {
        email: accountEmail,
        password: accountPassword,
      },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Device account create error:", error);
    return NextResponse.json({ error: "Failed to create device account" }, { status: 500 });
  }
}
