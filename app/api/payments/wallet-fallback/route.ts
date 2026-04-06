import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { order, orderItem, wallet, walletTransaction, child, certeSubscription } from "@/lib/db/schema";
import { eq, and, gte, inArray, asc } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { decrementUnits } from "@/lib/units";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";
import { CERTE_PLUS } from "@/lib/constants";
import { createSettlementLedgerEntryForOrder } from "@/lib/settlement-ledger";

const fallbackSchema = z.object({
  orderId: z.string().min(1),
  childId: z.string().min(1),
});

/**
 * POST /api/payments/wallet-fallback
 * Called when Razorpay payment fails/cancelled.
 * Attempts to pay the existing UNPAID order using the child's wallet.
 * If insufficient balance, cancels the order.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = fallbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const { orderId, childId } = parsed.data;

    // Fetch order and verify ownership
    const [existingOrder] = await db
      .select()
      .from(order)
      .where(eq(order.id, orderId))
      .limit(1);

    if (!existingOrder || existingOrder.userId !== session.user.id) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (existingOrder.paymentStatus === "PAID") {
      return NextResponse.json({ error: "Order already paid" }, { status: 400 });
    }

    if (existingOrder.status === "CANCELLED") {
      return NextResponse.json({ error: "Order already cancelled" }, { status: 400 });
    }

    const payableAmount = Math.round((existingOrder.totalAmount + (existingOrder.platformFee ?? 0)) * 100) / 100;

    // Verify child belongs to this parent
    const [childRow] = await db
      .select()
      .from(child)
      .where(and(eq(child.id, childId), eq(child.parentId, session.user.id)))
      .limit(1);

    if (!childRow) {
      // No valid child — cancel the order
      await db
        .update(order)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(eq(order.id, orderId));
      broadcast("orders-updated");
      notifyParentForChild({
        childId: childId,
        type: "KIOSK_ORDER_CANCELLED",
        title: "Order cancelled",
        message: `Order #${existingOrder.tokenCode || existingOrder.id.slice(0, 6)} was cancelled — child account not found for this payment.`,
        metadata: { orderId, reason: "child_not_found" },
      }).catch(() => {});
      return NextResponse.json({ fallback: "cancelled", reason: "Child not found" });
    }

    const siblingRows = await db
      .select({ id: child.id })
      .from(child)
      .where(eq(child.parentId, session.user.id));
    const siblingIds = siblingRows.map((s) => s.id);

    // Get shared family wallet
    const [walletRow] = await db
      .select()
      .from(wallet)
      .where(inArray(wallet.childId, siblingIds))
      .orderBy(asc(wallet.createdAt))
      .limit(1);

    if (!walletRow || walletRow.balance < payableAmount) {
      // Check for Certe+ overdraft before cancelling
      let overdraftAllowance = 0;
      if (walletRow) {
        const now = new Date();
        const [activeSub] = await db
          .select({ id: certeSubscription.id, walletOverdraftUsed: certeSubscription.walletOverdraftUsed })
          .from(certeSubscription)
          .where(
            and(
              eq(certeSubscription.parentId, session.user.id),
              eq(certeSubscription.status, "ACTIVE"),
              gte(certeSubscription.endDate, now),
            ),
          )
          .limit(1);

        if (activeSub) {
          overdraftAllowance = Math.max(0, CERTE_PLUS.WALLET_OVERDRAFT_LIMIT - activeSub.walletOverdraftUsed);
        }
      }

      if (!walletRow || walletRow.balance + overdraftAllowance < payableAmount) {
        // Insufficient balance — cancel the order
        await db
          .update(order)
          .set({ status: "CANCELLED", updatedAt: new Date() })
          .where(eq(order.id, orderId));
        broadcast("orders-updated");
        const reason = walletRow
          ? `Insufficient wallet balance (₹${walletRow.balance.toFixed(2)}${overdraftAllowance > 0 ? ` +₹${overdraftAllowance.toFixed(2)} overdraft` : ""} available, ₹${payableAmount.toFixed(2)} needed)`
          : "No wallet found";
        notifyParentForChild({
          childId,
          type: "KIOSK_ORDER_CANCELLED",
          title: "Order cancelled",
          message: `Order #${existingOrder.tokenCode || existingOrder.id.slice(0, 6)} was cancelled — ${reason.toLowerCase()}.`,
          metadata: { orderId, reason: "insufficient_balance" },
        }).catch(() => {});
        return NextResponse.json({ fallback: "cancelled", reason });
      }
    }

    // Wallet has enough — pay and decrement units in a transaction
    const items = await db
      .select({ menuItemId: orderItem.menuItemId, quantity: orderItem.quantity })
      .from(orderItem)
      .where(eq(orderItem.orderId, orderId));

    await db.transaction(async (tx) => {
      const newBalance = walletRow.balance - payableAmount;

      // Debit wallet
      await tx
        .update(wallet)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(inArray(wallet.childId, siblingIds));

      // Record transaction
      await tx.insert(walletTransaction).values({
        walletId: walletRow.id,
        type: "DEBIT",
        amount: payableAmount,
        balanceAfter: newBalance,
        description: `Order #${existingOrder.tokenCode || existingOrder.id.slice(0, 6)} (wallet fallback)`,
        orderId,
      });

      // Mark order as paid via wallet
      await tx
        .update(order)
        .set({
          paymentStatus: "PAID",
          paymentMethod: "WALLET",
          childId,
          updatedAt: new Date(),
        })
        .where(eq(order.id, orderId));

      // Decrement available units
      if (items.length > 0) {
        await decrementUnits(items, tx);
      }
    });

    broadcast("orders-updated");
    broadcast("menu-updated");

    await createSettlementLedgerEntryForOrder({
      orderId,
      entryType: "DEBIT",
    });

    notifyParentForChild({
      childId,
      type: "KIOSK_ORDER_GIVEN",
      title: "Wallet payment confirmed",
      message: `₹${payableAmount.toFixed(2)} was charged from wallet for order #${existingOrder.tokenCode || existingOrder.id.slice(0, 6)} (payment fallback).`,
      metadata: { orderId, paymentMethod: "WALLET_FALLBACK" },
    }).catch(() => {});

    return NextResponse.json({ fallback: "paid", method: "WALLET" });
  } catch (error) {
    console.error("Wallet fallback error:", error);
    return NextResponse.json({ error: "Wallet fallback failed" }, { status: 500 });
  }
}
