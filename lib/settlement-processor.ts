import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { settlementAccount, settlementBatch, settlementLedger } from "@/lib/db/schema";
import { createPayout, hasRazorpayPayoutCredentials } from "@/lib/razorpay-payout";

export type SettlementProcessSummary = {
  success: boolean;
  source: "cron" | "realtime";
  batchesInitiated: number;
  skippedBlocked: number;
  skippedNonPositive: number;
  skippedMissingFundAccount: number;
  errors: Array<{ accountId: string; error: string }>;
  message?: string;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export async function processPendingSettlements(options?: {
  settlementAccountId?: string;
  source?: "cron" | "realtime";
}): Promise<SettlementProcessSummary> {
  const source = options?.source ?? "cron";

  if (!hasRazorpayPayoutCredentials()) {
    return {
      success: true,
      source,
      message: "Razorpay payout credentials not configured. No-op run.",
      batchesInitiated: 0,
      skippedBlocked: 0,
      skippedNonPositive: 0,
      skippedMissingFundAccount: 0,
      errors: [],
    };
  }

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

  let batchesInitiated = 0;
  let skippedBlocked = 0;
  let skippedNonPositive = 0;
  let skippedMissingFundAccount = 0;
  const errors: Array<{ accountId: string; error: string }> = [];

  for (const [key, entries] of grouped.entries()) {
    const [organizationId, settlementAccountId] = key.split("::");
    if (!settlementAccountId) continue;

    const [account] = await db
      .select({
        id: settlementAccount.id,
        status: settlementAccount.status,
        razorpayFundAccountId: settlementAccount.razorpayFundAccountId,
      })
      .from(settlementAccount)
      .where(eq(settlementAccount.id, settlementAccountId))
      .limit(1);

    if (!account || account.status === "BLOCKED") {
      skippedBlocked += 1;
      continue;
    }

    if (!account.razorpayFundAccountId) {
      skippedMissingFundAccount += 1;
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

    const [batch] = await db
      .insert(settlementBatch)
      .values({
        organizationId,
        settlementAccountId,
        totalGross,
        totalFee,
        totalNet,
        orderCount: entries.length,
        status: "PENDING",
      })
      .returning({ id: settlementBatch.id });

    try {
      const payoutId = await createPayout({
        fundAccountId: account.razorpayFundAccountId,
        amountPaise: Math.round(totalNet * 100),
        reference: batch.id,
      });

      await db
        .update(settlementBatch)
        .set({
          status: "PROCESSING",
          razorpayPayoutId: payoutId,
          processedAt: new Date(),
        })
        .where(eq(settlementBatch.id, batch.id));

      await db
        .update(settlementLedger)
        .set({
          status: "PROCESSING",
          razorpayPayoutId: payoutId,
        })
        .where(inArray(settlementLedger.id, entries.map((entry) => entry.id)));

      batchesInitiated += 1;
    } catch (error) {
      await db
        .update(settlementBatch)
        .set({
          status: "FAILED",
          failureReason: error instanceof Error ? error.message : "Unknown payout failure",
          processedAt: new Date(),
        })
        .where(eq(settlementBatch.id, batch.id));

      errors.push({
        accountId: settlementAccountId,
        error: error instanceof Error ? error.message : "Unknown payout failure",
      });
    }
  }

  return {
    success: true,
    source,
    batchesInitiated,
    skippedBlocked,
    skippedNonPositive,
    skippedMissingFundAccount,
    errors,
  };
}
