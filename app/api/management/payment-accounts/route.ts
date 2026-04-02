import { NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { paymentEventAccount, user } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  let access;
  try {
    access = await requireAccess({ scope: "organization", allowedOrgRoles: ["MANAGEMENT", "ADMIN", "OWNER"] });
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
      operatorId: paymentEventAccount.createdByOperatorId,
      operatorName: user.name,
      operatorEmail: user.email,
    })
    .from(paymentEventAccount)
    .leftJoin(user, eq(user.id, paymentEventAccount.createdByOperatorId))
    .where(eq(paymentEventAccount.organizationId, access.activeOrganizationId!))
    .orderBy(desc(paymentEventAccount.createdAt));

  return NextResponse.json({ accounts });
}
