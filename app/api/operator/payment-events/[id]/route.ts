import { NextRequest, NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { paymentEvent, paymentEventAccount, paymentEventReceipt } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { broadcast } from "@/lib/sse";
import {
  broadcastPaymentEventToTargets,
  normalizeTargetType,
  sanitizeStringArray,
  validateSelectedAccountIds,
} from "@/lib/payment-events";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

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
  request: NextRequest,
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

  const body = await request.json();
  const {
    status,
    kioskMode,
    title,
    description,
    amount,
    paymentAccountId,
    targetType,
    targetClass,
    targetAccountIds,
    dueDate,
  } = body;

  const normalizedTargetType = targetType !== undefined ? normalizeTargetType(targetType) : undefined;
  const normalizedTargetClass = targetClass !== undefined ? sanitizeStringArray(targetClass) : undefined;
  const normalizedTargetAccountIds =
    targetAccountIds !== undefined ? sanitizeStringArray(targetAccountIds) : undefined;

  // Content edits are not allowed once an event is completed/cancelled
  const isContentEdit =
    title !== undefined ||
    description !== undefined ||
    amount !== undefined ||
    paymentAccountId !== undefined ||
    targetType !== undefined ||
    targetClass !== undefined ||
    targetAccountIds !== undefined ||
    dueDate !== undefined;

  if (isContentEdit && (existing.status === "COMPLETED" || existing.status === "CANCELLED")) {
    return NextResponse.json({ error: "Completed/cancelled events cannot be edited" }, { status: 400 });
  }

  if (amount !== undefined) {
    const normalizedAmount = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }
  }

  if (normalizedTargetType === "CLASS" && (normalizedTargetClass?.length ?? 0) === 0) {
    return NextResponse.json({ error: "Select at least one class for class-targeted events" }, { status: 400 });
  }

  if (normalizedTargetType === "SELECTED") {
    if ((normalizedTargetAccountIds?.length ?? 0) === 0) {
      return NextResponse.json({ error: "Select at least one account" }, { status: 400 });
    }
    const isValid = await validateSelectedAccountIds(
      access.activeOrganizationId!,
      normalizedTargetAccountIds ?? [],
    );
    if (!isValid) {
      return NextResponse.json({ error: "Some selected accounts are invalid or inactive" }, { status: 400 });
    }
  }

  // Validate payment account if provided
  if (paymentAccountId) {
    const [acct] = await db
      .select({ status: paymentEventAccount.status, organizationId: paymentEventAccount.organizationId })
      .from(paymentEventAccount)
      .where(eq(paymentEventAccount.id, paymentAccountId))
      .limit(1);
    if (!acct || acct.organizationId !== access.activeOrganizationId) {
      return NextResponse.json({ error: "Payment account not found" }, { status: 404 });
    }
    if (acct.status !== "APPROVED") {
      return NextResponse.json({ error: "Payment account is not yet approved" }, { status: 400 });
    }
  }

  let parsedDueDate: Date | null | undefined;
  if (dueDate !== undefined) {
    parsedDueDate = dueDate ? new Date(dueDate as string) : null;
    if (parsedDueDate && Number.isNaN(parsedDueDate.getTime())) {
      return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) updates.status = status;
  if (kioskMode !== undefined) updates.kioskMode = kioskMode;
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description ?? null;
  if (amount !== undefined) {
    const normalizedAmount = typeof amount === "number" ? amount : Number(amount);
    updates.amount = normalizedAmount;
  }
  if (paymentAccountId !== undefined) updates.paymentAccountId = paymentAccountId ?? null;
  if (normalizedTargetType !== undefined) updates.targetType = normalizedTargetType;
  if (normalizedTargetClass !== undefined) {
    updates.targetClass = normalizedTargetClass.length > 0 ? JSON.stringify(normalizedTargetClass) : null;
  }
  if (normalizedTargetAccountIds !== undefined) {
    updates.targetAccountIds =
      normalizedTargetAccountIds.length > 0 ? JSON.stringify(normalizedTargetAccountIds) : null;
  }
  if (parsedDueDate !== undefined) updates.dueDate = parsedDueDate;
  if (normalizedTargetType === "KIOSK") updates.kioskMode = true;

  const [updated] = await db
    .update(paymentEvent)
    .set(updates as Partial<typeof paymentEvent.$inferInsert>)
    .where(eq(paymentEvent.id, id))
    .returning();

  // If just activated, notify parents
  if (status === "ACTIVE" && existing.status !== "ACTIVE" && !updated.kioskMode) {
    void broadcastPaymentEventToTargets(access.activeOrganizationId!, updated);
  }

  broadcast("payment-event", { action: "updated", event: updated });

  logAudit({
    organizationId: access.activeOrganizationId,
    userId: access.actorUserId,
    userRole: access.membershipRole ?? "OPERATOR",
    action: AUDIT_ACTIONS.PAYMENT_EVENT_UPDATED,
    details: { eventId: id },
    request,
  });

  return NextResponse.json({ event: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let access;
  try {
    access = await requireAccess({ scope: "organization", allowedOrgRoles: ["OPERATOR"] });
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

  const [hasReceipt] = await db
    .select({ id: paymentEventReceipt.id })
    .from(paymentEventReceipt)
    .where(eq(paymentEventReceipt.eventId, id))
    .limit(1);

  if (hasReceipt) {
    return NextResponse.json(
      { error: "Cannot delete an event that already has payment receipts" },
      { status: 400 },
    );
  }

  await db.delete(paymentEvent).where(eq(paymentEvent.id, id));
  broadcast("payment-event", { action: "deleted", eventId: id });

  logAudit({
    organizationId: access.activeOrganizationId,
    userId: access.actorUserId,
    userRole: access.membershipRole ?? "OPERATOR",
    action: AUDIT_ACTIONS.PAYMENT_EVENT_DELETED,
    details: { eventId: id },
    request,
  });

  return NextResponse.json({ success: true });
}
