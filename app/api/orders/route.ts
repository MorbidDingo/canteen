import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { order, orderItem, menuItem } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

const orderItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().positive(),
  instructions: z.string().optional(),
});

const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, "Order must have at least one item"),
  paymentMethod: z.enum(["CASH", "UPI", "ONLINE"]).default("CASH"),
});

// POST — create a new order
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createOrderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid order data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { items: orderItems, paymentMethod } = parsed.data;

    // Fetch current menu prices to prevent tampering
    const menuItemIds = orderItems.map((i) => i.menuItemId);
    const menuItems = await db
      .select()
      .from(menuItem)
      .where(inArray(menuItem.id, menuItemIds));

    // Validate all items exist and are available
    const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));
    for (const item of orderItems) {
      const mi = menuItemMap.get(item.menuItemId);
      if (!mi) {
        return NextResponse.json(
          { error: `Menu item ${item.menuItemId} not found` },
          { status: 400 }
        );
      }
      if (!mi.available) {
        return NextResponse.json(
          { error: `${mi.name} is currently unavailable` },
          { status: 400 }
        );
      }
    }

    // Calculate total from server-side prices
    const totalAmount = orderItems.reduce((sum, item) => {
      const mi = menuItemMap.get(item.menuItemId)!;
      return sum + mi.price * item.quantity;
    }, 0);

    // Create order and items in a transaction
    const newOrder = await db.transaction(async (tx) => {
      const [createdOrder] = await tx
        .insert(order)
        .values({
          userId: session.user.id,
          totalAmount,
          paymentMethod,
          status: "PLACED",
          paymentStatus: "UNPAID",
        })
        .returning();

      const itemsToInsert = orderItems.map((item) => ({
        orderId: createdOrder.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: menuItemMap.get(item.menuItemId)!.price,
        instructions: item.instructions || null,
      }));

      await tx.insert(orderItem).values(itemsToInsert);

      return createdOrder;
    });

    return NextResponse.json({ order: newOrder }, { status: 201 });
  } catch (error) {
    console.error("Order creation error:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}

// GET — list current user's orders
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orders = await db.query.order.findMany({
      where: eq(order.userId, session.user.id),
      orderBy: [desc(order.createdAt)],
      with: {
        items: {
          with: {
            menuItem: true,
          },
        },
      },
    });

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Order fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
