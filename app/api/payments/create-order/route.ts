import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { child, order } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { getRazorpayForOrganization, getRazorpayPublicKeyForOrganization } from "@/lib/razorpay";

const createPaymentSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
});

// POST — create a Razorpay order for an existing app order
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { orderId } = parsed.data;

    // Fetch the order and verify ownership
    const existingOrder = await db.query.order.findFirst({
      where: eq(order.id, orderId),
    });

    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (existingOrder.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (existingOrder.paymentStatus === "PAID") {
      return NextResponse.json(
        { error: "Order is already paid" },
        { status: 400 }
      );
    }

    // Amount in paise (smallest currency unit) — Razorpay expects integer paise
    const amountInPaise = Math.round(existingOrder.totalAmount * 100);

    let organizationId: string | null = null;
    if (existingOrder.childId) {
      const [childRow] = await db
        .select({ organizationId: child.organizationId })
        .from(child)
        .where(eq(child.id, existingOrder.childId))
        .limit(1);
      organizationId = childRow?.organizationId ?? null;
    }

    const razorpay = await getRazorpayForOrganization(organizationId);
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: orderId,
      notes: {
        orderId,
        userId: session.user.id,
      },
    });

    // Save the Razorpay order ID to our order
    await db
      .update(order)
      .set({
        razorpayOrderId: razorpayOrder.id,
        paymentMethod: "ONLINE",
        updatedAt: new Date(),
      })
      .where(eq(order.id, orderId));

    return NextResponse.json({
      razorpayOrderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: "INR",
      keyId: await getRazorpayPublicKeyForOrganization(organizationId),
    });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    return NextResponse.json(
      { error: "Failed to create payment order" },
      { status: 500 }
    );
  }
}
