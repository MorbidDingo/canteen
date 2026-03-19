import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { menuItem } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

const updateMenuItemSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  price: z.number().positive().optional(),
  category: z.enum(["SNACKS", "MEALS", "DRINKS", "PACKED_FOOD"]).optional(),
  imageUrl: z.string().optional().or(z.literal("")).optional(),
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
      .where(and(eq(menuItem.id, id), eq(menuItem.organizationId, access.activeOrganizationId!)));

    if (!existing) {
      return NextResponse.json(
        { error: "Menu item not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };

    // Handle empty imageUrl → null
    if (updateData.imageUrl === "") {
      updateData.imageUrl = null;
    }

    // Handle resetUnits flag
    if (parsed.data.resetUnits) {
      updateData.availableUnits = 0;
    }
    delete updateData.resetUnits;

    const [updated] = await db
      .update(menuItem)
      .set(updateData)
      .where(and(eq(menuItem.id, id), eq(menuItem.organizationId, access.activeOrganizationId!)))
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

    const { id } = await params;

    const [existing] = await db
      .select()
      .from(menuItem)
      .where(and(eq(menuItem.id, id), eq(menuItem.organizationId, access.activeOrganizationId!)));

    if (!existing) {
      return NextResponse.json(
        { error: "Menu item not found" },
        { status: 404 }
      );
    }

    await db
      .delete(menuItem)
      .where(and(eq(menuItem.id, id), eq(menuItem.organizationId, access.activeOrganizationId!)));

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
