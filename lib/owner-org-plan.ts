import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationOwnerSubscription } from "@/lib/db/schema";
import { OWNER_ORG_PLANS, type OwnerOrgPlan } from "@/lib/constants";

export type ResolvedOwnerPlan = {
  tier: OwnerOrgPlan;
  orgLimit: number;
  price: number;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  endsAt: Date | null;
  source: "DEFAULT" | "SUBSCRIPTION";
};

export async function resolveOwnerPlan(userId: string): Promise<ResolvedOwnerPlan> {
  const now = new Date();
  const [activeSubscription] = await db
    .select({
      tier: organizationOwnerSubscription.tier,
      orgLimit: organizationOwnerSubscription.orgLimit,
      amount: organizationOwnerSubscription.amount,
      status: organizationOwnerSubscription.status,
      endsAt: organizationOwnerSubscription.endsAt,
    })
    .from(organizationOwnerSubscription)
    .where(
      and(
        eq(organizationOwnerSubscription.ownerUserId, userId),
        eq(organizationOwnerSubscription.status, "ACTIVE"),
        gte(organizationOwnerSubscription.endsAt, now),
      ),
    )
    .orderBy(desc(organizationOwnerSubscription.endsAt))
    .limit(1);

  if (!activeSubscription) {
    return {
      tier: "BASIC",
      orgLimit: OWNER_ORG_PLANS.BASIC.orgLimit,
      price: OWNER_ORG_PLANS.BASIC.price,
      status: "ACTIVE",
      endsAt: null,
      source: "DEFAULT",
    };
  }

  const tier = (activeSubscription.tier ?? "BASIC") as OwnerOrgPlan;

  return {
    tier,
    orgLimit: activeSubscription.orgLimit ?? OWNER_ORG_PLANS[tier].orgLimit,
    price: activeSubscription.amount ?? OWNER_ORG_PLANS[tier].price,
    status: activeSubscription.status,
    endsAt: activeSubscription.endsAt,
    source: "SUBSCRIPTION",
  };
}
