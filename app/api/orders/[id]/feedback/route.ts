import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { order, orderFeedback } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

const feedbackSchema = z.object({
  healthyRating: z.number().int().min(1).max(5),
  tasteRating: z.number().int().min(1).max(5),
  quantityRating: z.number().int().min(1).max(5),
  overallReview: z.string().max(500).optional(),
});

/**
 * POST /api/orders/[id]/feedback
 * Submit feedback for a served order.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid feedback", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Verify order exists, belongs to user, and is SERVED
    const [existingOrder] = await db
      .select({ id: order.id, userId: order.userId, status: order.status })
      .from(order)
      .where(eq(order.id, id))
      .limit(1);

    if (!existingOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (existingOrder.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existingOrder.status !== "SERVED") {
      return NextResponse.json(
        { error: "Feedback can only be given for served orders" },
        { status: 400 },
      );
    }

    // Check if feedback already exists
    const [existing] = await db
      .select({ id: orderFeedback.id })
      .from(orderFeedback)
      .where(eq(orderFeedback.orderId, id))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "Feedback already submitted for this order" },
        { status: 409 },
      );
    }

    const [created] = await db
      .insert(orderFeedback)
      .values({
        orderId: id,
        userId: session.user.id,
        healthyRating: parsed.data.healthyRating,
        tasteRating: parsed.data.tasteRating,
        quantityRating: parsed.data.quantityRating,
        overallReview: parsed.data.overallReview || null,
      })
      .returning({ id: orderFeedback.id });

    return NextResponse.json({ success: true, feedbackId: created.id });
  } catch (error) {
    console.error("Submit feedback error:", error);
    return NextResponse.json(
      { error: "Failed to submit feedback" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/orders/[id]/feedback
 * Get feedback for a specific order.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [feedback] = await db
      .select()
      .from(orderFeedback)
      .where(eq(orderFeedback.orderId, id))
      .limit(1);

    if (!feedback) {
      return NextResponse.json({ feedback: null });
    }

    return NextResponse.json({
      feedback: {
        healthyRating: feedback.healthyRating,
        tasteRating: feedback.tasteRating,
        quantityRating: feedback.quantityRating,
        overallReview: feedback.overallReview,
        createdAt: feedback.createdAt,
      },
    });
  } catch (error) {
    console.error("Get feedback error:", error);
    return NextResponse.json(
      { error: "Failed to get feedback" },
      { status: 500 },
    );
  }
}
