import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, certeSubscription } from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { getUserFoodHistory } from "@/lib/ml/data-collector";

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
    .select({ id: child.id })
    .from(child)
    .where(eq(child.parentId, userId));

  if (children.length === 0) {
    return NextResponse.json({ frequent: [] });
  }

  // Aggregate order history across all children (last 30 days)
  const allHistory = await Promise.all(
    children.map((c) => getUserFoodHistory(c.id, orgId, 30)),
  );

  // Count frequency per menu item
  const freq = new Map<string, { name: string; category: string; price: number; count: number }>();
  for (const history of allHistory) {
    for (const item of history) {
      const existing = freq.get(item.menuItemId);
      if (existing) {
        existing.count += item.quantity;
      } else {
        freq.set(item.menuItemId, {
          name: item.name,
          category: item.category,
          price: item.price,
          count: item.quantity,
        });
      }
    }
  }

  // Sort by frequency
  const sorted = Array.from(freq.entries())
    .map(([menuItemId, data]) => ({ menuItemId, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return NextResponse.json({ frequent: sorted });
}
