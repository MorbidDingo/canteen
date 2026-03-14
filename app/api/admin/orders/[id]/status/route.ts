import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { order, orderItem, wallet, walletTransaction } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { incrementUnits } from "@/lib/units";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";

const VALID_TRANSITIONS: Record<string, string[]> = {
  PLACED: ["PREPARING", "CANCELLED"],
  PREPARING: ["SERVED"],
  SERVED: [],
  CANCELLED: [],
};

const statusSchema = z.object({
  status: z.enum(["PLACED", "PREPARING", "SERVED", "CANCELLED"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = statusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid status", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const newStatus = parsed.data.status;

    // Fetch the order
    const [existingOrder] = await db
      .select()
      .from(order)
      .where(eq(order.id, id));

    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Validate state transition
    const allowedTransitions = VALID_TRANSITIONS[existingOrder.status] || [];
    if (!allowedTransitions.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Cannot transition from "${existingOrder.status}" to "${newStatus}". Allowed: ${allowedTransitions.join(", ") || "none"}`,
        },
        { status: 400 }
      );
    }

    // If cancelling a PAID order, refund wallet + restore stock
    if (newStatus === "CANCELLED" && existingOrder.paymentStatus === "PAID") {
      const items = await db
        .select({ menuItemId: orderItem.menuItemId, quantity: orderItem.quantity })
        .from(orderItem)
        .where(eq(orderItem.orderId, id));

      await db.transaction(async (tx) => {
        // Refund to wallet if order has a childId
        if (existingOrder.childId) {
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
        }

        // Restore stock
        if (items.length > 0) {
          await incrementUnits(items, tx);
        }

        await tx
          .update(order)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(order.id, id));
      });

      broadcast("menu-updated");
    } else {
      await db
        .update(order)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(order.id, id));
    }

    const [updatedOrder] = await db
      .select()
      .from(order)
      .where(eq(order.id, id));

    const session = await getSession();
    if (session?.user) {
      logAudit({
        userId: session.user.id,
        userRole: session.user.role,
        action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
        details: { orderId: id, from: existingOrder.status, to: newStatus },
        request,
      });
    }

    broadcast("orders-updated");

    // Notify parent in real-time when order status changes
    if (updatedOrder.childId) {
      const statusLabels: Record<string, string> = {
        PREPARING: "being prepared",
        SERVED: "served",
        CANCELLED: "cancelled",
      };
      const statusTypes: Record<string, "KIOSK_ORDER_PREPARING" | "KIOSK_ORDER_SERVED" | "KIOSK_ORDER_CANCELLED"> = {
        PREPARING: "KIOSK_ORDER_PREPARING",
        SERVED: "KIOSK_ORDER_SERVED",
        CANCELLED: "KIOSK_ORDER_CANCELLED",
      };
      const label = statusLabels[newStatus];
      const type = statusTypes[newStatus];
      if (label && type) {
        notifyParentForChild({
          childId: updatedOrder.childId,
          type,
          title: `Order ${label}`,
          message: `Order #${updatedOrder.tokenCode || updatedOrder.id.slice(0, 6)} is now ${label}.`,
          metadata: { orderId: id, status: newStatus },
        }).catch(() => {});
      }
    }

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    console.error("Update order status error:", error);
    return NextResponse.json(
      { error: "Failed to update order status" },
      { status: 500 }
    );
  }
}
