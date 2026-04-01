import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, settlementAccount, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

/**
 * GET /api/platform/settlement-accounts
 *
 * Lists all settlement accounts across organizations for platform review.
 */
export async function GET() {
  try {
    await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER", "PLATFORM_SUPPORT"],
    });

    const accounts = await db
      .select({
        id: settlementAccount.id,
        organizationId: settlementAccount.organizationId,
        organizationName: organization.name,
        userId: settlementAccount.userId,
        ownerName: user.name,
        ownerEmail: user.email,
        accountType: settlementAccount.accountType,
        label: settlementAccount.label,
        method: settlementAccount.method,
        bankIfsc: settlementAccount.bankIfsc,
        bankAccountHolderName: settlementAccount.bankAccountHolderName,
        upiVpa: settlementAccount.upiVpa,
        status: settlementAccount.status,
        blockReason: settlementAccount.blockReason,
        createdAt: settlementAccount.createdAt,
      })
      .from(settlementAccount)
      .innerJoin(organization, eq(settlementAccount.organizationId, organization.id))
      .innerJoin(user, eq(settlementAccount.userId, user.id))
      .orderBy(desc(settlementAccount.createdAt));

    return NextResponse.json({ accounts });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Platform settlement accounts list error:", error);
    return NextResponse.json({ error: "Failed to fetch settlement accounts" }, { status: 500 });
  }
}

/**
 * PATCH /api/platform/settlement-accounts
 *
 * Platform owner approves (ACTIVE) or blocks a settlement account.
 */
export async function PATCH(request: NextRequest) {
  try {
    await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER"],
    });

    const body = (await request.json()) as { accountId?: string; action?: string; reason?: string };
    const { accountId, action, reason } = body;

    if (!accountId || !action) {
      return NextResponse.json({ error: "accountId and action are required" }, { status: 400 });
    }

    if (action !== "approve" && action !== "block") {
      return NextResponse.json({ error: "action must be 'approve' or 'block'" }, { status: 400 });
    }

    const [existing] = await db
      .select({ id: settlementAccount.id, status: settlementAccount.status })
      .from(settlementAccount)
      .where(eq(settlementAccount.id, accountId))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Settlement account not found" }, { status: 404 });
    }

    if (action === "approve") {
      await db
        .update(settlementAccount)
        .set({ status: "ACTIVE", updatedAt: new Date() })
        .where(eq(settlementAccount.id, accountId));

      return NextResponse.json({ success: true, status: "ACTIVE" });
    }

    if (action === "block") {
      await db
        .update(settlementAccount)
        .set({
          status: "BLOCKED",
          blockReason: reason || "Blocked by platform owner",
          blockedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(settlementAccount.id, accountId));

      return NextResponse.json({ success: true, status: "BLOCKED" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Platform settlement account update error:", error);
    return NextResponse.json({ error: "Failed to update settlement account" }, { status: 500 });
  }
}
