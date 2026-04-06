import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { canteen, canteenPaymentRouting, settlementAccount, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

const updateRoutingSchema = z
  .object({
    canteenId: z.string().min(1),
    settlementAccountId: z.string().min(1).optional(),
    resetToDefault: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.resetToDefault && !value.settlementAccountId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "settlementAccountId is required unless resetToDefault is true" });
    }
  });

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const organizationId = access.activeOrganizationId!;

    const canteens = await db
      .select({
        id: canteen.id,
        name: canteen.name,
        location: canteen.location,
        status: canteen.status,
      })
      .from(canteen)
      .where(eq(canteen.organizationId, organizationId))
      .orderBy(desc(canteen.createdAt));

    const routingRows = await db
      .select({
        canteenId: canteenPaymentRouting.canteenId,
        settlementAccountId: canteenPaymentRouting.settlementAccountId,
        overriddenByUserId: canteenPaymentRouting.overriddenByUserId,
        overriddenAt: canteenPaymentRouting.overriddenAt,
        accountLabel: settlementAccount.label,
        accountStatus: settlementAccount.status,
        accountOwnerId: settlementAccount.userId,
        ownerName: user.name,
      })
      .from(canteenPaymentRouting)
      .innerJoin(settlementAccount, eq(canteenPaymentRouting.settlementAccountId, settlementAccount.id))
      .innerJoin(user, eq(settlementAccount.userId, user.id))
      .where(eq(settlementAccount.organizationId, organizationId));

    const routingByCanteen = new Map(routingRows.map((row) => [row.canteenId, row] as const));

    return NextResponse.json({
      canteens: canteens.map((entry) => ({
        ...entry,
        routing: routingByCanteen.get(entry.id) || null,
      })),
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Management canteen routing list error:", error);
    return NextResponse.json({ error: "Failed to fetch canteen routing" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const parsed = updateRoutingSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
    }

    const { canteenId, settlementAccountId, resetToDefault } = parsed.data;
    const organizationId = access.activeOrganizationId!;

    const [targetCanteen] = await db
      .select({ id: canteen.id })
      .from(canteen)
      .where(and(eq(canteen.id, canteenId), eq(canteen.organizationId, organizationId)))
      .limit(1);

    if (!targetCanteen) {
      return NextResponse.json({ error: "Canteen not found" }, { status: 404 });
    }

    if (resetToDefault) {
      await db.delete(canteenPaymentRouting).where(eq(canteenPaymentRouting.canteenId, canteenId));
      return NextResponse.json({ success: true, resetToDefault: true });
    }

    const [targetAccount] = await db
      .select({
        id: settlementAccount.id,
        status: settlementAccount.status,
      })
      .from(settlementAccount)
      .where(
        and(
          eq(settlementAccount.id, settlementAccountId!),
          eq(settlementAccount.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!targetAccount) {
      return NextResponse.json({ error: "Settlement account not found" }, { status: 404 });
    }

    if (targetAccount.status !== "ACTIVE") {
      return NextResponse.json({ error: "Only ACTIVE settlement accounts can be assigned" }, { status: 409 });
    }

    const [existingRouting] = await db
      .select({ id: canteenPaymentRouting.id })
      .from(canteenPaymentRouting)
      .where(eq(canteenPaymentRouting.canteenId, canteenId))
      .limit(1);

    if (existingRouting) {
      await db
        .update(canteenPaymentRouting)
        .set({
          settlementAccountId: settlementAccountId!,
          overriddenByUserId: access.actorUserId,
          overriddenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(canteenPaymentRouting.id, existingRouting.id));
    } else {
      await db.insert(canteenPaymentRouting).values({
        canteenId,
        settlementAccountId: settlementAccountId!,
        overriddenByUserId: access.actorUserId,
        overriddenAt: new Date(),
      });
    }

    logAudit({
      organizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole ?? "MANAGEMENT",
      action: AUDIT_ACTIONS.CANTEEN_ROUTING_UPDATED,
      details: { canteenId, settlementAccountId },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Management canteen routing update error:", error);
    return NextResponse.json({ error: "Failed to update canteen routing" }, { status: 500 });
  }
}
