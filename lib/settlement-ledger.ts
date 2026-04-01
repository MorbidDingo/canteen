import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  canteenPaymentRouting,
  child,
  order,
  organizationDevice,
  organizationMembership,
  settlementAccount,
  settlementLedger,
} from "@/lib/db/schema";
import { getUserAccessibleDeviceIds } from "@/lib/device-context";

type LedgerEntryType = "DEBIT" | "REVERSAL";

type OrderContext = {
  id: string;
  organizationId: string | null;
  canteenId: string | null;
  totalAmount: number;
  platformFee: number;
  paymentMethod: "CASH" | "UPI" | "ONLINE" | "WALLET";
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

async function getOrderContext(orderId: string): Promise<OrderContext | null> {
  const [row] = await db
    .select({
      id: order.id,
      totalAmount: order.totalAmount,
      platformFee: order.platformFee,
      paymentMethod: order.paymentMethod,
      orderCanteenId: order.canteenId,
      childOrganizationId: child.organizationId,
      deviceOrganizationId: organizationDevice.organizationId,
      deviceCanteenId: organizationDevice.canteenId,
    })
    .from(order)
    .leftJoin(child, eq(order.childId, child.id))
    .leftJoin(organizationDevice, eq(order.deviceId, organizationDevice.id))
    .where(eq(order.id, orderId))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    organizationId: row.childOrganizationId ?? row.deviceOrganizationId ?? null,
    canteenId: row.orderCanteenId ?? row.deviceCanteenId ?? null,
    totalAmount: row.totalAmount,
    platformFee: row.platformFee ?? 0,
    paymentMethod: row.paymentMethod,
  };
}

async function resolveExplicitRoutingAccountId(organizationId: string, canteenId: string) {
  const [explicit] = await db
    .select({
      settlementAccountId: canteenPaymentRouting.settlementAccountId,
    })
    .from(canteenPaymentRouting)
    .innerJoin(settlementAccount, eq(canteenPaymentRouting.settlementAccountId, settlementAccount.id))
    .where(
      and(
        eq(canteenPaymentRouting.canteenId, canteenId),
        eq(settlementAccount.organizationId, organizationId),
        eq(settlementAccount.status, "ACTIVE"),
      ),
    )
    .limit(1);

  return explicit?.settlementAccountId ?? null;
}

async function resolveDefaultAdminRoutingAccountId(organizationId: string, canteenId: string) {
  const admins = await db
    .select({ userId: organizationMembership.userId })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.role, "ADMIN"),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    );

  for (const admin of admins) {
    const deviceIds = await getUserAccessibleDeviceIds({
      organizationId,
      userId: admin.userId,
      allowedDeviceTypes: ["KIOSK"],
    });

    if (deviceIds.length === 0) continue;

    const [matchesCanteen] = await db
      .select({ id: organizationDevice.id })
      .from(organizationDevice)
      .where(
        and(
          inArray(organizationDevice.id, deviceIds),
          eq(organizationDevice.canteenId, canteenId),
          eq(organizationDevice.deviceType, "KIOSK"),
          eq(organizationDevice.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (!matchesCanteen) continue;

    const [activeAccount] = await db
      .select({ id: settlementAccount.id })
      .from(settlementAccount)
      .where(
        and(
          eq(settlementAccount.organizationId, organizationId),
          eq(settlementAccount.userId, admin.userId),
          eq(settlementAccount.status, "ACTIVE"),
        ),
      )
      .orderBy(desc(settlementAccount.createdAt))
      .limit(1);

    if (activeAccount) {
      return activeAccount.id;
    }
  }

  return null;
}

export async function resolveSettlementAccountIdForOrder(orderId: string) {
  const context = await getOrderContext(orderId);
  if (!context || !context.organizationId || !context.canteenId) {
    return { settlementAccountId: null, context };
  }

  const explicit = await resolveExplicitRoutingAccountId(context.organizationId, context.canteenId);
  if (explicit) {
    return { settlementAccountId: explicit, context };
  }

  const fallback = await resolveDefaultAdminRoutingAccountId(context.organizationId, context.canteenId);
  return { settlementAccountId: fallback, context };
}

export async function createSettlementLedgerEntryForOrder(options: {
  orderId: string;
  entryType: LedgerEntryType;
}) {
  const { orderId, entryType } = options;

  const context = await getOrderContext(orderId);
  if (!context || !context.organizationId) {
    return { created: false, reason: "ORDER_OR_ORGANIZATION_NOT_FOUND" as const };
  }

  if (entryType === "DEBIT" && context.paymentMethod === "CASH") {
    return { created: false, reason: "CASH_ORDER_SKIPPED" as const };
  }

  if (entryType === "DEBIT") {
    const [existingDebit] = await db
      .select({ id: settlementLedger.id })
      .from(settlementLedger)
      .where(
        and(
          eq(settlementLedger.orderId, orderId),
          eq(settlementLedger.entryType, "DEBIT"),
        ),
      )
      .limit(1);

    if (existingDebit) {
      return { created: false, reason: "DEBIT_ALREADY_EXISTS" as const };
    }
  }

  let settlementAccountId: string | null = null;

  if (entryType === "REVERSAL") {
    const [debitEntry] = await db
      .select({ settlementAccountId: settlementLedger.settlementAccountId })
      .from(settlementLedger)
      .where(
        and(
          eq(settlementLedger.orderId, orderId),
          eq(settlementLedger.entryType, "DEBIT"),
        ),
      )
      .orderBy(desc(settlementLedger.createdAt))
      .limit(1);

    settlementAccountId = debitEntry?.settlementAccountId ?? null;
  }

  if (!settlementAccountId) {
    const resolved = await resolveSettlementAccountIdForOrder(orderId);
    settlementAccountId = resolved.settlementAccountId;
  }

  const grossAmount = round2(context.totalAmount + (context.platformFee ?? 0));
  const platformFee = round2(context.platformFee ?? 0);
  const netAmount = round2(grossAmount - platformFee);

  const [created] = await db
    .insert(settlementLedger)
    .values({
      organizationId: context.organizationId,
      settlementAccountId,
      orderId,
      grossAmount,
      platformFee,
      netAmount,
      entryType,
      status: "PENDING",
    })
    .returning({
      id: settlementLedger.id,
      settlementAccountId: settlementLedger.settlementAccountId,
      status: settlementLedger.status,
    });

  return { created: true, ledger: created };
}
