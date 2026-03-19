import { db } from "@/lib/db";
import { menuItem, discount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeImageUrl } from "@/lib/image-url";

function applyDiscount(price: number, type: string, value: number): number {
  if (type === "PERCENTAGE") return Math.round((price * (1 - value / 100)) * 100) / 100;
  return Math.max(0, Math.round((price - value) * 100) / 100);
}

export async function GET(request: NextRequest) {
  try {
    const organizationId =
      request.headers.get("x-organization-id")?.trim() ||
      request.headers.get("x-org-id")?.trim() ||
      request.cookies.get("activeOrganizationId")?.value?.trim();

    if (!organizationId) {
      return NextResponse.json({ error: "Organization context is required" }, { status: 400 });
    }

    const items = await db
      .select()
      .from(menuItem)
      .where(and(eq(menuItem.available, true), eq(menuItem.organizationId, organizationId)));

    // Fetch active discounts
    const activeDiscounts = await db
      .select()
      .from(discount)
      .where(eq(discount.active, true));

    const discountMap = new Map(
      activeDiscounts.map((d) => [d.menuItemId, d])
    );

    const now = new Date();
    const enriched = items.map((item) => {
      const d = discountMap.get(item.id);
      let discountedPrice = null;
      let discountInfo = null;
      if (
        d &&
        (!d.startDate || d.startDate <= now) &&
        (!d.endDate || d.endDate >= now)
      ) {
        discountedPrice = applyDiscount(item.price, d.type, d.value);
        discountInfo = { type: d.type, value: d.value, mode: d.mode };
      }
      return { ...item, imageUrl: sanitizeImageUrl(item.imageUrl), discountedPrice, discountInfo };
    });

    return NextResponse.json({ items: enriched });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch menu items" },
      { status: 500 },
    );
  }
}
