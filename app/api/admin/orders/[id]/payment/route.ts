import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { order } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const paymentSchema = z.object({
  paymentStatus: z.enum(["PAID", "UNPAID"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = paymentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payment status", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [existingOrder] = await db
      .select()
      .from(order)
      .where(eq(order.id, id));

    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const [updatedOrder] = await db
      .update(order)
      .set({
        paymentStatus: parsed.data.paymentStatus,
        updatedAt: new Date(),
      })
      .where(eq(order.id, id))
      .returning();

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    console.error("Update payment status error:", error);
    return NextResponse.json(
      { error: "Failed to update payment status" },
      { status: 500 }
    );
  }
}
