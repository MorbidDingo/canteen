import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { order } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

    const [updatedOrder] = await db
      .update(order)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(order.id, id))
      .returning();

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    console.error("Update order status error:", error);
    return NextResponse.json(
      { error: "Failed to update order status" },
      { status: 500 }
    );
  }
}
