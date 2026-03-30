import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, certeSubscription, menuItem } from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { getRecommendations } from "@/lib/ml/recommendation-engine";

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

  const firstChild = children[0];

  // Get standard recommendations
  const recs = await getRecommendations(firstChild.id, orgId, {
    className: firstChild.className,
    maxResults: 20,
  });

  // Fetch all available menu items to find healthier alternatives
  const availableItems = await db
    .select({
      id: menuItem.id,
      name: menuItem.name,
      category: menuItem.category,
      price: menuItem.price,
    })
    .from(menuItem)
    .where(
      and(
        eq(menuItem.organizationId, orgId),
        eq(menuItem.available, true),
      ),
    );

  // Prioritize MEALS category as "healthier" (whole meals over snacks/drinks)
  // and items that are already in recommendations with nutrition-related reasons
  const healthyCategories = new Set(["MEALS", "PACKED_FOOD"]);
  const nutritionRecs = recs.filter(
    (r) => healthyCategories.has(r.category) || r.reasons.some((reason) =>
      /balanced|healthy|nutritious|meal/i.test(reason),
    ),
  );

  // If not enough nutrition recs from ML, supplement with MEALS category items
  if (nutritionRecs.length < 5) {
    const recIds = new Set(nutritionRecs.map((r) => r.menuItemId));
    const supplements = availableItems
      .filter((item) => healthyCategories.has(item.category) && !recIds.has(item.id))
      .slice(0, 5 - nutritionRecs.length)
      .map((item) => ({
        menuItemId: item.id,
        name: item.name,
        category: item.category,
        price: item.price,
        score: 0.5,
        reasons: ["Complete meal option"],
        canteenId: null,
        canteenName: null,
      }));
    nutritionRecs.push(...supplements);
  }

  return NextResponse.json({
    recommendations: nutritionRecs.slice(0, 10),
  });
}
