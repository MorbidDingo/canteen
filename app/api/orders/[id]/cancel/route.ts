import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, order, orderItem, wallet, walletTransaction, orderCancellationReason } from "@/lib/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { incrementUnits } from "@/lib/units";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";

const VALID_CANCEL_REASONS = [
  "ORDERED_BY_MISTAKE",
  "FOUND_BETTER_OPTION",
  "CHILD_NOT_IN_SCHOOL",
  "TAKING_HOMEMADE_FOOD",
  "TOO_EXPENSIVE",
  "OTHER",
] as const;

/**
 * PATCH /api/orders/[id]/cancel
 * Parent cancels their own order (only from PLACED status).
 * If the order was PAID, refund to the child's wallet and restore stock.
 * Accepts optional { reason, otherText } in body.
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

    // Parse optional cancellation reason from body
    let reason: (typeof VALID_CANCEL_REASONS)[number] | undefined;
    let otherText: string | undefined;
    try {
      const body = await request.json();
      if (body.reason && VALID_CANCEL_REASONS.includes(body.reason)) {
        reason = body.reason;
      }
      if (body.otherText && typeof body.otherText === "string") {
        otherText = body.otherText.slice(0, 500);
      }
    } catch {
      // Body is optional — PATCH without body still works
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
        const [orderChild] = await tx
          .select({ parentId: child.parentId })
          .from(child)
          .where(eq(child.id, existingOrder.childId))
          .limit(1);
        const siblingRows = orderChild
          ? await tx
            .select({ id: child.id })
            .from(child)
            .where(eq(child.parentId, orderChild.parentId))
          : [];
        const siblingIds = siblingRows.map((s) => s.id);

        const [walletRow] = await tx
          .select()
          .from(wallet)
          .where(inArray(wallet.childId, siblingIds))
          .orderBy(asc(wallet.createdAt))
          .limit(1);

        if (walletRow) {
          const newBalance = walletRow.balance + existingOrder.totalAmount;

          await tx
            .update(wallet)
            .set({ balance: newBalance, updatedAt: new Date() })
            .where(inArray(wallet.childId, siblingIds));

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

      // Store cancellation reason if provided
      if (reason) {
        await tx.insert(orderCancellationReason).values({
          orderId: id,
          userId: session.user.id,
          reason,
          otherText: reason === "OTHER" ? (otherText || null) : null,
        });
      }
    });

    broadcast("orders-updated");
    broadcast("menu-updated");

    // Notify parent in real-time about the cancellation
    if (existingOrder.childId) {
      notifyParentForChild({
        childId: existingOrder.childId,
        type: "KIOSK_ORDER_CANCELLED",
        title: "Order cancelled",
        message: `Order #${existingOrder.tokenCode || existingOrder.id.slice(0, 6)} has been cancelled.${existingOrder.paymentStatus === "PAID" ? " A refund has been credited to the wallet." : ""}`,
        metadata: { orderId: id, refunded: existingOrder.paymentStatus === "PAID" },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cancel order error:", error);
    return NextResponse.json(
      { error: "Failed to cancel order" },
      { status: 500 }
    );
  }
}
