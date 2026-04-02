import { NextRequest, NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { paymentEvent, paymentEventAccount, paymentEventReceipt } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { broadcast } from "@/lib/sse";
import {
  broadcastPaymentEventToTargets,
  normalizeTargetType,
  sanitizeStringArray,
  validateSelectedAccountIds,
} from "@/lib/payment-events";

export async function GET() {
  let access;
  try {
    access = await requireAccess({ scope: "organization", allowedOrgRoles: ["OPERATOR", "ADMIN", "MANAGEMENT", "OWNER"] });
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const events = await db
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
      paymentAccountStatus: paymentEventAccount.status,
    })
    .from(paymentEvent)
    .leftJoin(paymentEventAccount, eq(paymentEventAccount.id, paymentEvent.paymentAccountId))
    .where(eq(paymentEvent.organizationId, access.activeOrganizationId!))
    .orderBy(desc(paymentEvent.createdAt));

  // Attach receipt counts
  const eventIds = events.map((e) => e.id);
  const receipts = eventIds.length > 0
    ? await db
        .select({ eventId: paymentEventReceipt.eventId })
        .from(paymentEventReceipt)
        .where(inArray(paymentEventReceipt.eventId, eventIds))
    : [];

  const receiptCountByEvent = receipts.reduce<Record<string, number>>((acc, r) => {
    acc[r.eventId] = (acc[r.eventId] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    events: events.map((e) => ({
      ...e,
      receiptCount: receiptCountByEvent[e.id] ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  let access;
  try {
    access = await requireAccess({ scope: "organization", allowedOrgRoles: ["OPERATOR"] });
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    title, description, amount, paymentAccountId,
    targetType, targetClass, targetAccountIds,
    dueDate, kioskMode, activate,
  } = body;

  const normalizedAmount = typeof amount === "number" ? amount : Number(amount);
  if (!title || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return NextResponse.json({ error: "title and a positive amount are required" }, { status: 400 });
  }

  const normalizedTargetType = normalizeTargetType(targetType);
  const normalizedTargetClass = sanitizeStringArray(targetClass);
  const normalizedTargetAccountIds = sanitizeStringArray(targetAccountIds);

  if (normalizedTargetType === "CLASS" && normalizedTargetClass.length === 0) {
    return NextResponse.json({ error: "Select at least one class for class-targeted events" }, { status: 400 });
  }

  if (normalizedTargetType === "SELECTED") {
    if (normalizedTargetAccountIds.length === 0) {
      return NextResponse.json({ error: "Select at least one account" }, { status: 400 });
    }
    const isValid = await validateSelectedAccountIds(access.activeOrganizationId!, normalizedTargetAccountIds);
    if (!isValid) {
      return NextResponse.json({ error: "Some selected accounts are invalid or inactive" }, { status: 400 });
    }
  }

  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  if (dueDate && parsedDueDate && Number.isNaN(parsedDueDate.getTime())) {
    return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
  }

  // Validate payment account belongs to org and is approved (unless kiosk-only)
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
      return NextResponse.json({ error: "Payment account is not yet approved by management" }, { status: 400 });
    }
  }

  const status = activate ? "ACTIVE" : "DRAFT";
  const isKioskMode = normalizedTargetType === "KIOSK" ? true : Boolean(kioskMode);

  const [created] = await db
    .insert(paymentEvent)
    .values({
      organizationId: access.activeOrganizationId!,
      createdByOperatorId: access.actorUserId,
      paymentAccountId: paymentAccountId ?? null,
      title,
      description: description ?? null,
      amount: normalizedAmount,
      targetType: normalizedTargetType,
      targetClass: normalizedTargetClass.length > 0 ? JSON.stringify(normalizedTargetClass) : null,
      targetAccountIds: normalizedTargetAccountIds.length > 0 ? JSON.stringify(normalizedTargetAccountIds) : null,
      dueDate: parsedDueDate,
      status,
      kioskMode: isKioskMode,
    })
    .returning();

  // If activating and targeting parent/general accounts, send notifications
  if (status === "ACTIVE" && !isKioskMode) {
    void broadcastPaymentEventToTargets(access.activeOrganizationId!, created);
  }

  broadcast("payment-event", { action: "created", event: created });

  return NextResponse.json({ event: created }, { status: 201 });
}
