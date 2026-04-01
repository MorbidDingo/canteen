import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { settlementAccount, settlementBatch, settlementLedger } from "@/lib/db/schema";

export type SettlementProcessSummary = {
  success: boolean;
  source: "cron" | "realtime";
  batchesCreated: number;
  skippedBlocked: number;
  skippedNonPositive: number;
  errors: Array<{ accountId: string; error: string }>;
  message?: string;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Groups pending settlement ledger entries by account and creates
 * settlement batches with status PENDING.  The platform owner will
 * mark batches as SETTLED manually when they pay the vendor.
 */
export async function processPendingSettlements(options?: {
  settlementAccountId?: string;
  source?: "cron" | "realtime";
}): Promise<SettlementProcessSummary> {
  const source = options?.source ?? "cron";

  const pending = await db
    .select({
      id: settlementLedger.id,
      organizationId: settlementLedger.organizationId,
      settlementAccountId: settlementLedger.settlementAccountId,
      grossAmount: settlementLedger.grossAmount,
      platformFee: settlementLedger.platformFee,
      netAmount: settlementLedger.netAmount,
      entryType: settlementLedger.entryType,
    })
    .from(settlementLedger)
    .where(
      options?.settlementAccountId
        ? and(
            eq(settlementLedger.status, "PENDING"),
            eq(settlementLedger.settlementAccountId, options.settlementAccountId),
          )
        : and(
            eq(settlementLedger.status, "PENDING"),
            isNotNull(settlementLedger.settlementAccountId),
          ),
    );

  const grouped = new Map<string, typeof pending>();
  for (const row of pending) {
    if (!row.settlementAccountId) continue;
    const key = `${row.organizationId}::${row.settlementAccountId}`;
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }

  let batchesCreated = 0;
  let skippedBlocked = 0;
  let skippedNonPositive = 0;
  const errors: Array<{ accountId: string; error: string }> = [];

  for (const [key, entries] of grouped.entries()) {
    const [organizationId, settlementAccountId] = key.split("::");
    if (!settlementAccountId) continue;

    const [account] = await db
      .select({
        id: settlementAccount.id,
        status: settlementAccount.status,
      })
      .from(settlementAccount)
      .where(eq(settlementAccount.id, settlementAccountId))
      .limit(1);

    if (!account || account.status === "BLOCKED") {
      skippedBlocked += 1;
      continue;
    }

    let totalGross = 0;
    let totalFee = 0;
    let totalNet = 0;

    for (const entry of entries) {
      const sign = entry.entryType === "REVERSAL" ? -1 : 1;
      totalGross += sign * entry.grossAmount;
      totalFee += sign * entry.platformFee;
      totalNet += sign * entry.netAmount;
    }

    totalGross = round2(totalGross);
    totalFee = round2(totalFee);
    totalNet = round2(totalNet);

    if (totalNet <= 0) {
      skippedNonPositive += 1;
      continue;
    }

    try {
      await db
        .insert(settlementBatch)
        .values({
          organizationId,
          settlementAccountId,
          totalGross,
          totalFee,
          totalNet,
          orderCount: entries.length,
          status: "PENDING",
        });

      batchesCreated += 1;
    } catch (error) {
      errors.push({
        accountId: settlementAccountId,
        error: error instanceof Error ? error.message : "Unknown batch creation failure",
      });
    }
  }

  return {
    success: true,
    source,
    batchesCreated,
    skippedBlocked,
    skippedNonPositive,
    errors,
  };
}
