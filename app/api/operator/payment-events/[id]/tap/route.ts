import { NextRequest, NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { paymentEvent, paymentEventReceipt, child, user } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";

// POST /api/operator/payment-events/[id]/tap
// Called when a student taps on the operator device in kiosk mode
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
  if (!event.kioskMode) {
    return NextResponse.json({ error: "Event is not in kiosk mode" }, { status: 400 });
  }

  const body = await req.json();
  const { childId, notes } = body;

  if (!childId) {
    return NextResponse.json({ error: "childId is required" }, { status: 400 });
  }

  // Verify child belongs to this org
  const [childRow] = await db
    .select({ id: child.id, name: child.name })
    .from(child)
    .where(and(eq(child.id, childId), eq(child.organizationId, access.activeOrganizationId!)))
    .limit(1);

  if (!childRow) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  const [receipt] = await db
    .insert(paymentEventReceipt)
    .values({
      eventId: id,
      childId,
      paymentMode: "KIOSK_TAP",
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
