import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { settlementAccount, settlementBatch } from "@/lib/db/schema";
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
              razorpayPayoutId: settlementBatch.razorpayPayoutId,
              processedAt: settlementBatch.processedAt,
              failureReason: settlementBatch.failureReason,
              createdAt: settlementBatch.createdAt,
            })
            .from(settlementBatch)
            .where(inArray(settlementBatch.settlementAccountId, accountIds))
            .orderBy(desc(settlementBatch.createdAt))
        : [];

    return NextResponse.json({
      accounts,
      batches: batches.map((batch) => ({
        ...batch,
        account: accountById.get(batch.settlementAccountId) ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Admin settlement history list error:", error);
    return NextResponse.json({ error: "Failed to fetch settlement history" }, { status: 500 });
  }
}
