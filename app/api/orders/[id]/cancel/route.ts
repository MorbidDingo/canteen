import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { order, orderItem, wallet, walletTransaction } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { incrementUnits } from "@/lib/units";
import { broadcast } from "@/lib/sse";

/**
 * PATCH /api/orders/[id]/cancel
 * Parent cancels their own order (only from PLACED status).
 * If the order was PAID, refund to the child's wallet and restore stock.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [existingOrder] = await db
      .select()
      .from(order)
      .where(eq(order.id, id))
      .limit(1);

    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Only the order owner can cancel
    if (existingOrder.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only PLACED orders can be cancelled
    if (existingOrder.status !== "PLACED") {
      return NextResponse.json(
        { error: "Only orders in PLACED status can be cancelled" },
        { status: 400 }
      );
    }

    // Fetch order items for potential stock restore
    const items = await db
      .select({ menuItemId: orderItem.menuItemId, quantity: orderItem.quantity })
      .from(orderItem)
      .where(eq(orderItem.orderId, id));

    await db.transaction(async (tx) => {
      // If order was PAID, refund to wallet
      if (existingOrder.paymentStatus === "PAID" && existingOrder.childId) {
        const [walletRow] = await tx
          .select()
          .from(wallet)
          .where(eq(wallet.childId, existingOrder.childId))
          .limit(1);

        if (walletRow) {
          const newBalance = walletRow.balance + existingOrder.totalAmount;

          await tx
            .update(wallet)
            .set({ balance: newBalance, updatedAt: new Date() })
            .where(eq(wallet.id, walletRow.id));

          await tx.insert(walletTransaction).values({
            walletId: walletRow.id,
            type: "REFUND",
            amount: existingOrder.totalAmount,
            balanceAfter: newBalance,
            description: `Refund for cancelled order #${existingOrder.tokenCode || existingOrder.id.slice(0, 6)}`,
            orderId: id,
          });
        }

        // Restore stock for PAID orders
        if (items.length > 0) {
          await incrementUnits(items, tx);
        }
      }

      await tx
        .update(order)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(eq(order.id, id));
    });

    broadcast("orders-updated");
    broadcast("menu-updated");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cancel order error:", error);
    return NextResponse.json(
      { error: "Failed to cancel order" },
      { status: 500 }
    );
  }
}
