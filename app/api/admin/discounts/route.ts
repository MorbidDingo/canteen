import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { discount, menuItem } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

// GET — list all discounts with menu item info
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGEMENT")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const discounts = await db
      .select({
        id: discount.id,
        menuItemId: discount.menuItemId,
        menuItemName: menuItem.name,
        menuItemPrice: menuItem.price,
        menuItemCategory: menuItem.category,
        type: discount.type,
        value: discount.value,
        reason: discount.reason,
        mode: discount.mode,
        active: discount.active,
        startDate: discount.startDate,
        endDate: discount.endDate,
        createdAt: discount.createdAt,
      })
      .from(discount)
      .innerJoin(menuItem, eq(discount.menuItemId, menuItem.id))
      .orderBy(desc(discount.createdAt));

    return NextResponse.json({ discounts });
  } catch (error) {
    console.error("Fetch discounts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch discounts" },
      { status: 500 }
    );
  }
}

const createDiscountSchema = z.object({
  menuItemId: z.string().min(1),
  type: z.enum(["PERCENTAGE", "FLAT"]),
  value: z.number().positive(),
  reason: z.string().optional(),
  mode: z.enum(["AUTO", "MANUAL"]).default("MANUAL"),
  active: z.boolean().default(false),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// POST — create a new discount
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createDiscountSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Validate item exists
    const [item] = await db
      .select()
      .from(menuItem)
      .where(eq(menuItem.id, data.menuItemId))
      .limit(1);

    if (!item) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }

    // Validate PERCENTAGE is <= 100
    if (data.type === "PERCENTAGE" && data.value > 100) {
      return NextResponse.json(
        { error: "Percentage discount cannot exceed 100%" },
        { status: 400 }
      );
    }

    // Validate FLAT is <= price
    if (data.type === "FLAT" && data.value > item.price) {
      return NextResponse.json(
        { error: "Flat discount cannot exceed item price" },
        { status: 400 }
      );
    }

    // For AUTO mode, immediately activate
    const isActive = data.mode === "AUTO" ? true : data.active;

    const [created] = await db
      .insert(discount)
      .values({
        menuItemId: data.menuItemId,
        type: data.type,
        value: data.value,
        reason: data.reason || null,
        mode: data.mode,
        active: isActive,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      })
      .returning();

    return NextResponse.json({ discount: created }, { status: 201 });
  } catch (error) {
    console.error("Create discount error:", error);
    return NextResponse.json(
      { error: "Failed to create discount" },
      { status: 500 }
    );
  }
}
