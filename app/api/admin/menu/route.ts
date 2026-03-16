import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { menuItem, discount } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { sanitizeImageUrl } from "@/lib/image-url";

// GET — list all menu items (including unavailable ones for admin)
export async function GET() {
  try {
    const items = await db
      .select()
      .from(menuItem)
      .orderBy(desc(menuItem.createdAt));

    // Join active discounts
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
        const applied =
          d.type === "PERCENTAGE"
            ? Math.round(item.price * (1 - d.value / 100) * 100) / 100
            : Math.max(0, Math.round((item.price - d.value) * 100) / 100);
        discountedPrice = applied;
        discountInfo = { id: d.id, type: d.type, value: d.value, mode: d.mode };
      }
      return { ...item, imageUrl: sanitizeImageUrl(item.imageUrl), discountedPrice, discountInfo };
    });

    return NextResponse.json({ items: enriched });
  } catch (error) {
    console.error("Admin fetch menu error:", error);
    return NextResponse.json(
      { error: "Failed to fetch menu items" },
      { status: 500 }
    );
  }
}

const createMenuItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  price: z.number().positive("Price must be positive"),
  category: z.enum(["SNACKS", "MEALS", "DRINKS", "PACKED_FOOD"]),
  imageUrl: z.string().optional().or(z.literal("")),
  available: z.boolean().default(true),
  availableUnits: z.number().int().min(0).nullable().optional(),
  subscribable: z.boolean().default(true),
});

// POST — create a new menu item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createMenuItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const [created] = await db
      .insert(menuItem)
      .values({
        name: data.name,
        description: data.description || null,
        price: data.price,
        category: data.category,
        imageUrl: data.imageUrl || null,
        available: data.available,
        availableUnits: data.availableUnits ?? null,
        subscribable: data.subscribable,
      })
      .returning();

    const session = await getSession();
    if (session?.user) {
      logAudit({
        userId: session.user.id,
        userRole: session.user.role,
        action: AUDIT_ACTIONS.MENU_ITEM_CREATED,
        details: { menuItemId: created.id, name: data.name, price: data.price, category: data.category },
        request,
      });
    }

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error) {
    console.error("Create menu item error:", error);
    return NextResponse.json(
      { error: "Failed to create menu item" },
      { status: 500 }
    );
  }
}
