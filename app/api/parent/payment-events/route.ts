import { NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { paymentEvent, paymentEventAccount, paymentEventReceipt, child } from "@/lib/db/schema";
import { desc, eq, inArray, or } from "drizzle-orm";

export async function GET() {
  let access;
  try {
    access = await requireAccess({ scope: "organization", allowedOrgRoles: ["PARENT", "GENERAL"] });
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find children belonging to this parent
  const children = await db
    .select({ id: child.id, name: child.name, grNumber: child.grNumber, class: child.className })
    .from(child)
    .where(eq(child.parentId, access.actorUserId));

  // Get active payment events for this organization
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
    .where(eq(paymentEvent.organizationId, access.activeOrganizationId!))
    .orderBy(desc(paymentEvent.createdAt));

  // Get receipts for this parent's children
  const childIds = children.map((c) => c.id);
  const receipts = childIds.length > 0
    ? await db
        .select()
        .from(paymentEventReceipt)
        .where(inArray(paymentEventReceipt.childId, childIds))
        .orderBy(desc(paymentEventReceipt.paidAt))
    : [];

  const paidEventIdsByChild: Record<string, Set<string>> = {};
  for (const r of receipts) {
    if (!r.childId) continue;
    if (!paidEventIdsByChild[r.childId]) paidEventIdsByChild[r.childId] = new Set();
    paidEventIdsByChild[r.childId].add(r.eventId);
  }

  // Filter events relevant to this user
  const relevantEvents = events.filter((e) => {
    const targetIds: string[] = e.targetAccountIds ? JSON.parse(e.targetAccountIds) : [];
    const targetClasses: string[] = e.targetClass ? JSON.parse(e.targetClass) : [];

    if (e.kioskMode) return false; // kiosk mode not relevant to parents
    if (e.targetType === "ALL_PARENTS" || e.targetType === "BOTH" || e.targetType === "ALL_USERS") return true;
    if (e.targetType === "SELECTED" && targetIds.includes(access.actorUserId)) return true;
    if (e.targetType === "CLASS" && children.some((c) => c.class && targetClasses.includes(c.class))) return true;
    return false;
  });

  return NextResponse.json({
    events: relevantEvents.map((e) => ({
      ...e,
      children: children.map((c) => ({
        ...c,
        paid: paidEventIdsByChild[c.id]?.has(e.id) ?? false,
        receipt: receipts.find((r) => r.childId === c.id && r.eventId === e.id) ?? null,
      })),
    })),
    receipts,
    children,
  });
}
