import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { order } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Fetch the order (must belong to the current user)
    const [existingOrder] = await db
      .select()
      .from(order)
      .where(and(eq(order.id, id), eq(order.userId, session.user.id)));

    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (existingOrder.status !== "PLACED") {
      return NextResponse.json(
        {
          error: `Cannot cancel order with status "${existingOrder.status}". Only orders with status "PLACED" can be cancelled.`,
        },
        { status: 400 }
      );
    }

    const [updatedOrder] = await db
      .update(order)
      .set({
        status: "CANCELLED",
        updatedAt: new Date(),
      })
      .where(eq(order.id, id))
      .returning();

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    console.error("Cancel order error:", error);
    return NextResponse.json(
      { error: "Failed to cancel order" },
      { status: 500 }
    );
  }
}
