import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canteen, order, organizationDevice } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getUserAccessibleDeviceIds } from "@/lib/device-context";

// GET — list all orders (admin)
export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN", "MANAGEMENT", "OPERATOR"],
    });

    const organizationId = access.activeOrganizationId!;

    let accessibleCanteenIds: string[] | null = null;
    if (access.membershipRole === "ADMIN") {
      const accessibleDeviceIds = await getUserAccessibleDeviceIds({
        organizationId,
        userId: access.actorUserId,
        allowedDeviceTypes: ["KIOSK"],
      });

      if (accessibleDeviceIds.length === 0) {
        return NextResponse.json({ orders: [] });
      }

      const scopedRows = await db
        .select({ canteenId: organizationDevice.canteenId })
        .from(organizationDevice)
        .where(
          and(
            eq(organizationDevice.organizationId, organizationId),
            inArray(organizationDevice.id, accessibleDeviceIds),
          ),
        );

      accessibleCanteenIds = Array.from(
        new Set(
          scopedRows
            .map((row) => row.canteenId)
            .filter((value): value is string => Boolean(value && value.trim())),
        ),
      );

      if (accessibleCanteenIds.length === 0) {
        return NextResponse.json({ orders: [] });
      }
    }

    const permittedCanteenIds = accessibleCanteenIds
      ?? (await db
        .select({ id: canteen.id })
        .from(canteen)
        .where(eq(canteen.organizationId, organizationId))
      ).map((row) => row.id);

    if (permittedCanteenIds.length === 0) {
      return NextResponse.json({ orders: [] });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const canteenId = searchParams.get("canteenId")?.trim() || null;

    if (canteenId && !permittedCanteenIds.includes(canteenId)) {
      return NextResponse.json({ error: "You are not assigned to this canteen" }, { status: 403 });
    }

    const conditions = [];
    if (status) conditions.push(eq(order.status, status as "PLACED" | "PREPARING" | "SERVED" | "CANCELLED"));
    conditions.push(inArray(order.canteenId, permittedCanteenIds));
    if (canteenId) conditions.push(eq(order.canteenId, canteenId));

    const orders = await db.query.order.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(order.createdAt)],
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            phone: true,
            childName: true,
            childGrNumber: true,
          },
        },
        items: {
          with: {
            menuItem: true,
          },
        },
      },
    });

    return NextResponse.json({ orders });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Admin fetch orders error:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
