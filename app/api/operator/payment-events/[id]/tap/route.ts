import { NextRequest, NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { paymentEvent, paymentEventReceipt, child } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";
import { parseJsonStringArray } from "@/lib/payment-events";

// POST /api/operator/payment-events/[id]/tap
// Called when a student's payment is recorded (kiosk tap or cash)
export async function POST(
  req: NextRequest,
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

  const [event] = await db
    .select()
    .from(paymentEvent)
    .where(and(eq(paymentEvent.id, id), eq(paymentEvent.organizationId, access.activeOrganizationId!)))
    .limit(1);

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.status !== "ACTIVE") {
    return NextResponse.json({ error: "Event is not active" }, { status: 400 });
  }

  const body = await req.json();
  const { childId, notes, paymentMode: rawMode } = body;
  const paymentMode: "KIOSK_TAP" | "CASH" =
    rawMode === "CASH" ? "CASH" : "KIOSK_TAP";

  // Kiosk tap requires the event to have kioskMode enabled
  if (paymentMode === "KIOSK_TAP" && !event.kioskMode) {
    return NextResponse.json({ error: "Event is not in kiosk mode" }, { status: 400 });
  }

  if (!childId) {
    return NextResponse.json({ error: "childId is required" }, { status: 400 });
  }

  // Verify child belongs to this org
  const [childRow] = await db
    .select({ id: child.id, name: child.name, className: child.className, parentId: child.parentId })
    .from(child)
    .where(and(eq(child.id, childId), eq(child.organizationId, access.activeOrganizationId!)))
    .limit(1);

  if (!childRow) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  // Enforce targeting rules for collection
  if (event.targetType === "CLASS") {
    const targetClasses = parseJsonStringArray(event.targetClass).map((c) => c.toLowerCase());
    const isAllowedClass = Boolean(
      childRow.className && targetClasses.includes(childRow.className.toLowerCase()),
    );
    if (!isAllowedClass) {
      return NextResponse.json(
        { error: "This child is not part of the class filter for this event" },
        { status: 400 },
      );
    }
  }

  if (event.targetType === "SELECTED") {
    const selectedAccountIds = new Set(parseJsonStringArray(event.targetAccountIds));
    if (!selectedAccountIds.has(childRow.parentId)) {
      return NextResponse.json(
        { error: "This child's account is not selected for this event" },
        { status: 400 },
      );
    }
  }

  if (event.targetType === "ALL_GENERAL") {
    return NextResponse.json(
      { error: "This event targets general accounts and cannot be collected per child" },
      { status: 400 },
    );
  }

  // Duplicate check – only one receipt per child per event
  const [existing] = await db
    .select({ id: paymentEventReceipt.id })
    .from(paymentEventReceipt)
    .where(and(eq(paymentEventReceipt.eventId, id), eq(paymentEventReceipt.childId, childId)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "Payment already recorded for this student" }, { status: 409 });
  }

  const [receipt] = await db
    .insert(paymentEventReceipt)
    .values({
      eventId: id,
      childId,
      paymentMode,
      amount: event.amount,
      receiptNumber: `RCP-${Date.now()}`,
      notes: notes ?? null,
    })
    .returning();

  // Notify parent
  void notifyParentForChild({
    childId,
    type: "PAYMENT_COMPLETED",
    title: `Payment Received: ${event.title}`,
    message: `₹${event.amount.toFixed(2)} collected for ${event.title}. Receipt: ${receipt.receiptNumber}`,
    metadata: { eventId: id, receiptId: receipt.id, amount: event.amount, receiptNumber: receipt.receiptNumber },
  });

  broadcast("payment-event", { action: "tap", eventId: id, receipt });

  return NextResponse.json({ receipt }, { status: 201 });
}
