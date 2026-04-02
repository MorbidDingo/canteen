import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organization,
  organizationMembership,
  settlementAccount,
  settlementBatch,
  settlementLedger,
  user,
  canteen,
} from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

/**
 * GET /api/platform/tenant-overview
 *
 * Returns all tenants (OWNER users) with their orgs, settlement accounts,
 * and weekly revenue summary. Used by Certe platform owner to view and settle.
 */
export async function GET() {
  try {
    await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER", "PLATFORM_SUPPORT"],
    });

    // Get all organizations with their owner
    const orgs = await db
      .select({
        orgId: organization.id,
        orgName: organization.name,
        orgSlug: organization.slug,
        orgType: organization.type,
        orgStatus: organization.status,
        orgCreatedAt: organization.createdAt,
      })
      .from(organization)
      .orderBy(desc(organization.createdAt));

    // Get owners per org
    const owners = await db
      .select({
        orgId: organizationMembership.organizationId,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userPhone: user.phone,
        role: organizationMembership.role,
      })
      .from(organizationMembership)
      .innerJoin(user, eq(organizationMembership.userId, user.id))
      .where(eq(organizationMembership.role, "OWNER"));

    // Get all settlement accounts
    const accounts = await db
      .select({
        id: settlementAccount.id,
        orgId: settlementAccount.organizationId,
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
      .innerJoin(user, eq(settlementAccount.userId, user.id))
      .orderBy(desc(settlementAccount.createdAt));

    // Weekly revenue per org (last 7 days)  
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const weeklyRevenue = await db
      .select({
        orgId: settlementLedger.organizationId,
        totalGross: sql<number>`coalesce(sum(${settlementLedger.grossAmount}), 0)`,
        totalFee: sql<number>`coalesce(sum(${settlementLedger.platformFee}), 0)`,
        totalNet: sql<number>`coalesce(sum(${settlementLedger.netAmount}), 0)`,
        entryCount: sql<number>`count(*)`,
      })
      .from(settlementLedger)
      .where(sql`${settlementLedger.createdAt} >= ${weekAgo}`)
      .groupBy(settlementLedger.organizationId);

    // Pending settlement totals per org
    const pendingSettlements = await db
      .select({
        orgId: settlementBatch.organizationId,
        pendingNet: sql<number>`coalesce(sum(${settlementBatch.totalNet}), 0)`,
        pendingCount: sql<number>`count(*)`,
      })
      .from(settlementBatch)
      .where(eq(settlementBatch.status, "PENDING"))
      .groupBy(settlementBatch.organizationId);

    // Get canteen counts per org
    const canteenCounts = await db
      .select({
        orgId: canteen.organizationId,
        count: sql<number>`count(*)`,
      })
      .from(canteen)
      .groupBy(canteen.organizationId);

    // Build structured response
    const ownersByOrg = new Map<string, typeof owners>();
    for (const o of owners) {
      const list = ownersByOrg.get(o.orgId) ?? [];
      list.push(o);
      ownersByOrg.set(o.orgId, list);
    }

    const accountsByOrg = new Map<string, typeof accounts>();
    for (const a of accounts) {
      const list = accountsByOrg.get(a.orgId) ?? [];
      list.push(a);
      accountsByOrg.set(a.orgId, list);
    }

    const revenueByOrg = new Map(weeklyRevenue.map((r) => [r.orgId, r]));
    const pendingByOrg = new Map(pendingSettlements.map((p) => [p.orgId, p]));
    const canteensByOrg = new Map(canteenCounts.map((c) => [c.orgId, c.count]));

    const tenants = orgs.map((org) => ({
      id: org.orgId,
      name: org.orgName,
      slug: org.orgSlug,
      type: org.orgType,
      status: org.orgStatus,
      createdAt: org.orgCreatedAt,
      canteenCount: canteensByOrg.get(org.orgId) ?? 0,
      owners: (ownersByOrg.get(org.orgId) ?? []).map((o) => ({
        userId: o.userId,
        name: o.userName,
        email: o.userEmail,
        phone: o.userPhone,
      })),
      settlementAccounts: (accountsByOrg.get(org.orgId) ?? []).map((a) => ({
        id: a.id,
        label: a.label,
        method: a.method,
        accountType: a.accountType,
        status: a.status,
        ownerName: a.ownerName,
        ownerEmail: a.ownerEmail,
        bankIfsc: a.bankIfsc,
        bankAccountHolderName: a.bankAccountHolderName,
        upiVpa: a.upiVpa,
        blockReason: a.blockReason,
      })),
      weeklyRevenue: revenueByOrg.get(org.orgId) ?? {
        totalGross: 0,
        totalFee: 0,
        totalNet: 0,
        entryCount: 0,
      },
      pendingSettlement: pendingByOrg.get(org.orgId) ?? {
        pendingNet: 0,
        pendingCount: 0,
      },
    }));

    // Global summary
    const summary = {
      totalOrgs: orgs.length,
      activeOrgs: orgs.filter((o) => o.orgStatus === "ACTIVE").length,
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter((a) => a.status === "ACTIVE").length,
      pendingAccounts: accounts.filter((a) => a.status === "PENDING_VERIFICATION").length,
      weeklyGrossRevenue: weeklyRevenue.reduce((s, r) => s + Number(r.totalGross), 0),
      weeklyPlatformFees: weeklyRevenue.reduce((s, r) => s + Number(r.totalFee), 0),
      weeklyNetRevenue: weeklyRevenue.reduce((s, r) => s + Number(r.totalNet), 0),
      totalPendingSettlement: pendingSettlements.reduce((s, p) => s + Number(p.pendingNet), 0),
      totalPendingBatches: pendingSettlements.reduce((s, p) => s + Number(p.pendingCount), 0),
    };

    return NextResponse.json({ tenants, summary });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Platform tenant overview error:", error);
    return NextResponse.json({ error: "Failed to fetch tenant overview" }, { status: 500 });
  }
}
