import { NextRequest, NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { paymentEvent, paymentEventReceipt, child } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let access;
  try {
    access = await requireAccess({ scope: "organization", allowedOrgRoles: ["PARENT", "GENERAL"] });
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get children for this parent
  const children = await db
    .select({ id: child.id })
    .from(child)
    .where(eq(child.parentId, access.actorUserId));

  const childIds = children.map((c) => c.id);

  // Verify event exists and is for this org
  const [event] = await db
    .select({ id: paymentEvent.id, title: paymentEvent.title, amount: paymentEvent.amount, organizationId: paymentEvent.organizationId })
    .from(paymentEvent)
    .where(and(eq(paymentEvent.id, id), eq(paymentEvent.organizationId, access.activeOrganizationId!)))
    .limit(1);

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Get receipts for this parent's children for this event
  const receipts = childIds.length > 0
    ? await db
        .select({
          id: paymentEventReceipt.id,
          eventId: paymentEventReceipt.eventId,
          childId: paymentEventReceipt.childId,
          paymentMode: paymentEventReceipt.paymentMode,
          amount: paymentEventReceipt.amount,
          receiptNumber: paymentEventReceipt.receiptNumber,
          notes: paymentEventReceipt.notes,
          paidAt: paymentEventReceipt.paidAt,
          childName: child.name,
          childGrNumber: child.grNumber,
        })
        .from(paymentEventReceipt)
        .leftJoin(child, eq(child.id, paymentEventReceipt.childId))
        .where(and(
          eq(paymentEventReceipt.eventId, id),
          inArray(paymentEventReceipt.childId, childIds),
        ))
        .orderBy(desc(paymentEventReceipt.paidAt))
    : [];

  return NextResponse.json({ event, receipts });
}
