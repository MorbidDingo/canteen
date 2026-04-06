import { NextRequest, NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { paymentEventAccount, user } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

export async function GET() {
  let access;
  try {
    access = await requireAccess({ scope: "organization", allowedOrgRoles: ["OPERATOR", "ADMIN", "MANAGEMENT", "OWNER"] });
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accounts = await db
    .select({
      id: paymentEventAccount.id,
      label: paymentEventAccount.label,
      method: paymentEventAccount.method,
      upiId: paymentEventAccount.upiId,
      accountHolderName: paymentEventAccount.accountHolderName,
      accountNumber: paymentEventAccount.accountNumber,
      ifscCode: paymentEventAccount.ifscCode,
      bankName: paymentEventAccount.bankName,
      status: paymentEventAccount.status,
      rejectionReason: paymentEventAccount.rejectionReason,
      approvedAt: paymentEventAccount.approvedAt,
      createdAt: paymentEventAccount.createdAt,
      createdByOperatorId: paymentEventAccount.createdByOperatorId,
    })
    .from(paymentEventAccount)
    .where(eq(paymentEventAccount.organizationId, access.activeOrganizationId!))
    .orderBy(desc(paymentEventAccount.createdAt));

  return NextResponse.json({ accounts });
}

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({ scope: "organization", allowedOrgRoles: ["OPERATOR"] });
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { label, method, upiId, accountHolderName, accountNumber, ifscCode, bankName } = body;

  if (!label || !method) {
    return NextResponse.json({ error: "label and method are required" }, { status: 400 });
  }
  if (method === "UPI" && !upiId) {
    return NextResponse.json({ error: "upiId is required for UPI method" }, { status: 400 });
  }
  if (method === "BANK_ACCOUNT" && (!accountHolderName || !accountNumber || !ifscCode)) {
    return NextResponse.json({ error: "accountHolderName, accountNumber, and ifscCode are required for BANK_ACCOUNT" }, { status: 400 });
  }

  const [created] = await db
    .insert(paymentEventAccount)
    .values({
      organizationId: access.activeOrganizationId!,
      createdByOperatorId: access.actorUserId,
      label,
      method,
      upiId: method === "UPI" ? upiId : null,
      accountHolderName: method === "BANK_ACCOUNT" ? accountHolderName : null,
      accountNumber: method === "BANK_ACCOUNT" ? accountNumber : null,
      ifscCode: method === "BANK_ACCOUNT" ? ifscCode : null,
      bankName: method === "BANK_ACCOUNT" ? (bankName ?? null) : null,
    })
    .returning();

  logAudit({
    organizationId: access.activeOrganizationId,
    userId: access.actorUserId,
    userRole: access.membershipRole ?? "OPERATOR",
    action: AUDIT_ACTIONS.PAYMENT_ACCOUNT_CREATED,
    details: { accountId: created.id, label: created.label, method: created.method },
    request,
  });

  return NextResponse.json({ account: created }, { status: 201 });
}
