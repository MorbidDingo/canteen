import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { canteen, organizationDevice } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getUserAccessibleDeviceIds } from "@/lib/device-context";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

// GET — list canteens for active org
export async function GET() {
  try {
    const access = await requireAccess({ scope: "organization" });
    const organizationId = access.activeOrganizationId!;

    if (access.membershipRole === "ADMIN") {
      const accessibleDeviceIds = await getUserAccessibleDeviceIds({
        organizationId,
        userId: access.actorUserId,
        allowedDeviceTypes: ["KIOSK"],
      });

      if (accessibleDeviceIds.length === 0) {
        return NextResponse.json({ canteens: [] });
      }

      const rows = await db
        .select({
          id: canteen.id,
          organizationId: canteen.organizationId,
          name: canteen.name,
          description: canteen.description,
          location: canteen.location,
          status: canteen.status,
          createdAt: canteen.createdAt,
          updatedAt: canteen.updatedAt,
        })
        .from(organizationDevice)
        .innerJoin(canteen, eq(organizationDevice.canteenId, canteen.id))
        .where(
          and(
            eq(organizationDevice.organizationId, organizationId),
            inArray(organizationDevice.id, accessibleDeviceIds),
          ),
        );

      const canteens = Array.from(new Map(rows.map((row) => [row.id, row])).values());
      return NextResponse.json({ canteens });
    }

    const canteens = await db
      .select()
      .from(canteen)
      .where(eq(canteen.organizationId, organizationId));

    return NextResponse.json({ canteens });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch canteens" }, { status: 500 });
  }
}

// POST — create canteen (admin/owner/management only)
export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN", "MANAGEMENT", "OWNER"],
    });

    const body = await request.json();
    const data = createSchema.parse(body);

    const [created] = await db
      .insert(canteen)
      .values({
        organizationId: access.activeOrganizationId!,
        name: data.name,
        description: data.description ?? null,
        location: data.location ?? null,
      })
      .returning();

    return NextResponse.json({ canteen: created }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create canteen" }, { status: 500 });
  }
}

// PUT — update canteen
export async function PUT(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN", "MANAGEMENT", "OWNER"],
    });

    const body = await request.json();
    const data = updateSchema.parse(body);

    if (access.membershipRole === "ADMIN") {
      const accessibleDeviceIds = await getUserAccessibleDeviceIds({
        organizationId: access.activeOrganizationId!,
        userId: access.actorUserId,
        allowedDeviceTypes: ["KIOSK"],
      });

      if (accessibleDeviceIds.length === 0) {
        return NextResponse.json({ error: "No assigned canteens found" }, { status: 403 });
      }

      const allowedRows = await db
        .select({ canteenId: organizationDevice.canteenId })
        .from(organizationDevice)
        .where(
          and(
            eq(organizationDevice.organizationId, access.activeOrganizationId!),
            inArray(organizationDevice.id, accessibleDeviceIds),
          ),
        );

      const allowedCanteenIds = new Set(
        allowedRows
          .map((row) => row.canteenId)
          .filter((id): id is string => Boolean(id)),
      );

      if (!allowedCanteenIds.has(data.id)) {
        return NextResponse.json(
          { error: "You can only update canteens assigned to your devices" },
          { status: 403 },
        );
      }
    }

    const [updated] = await db
      .update(canteen)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.status !== undefined && { status: data.status }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(canteen.id, data.id),
          eq(canteen.organizationId, access.activeOrganizationId!),
        ),
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Canteen not found" }, { status: 404 });
    }

    return NextResponse.json({ canteen: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update canteen" }, { status: 500 });
  }
}
