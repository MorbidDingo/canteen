import { NextRequest, NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { paymentEvent, paymentEventAccount, paymentEventReceipt, child } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let access;
  try {
    access = await requireAccess({ scope: "organization", allowedOrgRoles: ["OPERATOR", "ADMIN", "MANAGEMENT", "OWNER"] });
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [event] = await db
    .select({
      id: paymentEvent.id,
      title: paymentEvent.title,
      description: paymentEvent.description,
      amount: paymentEvent.amount,
      targetType: paymentEvent.targetType,
      targetClass: paymentEvent.targetClass,
      targetAccountIds: paymentEvent.targetAccountIds,
      dueDate: paymentEvent.dueDate,
      status: paymentEvent.status,
      kioskMode: paymentEvent.kioskMode,
      createdAt: paymentEvent.createdAt,
      updatedAt: paymentEvent.updatedAt,
      paymentAccountId: paymentEvent.paymentAccountId,
      paymentAccountLabel: paymentEventAccount.label,
      paymentAccountMethod: paymentEventAccount.method,
      paymentAccountUpiId: paymentEventAccount.upiId,
      paymentAccountHolderName: paymentEventAccount.accountHolderName,
      paymentAccountNumber: paymentEventAccount.accountNumber,
      paymentAccountIfsc: paymentEventAccount.ifscCode,
      paymentAccountBankName: paymentEventAccount.bankName,
    })
    .from(paymentEvent)
    .leftJoin(paymentEventAccount, eq(paymentEventAccount.id, paymentEvent.paymentAccountId))
    .where(and(eq(paymentEvent.id, id), eq(paymentEvent.organizationId, access.activeOrganizationId!)))
    .limit(1);

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const receipts = await db
    .select()
    .from(paymentEventReceipt)
    .where(eq(paymentEventReceipt.eventId, id))
    .orderBy(desc(paymentEventReceipt.paidAt));

  return NextResponse.json({ event, receipts });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let access;
  try {
    access = await requireAccess({ scope: "organization", allowedOrgRoles: ["OPERATOR", "ADMIN", "MANAGEMENT", "OWNER"] });
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [existing] = await db
    .select({ status: paymentEvent.status, organizationId: paymentEvent.organizationId })
    .from(paymentEvent)
    .where(eq(paymentEvent.id, id))
    .limit(1);

  if (!existing || existing.organizationId !== access.activeOrganizationId) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const body = await req.json();
  const { status, kioskMode } = body;

  const [updated] = await db
    .update(paymentEvent)
    .set({
      ...(status ? { status } : {}),
      ...(kioskMode !== undefined ? { kioskMode } : {}),
      updatedAt: new Date(),
    })
    .where(eq(paymentEvent.id, id))
    .returning();

  // If just activated, notify parents
  if (status === "ACTIVE" && existing.status !== "ACTIVE" && !updated.kioskMode) {
    const allChildren = await db
      .select({ id: child.id })
      .from(child)
      .where(eq(child.organizationId, access.activeOrganizationId!));

    for (const c of allChildren) {
      void notifyParentForChild({
        childId: c.id,
        type: "PAYMENT_EVENT_CREATED",
        title: `Payment Required: ${updated.title}`,
        message: `A payment of ₹${updated.amount.toFixed(2)} is due${updated.dueDate ? ` by ${new Date(updated.dueDate).toLocaleDateString()}` : ""}.`,
        metadata: { eventId: updated.id, amount: updated.amount, dueDate: updated.dueDate },
      });
    }
  }

  broadcast("payment-event", { action: "updated", event: updated });

  return NextResponse.json({ event: updated });
}
