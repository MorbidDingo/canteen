import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { order, orderItem, menuItem } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils";
import { decrementUnits } from "@/lib/units";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";

const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  orderId: z.string().min(1),
});

// POST — verify Razorpay payment signature and mark order as paid
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = verifyPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payment data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = parsed.data;

    // Verify ownership
    const existingOrder = await db.query.order.findFirst({
      where: eq(order.id, orderId),
    });

    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (existingOrder.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Verify the payment signature using Razorpay's utility
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "Payment verification not configured" },
        { status: 500 }
      );
    }

    const isValid = validatePaymentVerification(
      {
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
      },
      razorpay_signature,
      secret
    );

    if (!isValid) {
      return NextResponse.json(
        { error: "Payment verification failed. Signature mismatch." },
        { status: 400 }
      );
    }

    // Payment verified — update order
    await db
      .update(order)
      .set({
        paymentStatus: "PAID",
        paymentMethod: "ONLINE",
        razorpayPaymentId: razorpay_payment_id,
        updatedAt: new Date(),
      })
      .where(eq(order.id, orderId));

    // Decrement units for paid online order
    const items = await db
      .select({ menuItemId: orderItem.menuItemId, quantity: orderItem.quantity })
      .from(orderItem)
      .where(eq(orderItem.orderId, orderId));

    if (items.length > 0) {
      await decrementUnits(
        items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
        db as unknown as Parameters<Parameters<typeof db.transaction>[0]>[0],
      );
      broadcast("menu-updated");
    }
    broadcast("orders-updated");

    // Notify parent in real-time about successful payment
    if (existingOrder.childId) {
      notifyParentForChild({
        childId: existingOrder.childId,
        type: "KIOSK_ORDER_GIVEN",
        title: "Payment confirmed",
        message: `Online payment of ₹${existingOrder.totalAmount} for order #${existingOrder.tokenCode || existingOrder.id.slice(0, 6)} was successful.`,
        metadata: { orderId: orderId, paymentMethod: "ONLINE" },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: "Payment verified and order updated",
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    return NextResponse.json(
      { error: "Payment verification failed" },
      { status: 500 }
    );
  }
}
