import { NextRequest, NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { paymentEvent, paymentEventReceipt, child } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// GET /api/operator/payment-events/[id]/report
// Returns a CSV report of all receipts for this event
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
      amount: paymentEvent.amount,
      targetType: paymentEvent.targetType,
      dueDate: paymentEvent.dueDate,
      status: paymentEvent.status,
      createdAt: paymentEvent.createdAt,
      organizationId: paymentEvent.organizationId,
    })
    .from(paymentEvent)
    .where(and(eq(paymentEvent.id, id), eq(paymentEvent.organizationId, access.activeOrganizationId!)))
    .limit(1);

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const receipts = await db
    .select({
      receiptNumber: paymentEventReceipt.receiptNumber,
      amount: paymentEventReceipt.amount,
      paymentMode: paymentEventReceipt.paymentMode,
      notes: paymentEventReceipt.notes,
      paidAt: paymentEventReceipt.paidAt,
      childId: paymentEventReceipt.childId,
      paidByUserId: paymentEventReceipt.paidByUserId,
      childName: child.name,
      childGr: child.grNumber,
      childClass: child.className,
      childSection: child.section,
    })
    .from(paymentEventReceipt)
    .leftJoin(child, eq(child.id, paymentEventReceipt.childId))
    .where(eq(paymentEventReceipt.eventId, id))
    .orderBy(paymentEventReceipt.paidAt);

  // Build CSV
  const csvHeader = [
    "Receipt No",
    "Student Name",
    "GR Number",
    "Class",
    "Section",
    "Amount (₹)",
    "Payment Mode",
    "Paid At",
    "Notes",
  ].join(",");

  const csvRows = receipts.map((r) => {
    function esc(v: string | null | undefined): string {
      if (!v) return "";
      return `"${v.replace(/"/g, '""')}"`;
    }
    return [
      esc(r.receiptNumber),
      esc(r.childName),
      esc(r.childGr),
      esc(r.childClass),
      esc(r.childSection),
      r.amount.toFixed(2),
      r.paymentMode,
      r.paidAt ? new Date(r.paidAt).toISOString() : "",
      esc(r.notes),
    ].join(",");
  });

  const totalCollected = receipts.reduce((sum, r) => sum + r.amount, 0);
  const csvSummary = [
    "",
    `"Event:","${event.title.replace(/"/g, '""')}"`,
    `"Status:","${event.status}"`,
    `"Total Collected:","₹${totalCollected.toFixed(2)}"`,
    `"Total Receipts:","${receipts.length}"`,
    `"Generated At:","${new Date().toISOString()}"`,
  ].join("\n");

  const csv = [csvHeader, ...csvRows, csvSummary].join("\n");

  const filename = `payment-event-${event.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${id.slice(0, 6)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
