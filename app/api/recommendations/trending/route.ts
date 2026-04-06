import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certeSubscription } from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { getMenuPopularity } from "@/lib/ml/data-collector";

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

  // Org-wide popularity over last 7 days
  const popular = await getMenuPopularity(orgId, 7);

  const trending = popular
    .sort((a, b) => b.totalOrdered - a.totalOrdered)
    .slice(0, 10)
    .map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      category: item.category,
      price: item.price,
      totalOrdered: item.totalOrdered,
      uniqueBuyers: item.uniqueBuyers,
    }));

  return NextResponse.json({ trending });
}
