import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, certeSubscription, wallet } from "@/lib/db/schema";
import { eq, and, gte, inArray, asc } from "drizzle-orm";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { getRecommendations } from "@/lib/ml/recommendation-engine";
import { getUserSpendingProfile } from "@/lib/ml/data-collector";

export async function GET() {
  let access;
  try {
    access = await requireLinkedAccount();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const session = access.session;
  const userId = session.user.id;
  const orgId = access.activeOrganizationId!;

  // Certe+ gate
  const [activeSub] = await db
    .select({ id: certeSubscription.id })
    .from(certeSubscription)
    .where(
      and(
        eq(certeSubscription.parentId, userId),
        eq(certeSubscription.status, "ACTIVE"),
        gte(certeSubscription.endDate, new Date()),
      ),
    )
    .limit(1);

  if (!activeSub) {
    return NextResponse.json(
      { error: "Certe+ subscription required", code: "SUBSCRIPTION_REQUIRED" },
      { status: 403 },
    );
  }

  const children = await db
    .select({ id: child.id, className: child.className })
    .from(child)
    .where(eq(child.parentId, userId));

  if (children.length === 0) {
    return NextResponse.json({ recommendations: [] });
  }

  const childIds = children.map((c) => c.id);

  // Get family wallet balance
  const [familyWallet] = await db
    .select({ balance: wallet.balance })
    .from(wallet)
    .where(inArray(wallet.childId, childIds))
    .orderBy(asc(wallet.createdAt))
    .limit(1);

  const balance = familyWallet?.balance ?? 0;

  // Get today's spending to calculate remaining budget
  const firstChild = children[0];
  const profile = await getUserSpendingProfile(firstChild.id, orgId, 1);
  const spentToday = profile.dailySpending[0]?.amount ?? 0;
  const budgetRemaining = Math.max(0, balance - spentToday);

  // Get budget-aware recommendations
  const recs = await getRecommendations(firstChild.id, orgId, {
    className: firstChild.className,
    maxResults: 10,
    budgetRemaining,
  });

  return NextResponse.json({
    recommendations: recs,
    walletBalance: balance,
    spentToday,
    budgetRemaining,
  });
}
