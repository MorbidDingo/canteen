import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { settlementAccount, settlementBatch, settlementLedger } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN"],
    });

    if (access.deviceLoginProfile) {
      return NextResponse.json(
        { error: "Settlement controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
        { status: 403 },
      );
    }

    const organizationId = access.activeOrganizationId!;

    const accounts = await db
      .select({
        id: settlementAccount.id,
        label: settlementAccount.label,
        method: settlementAccount.method,
        status: settlementAccount.status,
      })
      .from(settlementAccount)
      .where(
        and(
          eq(settlementAccount.organizationId, organizationId),
          eq(settlementAccount.userId, access.actorUserId),
        ),
      )
      .orderBy(desc(settlementAccount.createdAt));

    const accountIds = accounts.map((account) => account.id);
    const accountById = new Map(accounts.map((account) => [account.id, account] as const));

    const batches =
      accountIds.length > 0
        ? await db
            .select({
              id: settlementBatch.id,
              settlementAccountId: settlementBatch.settlementAccountId,
              totalGross: settlementBatch.totalGross,
              totalFee: settlementBatch.totalFee,
              totalNet: settlementBatch.totalNet,
              orderCount: settlementBatch.orderCount,
              status: settlementBatch.status,
              processedAt: settlementBatch.processedAt,
              failureReason: settlementBatch.failureReason,
              createdAt: settlementBatch.createdAt,
            })
            .from(settlementBatch)
            .where(inArray(settlementBatch.settlementAccountId, accountIds))
            .orderBy(desc(settlementBatch.createdAt))
        : [];

    // Weekly revenue summary for this admin's org
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    weekStart.setHours(0, 0, 0, 0);

    const weeklyRevenueRows = await db
      .select({
        totalRevenue: sql<number>`coalesce(sum(${settlementLedger.grossAmount}), 0)`,
        totalFees: sql<number>`coalesce(sum(${settlementLedger.platformFee}), 0)`,
        netRevenue: sql<number>`coalesce(sum(${settlementLedger.netAmount}), 0)`,
        settledAmount: sql<number>`coalesce(sum(case when ${settlementLedger.status} = 'SETTLED' then ${settlementLedger.netAmount} else 0 end), 0)`,
        pendingAmount: sql<number>`coalesce(sum(case when ${settlementLedger.status} = 'PENDING' then ${settlementLedger.netAmount} else 0 end), 0)`,
      })
      .from(settlementLedger)
      .where(
        and(
          eq(settlementLedger.organizationId, organizationId),
          eq(settlementLedger.entryType, "DEBIT"),
          gte(settlementLedger.createdAt, weekStart),
        ),
      );

    const weeklyRevenue = weeklyRevenueRows[0] ?? {
      totalRevenue: 0,
      totalFees: 0,
      netRevenue: 0,
      settledAmount: 0,
      pendingAmount: 0,
    };

    // Weekly pay status: is there a pending batch from this week?
    const weeklyBatchStatus =
      batches.filter((b) => new Date(b.createdAt) >= weekStart).length > 0
        ? batches.filter((b) => new Date(b.createdAt) >= weekStart).every((b) => b.status === "SETTLED")
          ? "PAID"
          : "PENDING"
        : "NO_BATCHES";

    return NextResponse.json({
      accounts,
      batches: batches.map((batch) => ({
        ...batch,
        account: accountById.get(batch.settlementAccountId) ?? null,
      })),
      weeklyRevenue: {
        ...weeklyRevenue,
        weekStart: weekStart.toISOString(),
        payStatus: weeklyBatchStatus,
      },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Admin settlement history list error:", error);
    return NextResponse.json({ error: "Failed to fetch settlement history" }, { status: 500 });
  }
}
