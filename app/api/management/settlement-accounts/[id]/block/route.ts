import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { settlementAccount } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

const blockSchema = z.object({
  reason: z.string().min(3).max(500),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const { id } = await params;
    const parsed = blockSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });
    }

    const [target] = await db
      .select({ id: settlementAccount.id })
      .from(settlementAccount)
      .where(
        and(
          eq(settlementAccount.id, id),
          eq(settlementAccount.organizationId, access.activeOrganizationId!),
        ),
      )
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "Settlement account not found" }, { status: 404 });
    }

    await db
      .update(settlementAccount)
      .set({
        status: "BLOCKED",
        blockedByUserId: access.actorUserId,
        blockedAt: new Date(),
        blockReason: parsed.data.reason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(settlementAccount.id, id));

    logAudit({
      organizationId: access.activeOrganizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole ?? "MANAGEMENT",
      action: AUDIT_ACTIONS.SETTLEMENT_ACCOUNT_BLOCKED,
      details: { accountId: id, reason: parsed.data.reason },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Block settlement account error:", error);
    return NextResponse.json({ error: "Failed to block settlement account" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const { id } = await params;

    const [target] = await db
      .select({ id: settlementAccount.id })
      .from(settlementAccount)
      .where(
        and(
          eq(settlementAccount.id, id),
          eq(settlementAccount.organizationId, access.activeOrganizationId!),
        ),
      )
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "Settlement account not found" }, { status: 404 });
    }

    await db
      .update(settlementAccount)
      .set({
        status: "ACTIVE",
        blockedByUserId: null,
        blockedAt: null,
        blockReason: null,
        updatedAt: new Date(),
      })
      .where(eq(settlementAccount.id, id));

    logAudit({
      organizationId: access.activeOrganizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole ?? "MANAGEMENT",
      action: AUDIT_ACTIONS.SETTLEMENT_ACCOUNT_UNBLOCKED,
      details: { accountId: id },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Unblock settlement account error:", error);
    return NextResponse.json({ error: "Failed to unblock settlement account" }, { status: 500 });
  }
}
