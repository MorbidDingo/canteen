import { NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { paymentEvent, paymentEventAccount, paymentEventReceipt, user } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";

export async function GET() {
  let access;
  try {
    access = await requireAccess({ scope: "organization", allowedOrgRoles: ["MANAGEMENT", "ADMIN", "OWNER"] });
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
      dueDate: paymentEvent.dueDate,
      status: paymentEvent.status,
      kioskMode: paymentEvent.kioskMode,
      createdAt: paymentEvent.createdAt,
      paymentAccountLabel: paymentEventAccount.label,
      paymentAccountMethod: paymentEventAccount.method,
      operatorName: user.name,
      operatorEmail: user.email,
    })
    .from(paymentEvent)
    .leftJoin(paymentEventAccount, eq(paymentEventAccount.id, paymentEvent.paymentAccountId))
    .leftJoin(user, eq(user.id, paymentEvent.createdByOperatorId))
    .where(eq(paymentEvent.organizationId, access.activeOrganizationId!))
    .orderBy(desc(paymentEvent.createdAt));

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
