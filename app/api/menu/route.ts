import { db } from "@/lib/db";
import { menuItem, discount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { NextResponse } from "next/server";

function applyDiscount(price: number, type: string, value: number): number {
  if (type === "PERCENTAGE") return Math.round((price * (1 - value / 100)) * 100) / 100;
  return Math.max(0, Math.round((price - value) * 100) / 100);
}

export async function GET() {
  try {
    const items = await db
      .select()
      .from(menuItem)
      .where(eq(menuItem.available, true));

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
      return { ...item, discountedPrice, discountInfo };
    });

    return NextResponse.json({ items: enriched });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch menu items" },
      { status: 500 },
    );
  }
}
