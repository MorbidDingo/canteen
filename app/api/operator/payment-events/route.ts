import { NextRequest, NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { paymentEvent, paymentEventAccount, paymentEventReceipt, child, user } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";

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

  if (!title || !amount || amount <= 0) {
    return NextResponse.json({ error: "title and a positive amount are required" }, { status: 400 });
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

  const [created] = await db
    .insert(paymentEvent)
    .values({
      organizationId: access.activeOrganizationId!,
      createdByOperatorId: access.actorUserId,
      paymentAccountId: paymentAccountId ?? null,
      title,
      description: description ?? null,
      amount,
      targetType: targetType ?? "BOTH",
      targetClass: targetClass ? JSON.stringify(targetClass) : null,
      targetAccountIds: targetAccountIds ? JSON.stringify(targetAccountIds) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      status,
      kioskMode: kioskMode ?? false,
    })
    .returning();

  // If activating and targeting parent/general accounts, send notifications
  if (status === "ACTIVE" && !kioskMode) {
    void broadcastPaymentEvent(created, access.activeOrganizationId!);
  }

  broadcast("payment-event", { action: "created", event: created });

  return NextResponse.json({ event: created }, { status: 201 });
}

async function broadcastPaymentEvent(event: typeof paymentEvent.$inferSelect, orgId: string) {
  try {
    // Find all children in the org whose parents should be notified
    const children = await db
      .select({ id: child.id, name: child.name })
      .from(child)
      .where(and(eq(child.organizationId, orgId)));

    for (const c of children) {
      await notifyParentForChild({
        childId: c.id,
        type: "PAYMENT_EVENT_CREATED",
        title: `Payment Required: ${event.title}`,
        message: `A payment of ₹${event.amount.toFixed(2)} is due${event.dueDate ? ` by ${new Date(event.dueDate).toLocaleDateString()}` : ""}.`,
        metadata: { eventId: event.id, amount: event.amount, dueDate: event.dueDate },
      });
    }
  } catch (err) {
    console.error("[PaymentEvent] Failed to send notifications:", err);
  }
}
