import { NextResponse } from "next/server";
import { and, countDistinct, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, organizationMembership } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";
import { OWNER_ORG_PLAN_LIST } from "@/lib/constants";
import { resolveOwnerPlan } from "@/lib/owner-org-plan";

async function requireOwnerUserId() {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("UNAUTHENTICATED");
  }

  const [ownerMembership] = await db
    .select({ organizationId: organizationMembership.organizationId })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.userId, session.user.id),
        eq(organizationMembership.role, "OWNER"),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!ownerMembership) {
    throw new Error("FORBIDDEN");
  }

  return session.user.id;
}

export async function GET() {
  try {
    const ownerUserId = await requireOwnerUserId();
    const plan = await resolveOwnerPlan(ownerUserId);

    const [{ ownedCount }] = await db
      .select({ ownedCount: countDistinct(organizationMembership.organizationId) })
      .from(organizationMembership)
      .innerJoin(organization, eq(organizationMembership.organizationId, organization.id))
      .where(
        and(
          eq(organizationMembership.userId, ownerUserId),
          eq(organizationMembership.role, "OWNER"),
          eq(organizationMembership.status, "ACTIVE"),
          ne(organization.status, "CLOSED"),
        ),
      );

    return NextResponse.json({
      tier: plan.tier,
      orgLimit: plan.orgLimit,
      ownedCount,
      endsAt: plan.endsAt,
      source: plan.source,
      plans: OWNER_ORG_PLAN_LIST,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }

    console.error("Owner subscription status error:", error);
    return NextResponse.json({ error: "Failed to fetch owner subscription" }, { status: 500 });
  }
}
