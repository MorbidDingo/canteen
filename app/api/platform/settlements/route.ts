import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organization,
  settlementAccount,
  settlementBatch,
  settlementLedger,
  user,
} from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

/**
 * GET /api/platform/settlements
 *
 * Returns all settlement batches across organizations for the platform owner
 * to review and manually mark as paid.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER", "PLATFORM_SUPPORT"],
    });

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "PENDING";

    const batches = await db
      .select({
        id: settlementBatch.id,
        organizationId: settlementBatch.organizationId,
        organizationName: organization.name,
        settlementAccountId: settlementBatch.settlementAccountId,
        accountLabel: settlementAccount.label,
        accountMethod: settlementAccount.method,
        ownerName: user.name,
        ownerEmail: user.email,
        totalGross: settlementBatch.totalGross,
        totalFee: settlementBatch.totalFee,
        totalNet: settlementBatch.totalNet,
        orderCount: settlementBatch.orderCount,
        status: settlementBatch.status,
        processedAt: settlementBatch.processedAt,
        createdAt: settlementBatch.createdAt,
      })
      .from(settlementBatch)
      .innerJoin(organization, eq(settlementBatch.organizationId, organization.id))
      .innerJoin(settlementAccount, eq(settlementBatch.settlementAccountId, settlementAccount.id))
      .innerJoin(user, eq(settlementAccount.userId, user.id))
      .where(eq(settlementBatch.status, status))
      .orderBy(desc(settlementBatch.createdAt))
      .limit(200);

    // Aggregate summary across all orgs
    const summaryRows = await db
      .select({
        totalPending: sql<number>`coalesce(sum(case when ${settlementBatch.status} = 'PENDING' then ${settlementBatch.totalNet} else 0 end), 0)`,
        totalSettled: sql<number>`coalesce(sum(case when ${settlementBatch.status} = 'SETTLED' then ${settlementBatch.totalNet} else 0 end), 0)`,
        totalFees: sql<number>`coalesce(sum(${settlementBatch.totalFee}), 0)`,
        batchCount: sql<number>`count(*)`,
      })
      .from(settlementBatch);

    const summary = summaryRows[0] ?? { totalPending: 0, totalSettled: 0, totalFees: 0, batchCount: 0 };

    return NextResponse.json({ batches, summary });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Platform settlements list error:", error);
    return NextResponse.json({ error: "Failed to fetch settlements" }, { status: 500 });
  }
}

/**
 * PATCH /api/platform/settlements
 *
 * Mark one or more settlement batches as SETTLED (manually paid by platform owner).
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER"],
    });

    const body = (await request.json()) as { batchIds?: string[] };
    const batchIds = body.batchIds;

    if (!batchIds || !Array.isArray(batchIds) || batchIds.length === 0) {
      return NextResponse.json({ error: "batchIds array is required" }, { status: 400 });
    }

    const now = new Date();

    await db
      .update(settlementBatch)
      .set({
        status: "SETTLED",
        processedAt: now,
        failureReason: null,
      })
      .where(
        and(
          inArray(settlementBatch.id, batchIds),
          eq(settlementBatch.status, "PENDING"),
        ),
      );

    // Also mark related ledger entries as SETTLED
    await db
      .update(settlementLedger)
      .set({
        status: "SETTLED",
        settledAt: now,
        failureReason: null,
      })
      .where(
        and(
          eq(settlementLedger.status, "PENDING"),
          inArray(
            settlementLedger.settlementAccountId,
            db
              .select({ id: settlementBatch.settlementAccountId })
              .from(settlementBatch)
              .where(inArray(settlementBatch.id, batchIds)),
          ),
        ),
      );

    return NextResponse.json({ success: true, settledCount: batchIds.length });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Platform settlement mark-paid error:", error);
    return NextResponse.json({ error: "Failed to mark settlements as paid" }, { status: 500 });
  }
}
