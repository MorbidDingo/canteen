import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { canteen, menuItem, organizationDevice } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { getUserAccessibleDeviceIds } from "@/lib/device-context";

async function getAdminAccessibleCanteenIds(organizationId: string, userId: string) {
  const accessibleDeviceIds = await getUserAccessibleDeviceIds({
    organizationId,
    userId,
    allowedDeviceTypes: ["KIOSK"],
  });

  if (accessibleDeviceIds.length === 0) {
    return [] as string[];
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

  return Array.from(
    new Set(
      scopedRows
        .map((row) => row.canteenId)
        .filter((value): value is string => Boolean(value && value.trim())),
    ),
  );
}

const updateMenuItemSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  price: z.number().positive().optional(),
  category: z.enum(["SNACKS", "MEALS", "DRINKS", "PACKED_FOOD"]).optional(),
  canteenId: z.string().min(1).nullable().optional(),
  imageUrl: z.string().optional().or(z.literal("")).optional(),
  videoUrl: z.string().optional().or(z.literal("")).optional(),
  additionalImages: z.string().optional().or(z.literal("")).optional(),
  available: z.boolean().optional(),
  availableUnits: z.number().int().min(0).nullable().optional(),
  resetUnits: z.boolean().optional(),
  subscribable: z.boolean().optional(),
});

// PATCH — update a menu item
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN", "MANAGEMENT", "OPERATOR"],
    });
    const organizationId = access.activeOrganizationId!;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateMenuItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check if item exists
    const [existing] = await db
      .select()
      .from(menuItem)
      .where(and(eq(menuItem.id, id), eq(menuItem.organizationId, organizationId)));

    if (!existing) {
      return NextResponse.json(
        { error: "Menu item not found" },
        { status: 404 }
      );
    }

    if (access.membershipRole === "ADMIN") {
      const accessibleCanteenIds = await getAdminAccessibleCanteenIds(organizationId, access.actorUserId);
      if (!existing.canteenId || !accessibleCanteenIds.includes(existing.canteenId)) {
        return NextResponse.json({ error: "You are not assigned to this canteen" }, { status: 403 });
      }
      if (parsed.data.canteenId && !accessibleCanteenIds.includes(parsed.data.canteenId)) {
        return NextResponse.json({ error: "You are not assigned to this canteen" }, { status: 403 });
      }
    }

    if (parsed.data.canteenId) {
      const [canteenRow] = await db
        .select({ id: canteen.id })
        .from(canteen)
        .where(
          and(
            eq(canteen.id, parsed.data.canteenId),
            eq(canteen.organizationId, organizationId),
          ),
        )
        .limit(1);

      if (!canteenRow) {
        return NextResponse.json({ error: "Invalid canteen selected" }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };

    // Handle empty imageUrl → null
    if (updateData.imageUrl === "") {
      updateData.imageUrl = null;
    }
    // Handle empty videoUrl → null
    if (updateData.videoUrl === "") {
      updateData.videoUrl = null;
    }
    // Handle empty additionalImages → null
    if (updateData.additionalImages === "") {
      updateData.additionalImages = null;
    }

    // Handle resetUnits flag
    if (parsed.data.resetUnits) {
      updateData.availableUnits = 0;
    }
    delete updateData.resetUnits;

    const [updated] = await db
      .update(menuItem)
      .set(updateData)
      .where(and(eq(menuItem.id, id), eq(menuItem.organizationId, organizationId)))
      .returning();

    if (access.session?.user) {
      const action = parsed.data.resetUnits ? AUDIT_ACTIONS.UNITS_RESET
        : parsed.data.availableUnits !== undefined ? AUDIT_ACTIONS.UNITS_UPDATED
        : AUDIT_ACTIONS.MENU_ITEM_UPDATED;
      logAudit({
        userId: access.session.user.id,
        userRole: access.membershipRole || access.session.user.role,
        action,
        details: {
          organizationId: access.activeOrganizationId,
          menuItemId: id,
          name: existing.name,
          changes: parsed.data,
        },
        request,
      });
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Update menu item error:", error);
    return NextResponse.json(
      { error: "Failed to update menu item" },
      { status: 500 }
    );
  }
}

// DELETE — remove a menu item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN", "MANAGEMENT", "OPERATOR"],
    });
    const organizationId = access.activeOrganizationId!;

    const { id } = await params;

    const [existing] = await db
      .select()
      .from(menuItem)
      .where(and(eq(menuItem.id, id), eq(menuItem.organizationId, organizationId)));

    if (!existing) {
      return NextResponse.json(
        { error: "Menu item not found" },
        { status: 404 }
      );
    }

    if (access.membershipRole === "ADMIN") {
      const accessibleCanteenIds = await getAdminAccessibleCanteenIds(organizationId, access.actorUserId);
      if (!existing.canteenId || !accessibleCanteenIds.includes(existing.canteenId)) {
        return NextResponse.json({ error: "You are not assigned to this canteen" }, { status: 403 });
      }
    }

    await db
      .delete(menuItem)
      .where(and(eq(menuItem.id, id), eq(menuItem.organizationId, organizationId)));

    if (access.session?.user) {
      logAudit({
        userId: access.session.user.id,
        userRole: access.membershipRole || access.session.user.role,
        action: AUDIT_ACTIONS.MENU_ITEM_DELETED,
        details: { organizationId: access.activeOrganizationId, menuItemId: id, name: existing.name },
        request,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Delete menu item error:", error);
    return NextResponse.json(
      { error: "Failed to delete menu item" },
      { status: 500 }
    );
  }
}
