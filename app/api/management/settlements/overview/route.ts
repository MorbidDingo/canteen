import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  canteen,
  canteenPaymentRouting,
  order,
  settlementAccount,
  settlementBatch,
  settlementLedger,
  user,
} from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

type WindowKey = "daily" | "weekly" | "monthly";

function getSinceDate(windowKey: WindowKey) {
  const now = Date.now();
  const days = windowKey === "daily" ? 1 : windowKey === "weekly" ? 7 : 30;
  return new Date(now - days * 24 * 60 * 60 * 1000);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const rawWindow = request.nextUrl.searchParams.get("window")?.toLowerCase();
    const windowKey: WindowKey = rawWindow === "daily" || rawWindow === "weekly" || rawWindow === "monthly"
      ? rawWindow
      : "weekly";
    const since = getSinceDate(windowKey);
    const organizationId = access.activeOrganizationId!;

    const ledgerRows = await db
      .select({
        id: settlementLedger.id,
        settlementAccountId: settlementLedger.settlementAccountId,
        grossAmount: settlementLedger.grossAmount,
        platformFee: settlementLedger.platformFee,
        netAmount: settlementLedger.netAmount,
        entryType: settlementLedger.entryType,
        status: settlementLedger.status,
        createdAt: settlementLedger.createdAt,
        settledAt: settlementLedger.settledAt,
        accountOwnerId: settlementAccount.userId,
        accountOwnerName: user.name,
      })
      .from(settlementLedger)
      .leftJoin(settlementAccount, eq(settlementLedger.settlementAccountId, settlementAccount.id))
      .leftJoin(user, eq(settlementAccount.userId, user.id))
      .where(
        and(
          eq(settlementLedger.organizationId, organizationId),
          gte(settlementLedger.createdAt, since),
        ),
      );

    let totalCollected = 0;
    let totalPlatformFees = 0;
    let totalSettled = 0;
    let pendingNet = 0;

    const perAdminMap = new Map<
      string,
      {
        userId: string;
        adminName: string;
        gross: number;
        fee: number;
        net: number;
        lastSettledAt: Date | null;
      }
    >();

    for (const row of ledgerRows) {
      const sign = row.entryType === "REVERSAL" ? -1 : 1;
      totalCollected += sign * row.grossAmount;
      totalPlatformFees += sign * row.platformFee;

      if (row.status === "SETTLED") {
        totalSettled += sign * row.netAmount;
      }
      if (row.status === "PENDING" || row.status === "PROCESSING") {
        pendingNet += sign * row.netAmount;
      }

      if (!row.accountOwnerId || !row.accountOwnerName) continue;

      const existing = perAdminMap.get(row.accountOwnerId) ?? {
        userId: row.accountOwnerId,
        adminName: row.accountOwnerName,
        gross: 0,
        fee: 0,
        net: 0,
        lastSettledAt: null,
      };

      existing.gross += sign * row.grossAmount;
      existing.fee += sign * row.platformFee;
      existing.net += sign * row.netAmount;

      if (row.status === "SETTLED" && row.settledAt) {
        if (!existing.lastSettledAt || row.settledAt > existing.lastSettledAt) {
          existing.lastSettledAt = row.settledAt;
        }
      }

      perAdminMap.set(row.accountOwnerId, existing);
    }

    const routingRows = await db
      .select({
        accountOwnerId: settlementAccount.userId,
        canteenId: canteenPaymentRouting.canteenId,
      })
      .from(canteenPaymentRouting)
      .innerJoin(settlementAccount, eq(canteenPaymentRouting.settlementAccountId, settlementAccount.id))
      .where(eq(settlementAccount.organizationId, organizationId));

    const canteenCountByAdmin = new Map<string, Set<string>>();
    for (const row of routingRows) {
      const set = canteenCountByAdmin.get(row.accountOwnerId) ?? new Set<string>();
      set.add(row.canteenId);
      canteenCountByAdmin.set(row.accountOwnerId, set);
    }

    const perAdmin = Array.from(perAdminMap.values())
      .map((row) => ({
        userId: row.userId,
        adminName: row.adminName,
        canteens: canteenCountByAdmin.get(row.userId)?.size ?? 0,
        gross: round2(row.gross),
        fee: round2(row.fee),
        net: round2(row.net),
        lastSettledAt: row.lastSettledAt,
      }))
      .sort((a, b) => b.net - a.net);

    const batches = await db
      .select({
        id: settlementBatch.id,
        totalGross: settlementBatch.totalGross,
        totalFee: settlementBatch.totalFee,
        totalNet: settlementBatch.totalNet,
        orderCount: settlementBatch.orderCount,
        status: settlementBatch.status,
        razorpayPayoutId: settlementBatch.razorpayPayoutId,
        processedAt: settlementBatch.processedAt,
        failureReason: settlementBatch.failureReason,
        createdAt: settlementBatch.createdAt,
        accountId: settlementAccount.id,
        accountLabel: settlementAccount.label,
        ownerName: user.name,
      })
      .from(settlementBatch)
      .innerJoin(settlementAccount, eq(settlementBatch.settlementAccountId, settlementAccount.id))
      .innerJoin(user, eq(settlementAccount.userId, user.id))
      .where(
        and(
          eq(settlementBatch.organizationId, organizationId),
          gte(settlementBatch.createdAt, since),
        ),
      )
      .orderBy(desc(settlementBatch.createdAt))
      .limit(100);

    const unroutedRows = await db
      .select({
        canteenId: canteen.id,
        canteenName: canteen.name,
        ledgerId: settlementLedger.id,
        grossAmount: settlementLedger.grossAmount,
        platformFee: settlementLedger.platformFee,
        netAmount: settlementLedger.netAmount,
        entryType: settlementLedger.entryType,
      })
      .from(settlementLedger)
      .leftJoin(order, eq(settlementLedger.orderId, order.id))
      .leftJoin(canteen, eq(order.canteenId, canteen.id))
      .where(
        and(
          eq(settlementLedger.organizationId, organizationId),
          gte(settlementLedger.createdAt, since),
          isNull(settlementLedger.settlementAccountId),
        ),
      );

    const unroutedByCanteen = new Map<
      string,
      { canteenId: string; canteenName: string; entryCount: number; gross: number; fee: number; net: number }
    >();
    for (const row of unroutedRows) {
      const canteenId = row.canteenId ?? "unknown";
      const canteenName = row.canteenName ?? "Unknown Canteen";
      const sign = row.entryType === "REVERSAL" ? -1 : 1;
      const existing = unroutedByCanteen.get(canteenId) ?? {
        canteenId,
        canteenName,
        entryCount: 0,
        gross: 0,
        fee: 0,
        net: 0,
      };

      existing.entryCount += 1;
      existing.gross += sign * row.grossAmount;
      existing.fee += sign * row.platformFee;
      existing.net += sign * row.netAmount;
      unroutedByCanteen.set(canteenId, existing);
    }

    const unroutedFunds = Array.from(unroutedByCanteen.values())
      .map((row) => ({
        ...row,
        gross: round2(row.gross),
        fee: round2(row.fee),
        net: round2(row.net),
      }))
      .sort((a, b) => b.net - a.net);

    const allCanteens = await db
      .select({ id: canteen.id, name: canteen.name })
      .from(canteen)
      .where(eq(canteen.organizationId, organizationId));

    const explicitlyRouted = new Set(routingRows.map((row) => row.canteenId));
    const canteensWithoutRouting = allCanteens
      .filter((entry) => !explicitlyRouted.has(entry.id))
      .map((entry) => ({ id: entry.id, name: entry.name }));

    return NextResponse.json({
      window: windowKey,
      since,
      summary: {
        totalCollected: round2(totalCollected),
        totalPlatformFees: round2(totalPlatformFees),
        totalSettled: round2(totalSettled),
        pending: round2(pendingNet),
      },
      perAdmin,
      batches,
      unroutedFunds,
      canteensWithoutRouting,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Management settlement overview error:", error);
    return NextResponse.json({ error: "Failed to fetch settlement overview" }, { status: 500 });
  }
}
