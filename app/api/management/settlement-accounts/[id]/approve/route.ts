import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settlementAccount } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

/**
 * POST /api/management/settlement-accounts/[id]/approve
 *
 * Management approves a PENDING_VERIFICATION settlement account,
 * making it ACTIVE so it can receive settlements.
 */
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
    const organizationId = access.activeOrganizationId!;

    const [existing] = await db
      .select({
        id: settlementAccount.id,
        status: settlementAccount.status,
        accountType: settlementAccount.accountType,
      })
      .from(settlementAccount)
      .where(
        and(
          eq(settlementAccount.id, id),
          eq(settlementAccount.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Settlement account not found" }, { status: 404 });
    }

    if (existing.status !== "PENDING_VERIFICATION") {
      return NextResponse.json(
        { error: `Cannot approve account with status ${existing.status}` },
        { status: 400 },
      );
    }

    await db
      .update(settlementAccount)
      .set({
        status: "ACTIVE",
        updatedAt: new Date(),
      })
      .where(eq(settlementAccount.id, id));

    logAudit({
      organizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole ?? "MANAGEMENT",
      action: AUDIT_ACTIONS.SETTLEMENT_ACCOUNT_APPROVED,
      details: { accountId: id },
      request,
    });

    return NextResponse.json({ success: true, status: "ACTIVE" });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Management settlement account approve error:", error);
    return NextResponse.json({ error: "Failed to approve settlement account" }, { status: 500 });
  }
}
