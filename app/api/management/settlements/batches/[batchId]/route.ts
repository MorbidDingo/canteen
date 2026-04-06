import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settlementAccount, settlementBatch, settlementLedger, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const { batchId } = await params;
    const organizationId = access.activeOrganizationId!;

    const [batch] = await db
      .select({
        id: settlementBatch.id,
        settlementAccountId: settlementBatch.settlementAccountId,
        totalGross: settlementBatch.totalGross,
        totalFee: settlementBatch.totalFee,
        totalNet: settlementBatch.totalNet,
        orderCount: settlementBatch.orderCount,
        status: settlementBatch.status,
        razorpayPayoutId: settlementBatch.razorpayPayoutId,
        processedAt: settlementBatch.processedAt,
        failureReason: settlementBatch.failureReason,
        createdAt: settlementBatch.createdAt,
        accountLabel: settlementAccount.label,
        ownerName: user.name,
      })
      .from(settlementBatch)
      .innerJoin(settlementAccount, eq(settlementBatch.settlementAccountId, settlementAccount.id))
      .innerJoin(user, eq(settlementAccount.userId, user.id))
      .where(
        and(
          eq(settlementBatch.id, batchId),
          eq(settlementBatch.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!batch) {
      return NextResponse.json({ error: "Settlement batch not found" }, { status: 404 });
    }

    const entries = batch.razorpayPayoutId
      ? await db
          .select({
            id: settlementLedger.id,
            orderId: settlementLedger.orderId,
            grossAmount: settlementLedger.grossAmount,
            platformFee: settlementLedger.platformFee,
            netAmount: settlementLedger.netAmount,
            entryType: settlementLedger.entryType,
            status: settlementLedger.status,
            settledAt: settlementLedger.settledAt,
            failureReason: settlementLedger.failureReason,
            createdAt: settlementLedger.createdAt,
          })
          .from(settlementLedger)
          .where(eq(settlementLedger.razorpayPayoutId, batch.razorpayPayoutId))
          .orderBy(desc(settlementLedger.createdAt))
      : [];

    return NextResponse.json({
      batch,
      entries,
      note: batch.razorpayPayoutId
        ? null
        : "This batch has no payout reference yet, so direct ledger linkage is not available.",
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Management settlement batch detail error:", error);
    return NextResponse.json({ error: "Failed to fetch settlement batch details" }, { status: 500 });
  }
}
