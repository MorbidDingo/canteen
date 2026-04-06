import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { discount, menuItem } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

const updateSchema = z.object({
  active: z.boolean().optional(),
  value: z.number().positive().optional(),
  type: z.enum(["PERCENTAGE", "FLAT"]).optional(),
  reason: z.string().optional(),
  mode: z.enum(["AUTO", "MANUAL"]).optional(),
  endDate: z.string().datetime().nullable().optional(),
});

// PATCH — update a discount
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN"],
    });

    if (access.deviceLoginProfile) {
      return NextResponse.json(
        { error: "Discount controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
        { status: 403 },
      );
    }

    const organizationId = access.activeOrganizationId!;

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(discount)
      .innerJoin(menuItem, eq(discount.menuItemId, menuItem.id))
      .where(and(eq(discount.id, id), eq(menuItem.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Discount not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const data = parsed.data;

    if (data.active !== undefined) updates.active = data.active;
    if (data.value !== undefined) updates.value = data.value;
    if (data.type !== undefined) updates.type = data.type;
    if (data.reason !== undefined) updates.reason = data.reason;
    if (data.mode !== undefined) updates.mode = data.mode;
    if (data.endDate !== undefined) {
      updates.endDate = data.endDate ? new Date(data.endDate) : null;
    }

    const [updated] = await db
      .update(discount)
      .set(updates)
      .where(eq(discount.id, id))
      .returning();

    logAudit({
      organizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole ?? "ADMIN",
      action: AUDIT_ACTIONS.DISCOUNT_UPDATED,
      details: { discountId: id },
      request,
    });

    return NextResponse.json({ discount: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Update discount error:", error);
    return NextResponse.json(
      { error: "Failed to update discount" },
      { status: 500 }
    );
  }
}

// DELETE — remove a discount
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN"],
    });

    if (access.deviceLoginProfile) {
      return NextResponse.json(
        { error: "Discount controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
        { status: 403 },
      );
    }

    const organizationId = access.activeOrganizationId!;

    const [existing] = await db
      .select()
      .from(discount)
      .innerJoin(menuItem, eq(discount.menuItemId, menuItem.id))
      .where(and(eq(discount.id, id), eq(menuItem.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Discount not found" }, { status: 404 });
    }

    await db.delete(discount).where(eq(discount.id, id));

    logAudit({
      organizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole ?? "ADMIN",
      action: AUDIT_ACTIONS.DISCOUNT_DELETED,
      details: { discountId: id },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Delete discount error:", error);
    return NextResponse.json(
      { error: "Failed to delete discount" },
      { status: 500 }
    );
  }
}
