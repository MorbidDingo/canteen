import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { order, orderItem, menuItem, wallet, walletTransaction, child, discount } from "@/lib/db/schema";
import { eq, desc, inArray, and, asc } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { validateUnits, decrementUnits } from "@/lib/units";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";

const orderItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().positive(),
  instructions: z.string().optional(),
});

const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, "Order must have at least one item"),
  paymentMethod: z.enum(["ONLINE", "WALLET"]).default("ONLINE"),
  childId: z.string().optional(), // required for WALLET payments
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

    const { items: orderItems, paymentMethod, childId } = parsed.data;

    // For WALLET payment, childId is required
    if (paymentMethod === "WALLET" && !childId) {
      return NextResponse.json(
        { error: "Please select a child for wallet payment" },
        { status: 400 }
      );
    }

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

    // Calculate total from server-side prices (with discounts)
    const activeDiscounts = await db
      .select()
      .from(discount)
      .where(eq(discount.active, true));

    const now = new Date();
    const discountMap = new Map(
      activeDiscounts
        .filter((d) => (!d.startDate || d.startDate <= now) && (!d.endDate || d.endDate >= now))
        .map((d) => [d.menuItemId, d])
    );

    const effectivePriceMap = new Map<string, number>();
    for (const mi of menuItems) {
      const d = discountMap.get(mi.id);
      if (d) {
        effectivePriceMap.set(
          mi.id,
          d.type === "PERCENTAGE"
            ? Math.round(mi.price * (1 - d.value / 100) * 100) / 100
            : Math.max(0, Math.round((mi.price - d.value) * 100) / 100)
        );
      } else {
        effectivePriceMap.set(mi.id, mi.price);
      }
    }

    const totalAmount = orderItems.reduce((sum, item) => {
      return sum + effectivePriceMap.get(item.menuItemId)! * item.quantity;
    }, 0);

    // Validate available units
    const unitError = await validateUnits(
      orderItems.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
      })),
      db,
    );
    if (unitError) {
      return NextResponse.json({ error: unitError }, { status: 400 });
    }

    // Create order and items in a transaction
    const newOrder = await db.transaction(async (tx) => {
      // If WALLET payment, verify and debit wallet
      let walletRow = null;
      if (paymentMethod === "WALLET" && childId) {
        // Verify child belongs to parent
        const children = await tx
          .select()
          .from(child)
          .where(and(eq(child.id, childId), eq(child.parentId, session.user.id)))
          .limit(1);

        if (children.length === 0) {
          throw new Error("Child not found");
        }

        const siblingChildRows = await tx
          .select({ id: child.id })
          .from(child)
          .where(eq(child.parentId, session.user.id));
        const siblingChildIds = siblingChildRows.map((c) => c.id);

        const wallets = await tx
          .select()
          .from(wallet)
          .where(inArray(wallet.childId, siblingChildIds))
          .orderBy(asc(wallet.createdAt))
          .limit(1);

        if (wallets.length === 0) {
          throw new Error("Wallet not found for this child");
        }

        walletRow = wallets[0];

        if (walletRow.balance < totalAmount) {
          throw new Error(
            `Insufficient wallet balance. Available: ₹${walletRow.balance.toFixed(2)}, Required: ₹${totalAmount.toFixed(2)}`
          );
        }
      }

      const [createdOrder] = await tx
        .insert(order)
        .values({
          userId: session.user.id,
          childId: childId || undefined,
          totalAmount,
          paymentMethod,
          status: "PLACED",
          paymentStatus: paymentMethod === "WALLET" ? "PAID" : "UNPAID",
        })
        .returning();

      const itemsToInsert = orderItems.map((item) => ({
        orderId: createdOrder.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPrice: effectivePriceMap.get(item.menuItemId)!,
        instructions: item.instructions || null,
      }));

      await tx.insert(orderItem).values(itemsToInsert);

      // Debit wallet if WALLET payment
      if (paymentMethod === "WALLET" && walletRow) {
        const newBalance = walletRow.balance - totalAmount;

        await tx
          .update(wallet)
          .set({ balance: newBalance, updatedAt: new Date() })
          .where(inArray(wallet.childId, siblingChildIds));

        await tx.insert(walletTransaction).values({
          walletId: walletRow.id,
          type: "DEBIT",
          amount: totalAmount,
          balanceAfter: newBalance,
          description: `Order #${createdOrder.tokenCode || createdOrder.id.slice(0, 6)}`,
          orderId: createdOrder.id,
        });

        // Decrement units for wallet (paid immediately)
        await decrementUnits(
          orderItems.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
          tx,
        );
      }

      return createdOrder;
    });

    // Emit SSE events
    if (paymentMethod === "WALLET") {
      broadcast("menu-updated");
    }
    broadcast("orders-updated");

    // Notify parent for wallet-paid orders (online payment notification happens in /api/payments/verify)
    if (paymentMethod === "WALLET" && childId) {
      const itemNames = orderItems
        .map((item) => {
          const mi = menuItemMap.get(item.menuItemId);
          return mi ? mi.name : "item";
        })
        .join(", ");
      notifyParentForChild({
        childId,
        type: "KIOSK_ORDER_GIVEN",
        title: "Order placed",
        message: `Order #${newOrder.tokenCode || newOrder.id.slice(0, 6)} for ₹${totalAmount} placed via wallet — ${itemNames}.`,
        metadata: { orderId: newOrder.id, paymentMethod: "WALLET", totalAmount },
      }).catch(() => {});
    }

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
