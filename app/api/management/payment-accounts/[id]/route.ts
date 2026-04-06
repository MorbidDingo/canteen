import { NextRequest, NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { paymentEventAccount } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let access;
  try {
    access = await requireAccess({ scope: "organization", allowedOrgRoles: ["MANAGEMENT", "ADMIN", "OWNER"] });
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { action, rejectionReason } = body; // action: "approve" | "reject"

  if (!action || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }
  if (action === "reject" && !rejectionReason) {
    return NextResponse.json({ error: "rejectionReason is required when rejecting" }, { status: 400 });
  }

  const [existing] = await db
    .select({ organizationId: paymentEventAccount.organizationId })
    .from(paymentEventAccount)
    .where(eq(paymentEventAccount.id, id))
    .limit(1);

  if (!existing || existing.organizationId !== access.activeOrganizationId) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(paymentEventAccount)
    .set(
      action === "approve"
        ? { status: "APPROVED", approvedById: access.actorUserId, approvedAt: new Date(), rejectionReason: null }
        : { status: "REJECTED", rejectionReason, approvedById: null, approvedAt: null },
    )
    .where(eq(paymentEventAccount.id, id))
    .returning();

  logAudit({
    organizationId: access.activeOrganizationId,
    userId: access.actorUserId,
    userRole: access.membershipRole ?? "MANAGEMENT",
    action: AUDIT_ACTIONS.PAYMENT_ACCOUNT_REVIEWED,
    details: { accountId: id, decision: action },
    request,
  });

  return NextResponse.json({ account: updated });
}
