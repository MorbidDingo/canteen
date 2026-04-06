import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { child, organizationMembership, paymentEvent } from "@/lib/db/schema";
import { notifyParentForChild } from "@/lib/parent-notifications";

export const PAYMENT_EVENT_TARGET_TYPES = [
  "ALL_PARENTS",
  "ALL_GENERAL",
  "BOTH",
  "CLASS",
  "SELECTED",
  "KIOSK",
  "ALL_USERS",
] as const;

export type PaymentEventTargetType = (typeof PAYMENT_EVENT_TARGET_TYPES)[number];

type EventSnapshot = Pick<
  typeof paymentEvent.$inferSelect,
  "id" | "title" | "amount" | "dueDate" | "targetType" | "targetClass" | "targetAccountIds"
>;

export function parseJsonStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  } catch {
    return [];
  }
}

export function sanitizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function normalizeTargetType(input: unknown): PaymentEventTargetType {
  if (typeof input !== "string") return "BOTH";
  if ((PAYMENT_EVENT_TARGET_TYPES as readonly string[]).includes(input)) {
    return input as PaymentEventTargetType;
  }
  return "BOTH";
}

export async function validateSelectedAccountIds(
  organizationId: string,
  accountIds: string[],
): Promise<boolean> {
  if (accountIds.length === 0) return false;

  const rows = await db
    .select({ userId: organizationMembership.userId })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.status, "ACTIVE"),
        inArray(organizationMembership.role, ["PARENT", "GENERAL"]),
        inArray(organizationMembership.userId, accountIds),
      ),
    );

  const uniqueValid = new Set(rows.map((r) => r.userId));
  return uniqueValid.size === new Set(accountIds).size;
}

async function resolveTargetChildIds(orgId: string, event: EventSnapshot): Promise<string[]> {
  const rows = await db
    .select({
      id: child.id,
      parentId: child.parentId,
      className: child.className,
    })
    .from(child)
    .where(eq(child.organizationId, orgId));

  switch (event.targetType) {
    case "ALL_PARENTS":
    case "BOTH":
    case "ALL_USERS":
      return rows.map((r) => r.id);

    case "CLASS": {
      const targetClasses = parseJsonStringArray(event.targetClass).map((c) => c.toLowerCase());
      if (targetClasses.length === 0) return [];
      const classSet = new Set(targetClasses);
      return rows
        .filter((r) => r.className && classSet.has(r.className.toLowerCase()))
        .map((r) => r.id);
    }

    case "SELECTED": {
      const selectedIds = new Set(parseJsonStringArray(event.targetAccountIds));
      if (selectedIds.size === 0) return [];
      return rows.filter((r) => selectedIds.has(r.parentId)).map((r) => r.id);
    }

    case "ALL_GENERAL":
    case "KIOSK":
      return [];

    default:
      return rows.map((r) => r.id);
  }
}

export async function broadcastPaymentEventToTargets(orgId: string, event: EventSnapshot) {
  const childIds = await resolveTargetChildIds(orgId, event);

  for (const childId of childIds) {
    await notifyParentForChild({
      childId,
      type: "PAYMENT_EVENT_CREATED",
      title: `Payment Required: ${event.title}`,
      message: `A payment of Rs ${event.amount.toFixed(2)} is due${event.dueDate ? ` by ${new Date(event.dueDate).toLocaleDateString()}` : ""}.`,
      metadata: {
        eventId: event.id,
        amount: event.amount,
        dueDate: event.dueDate,
        targetType: event.targetType,
      },
    });
  }
}
