import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { order } from "@/lib/db/schema";
import { and, gte, lt, sql } from "drizzle-orm";

// GET — today's order summary for admin dashboard
export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const orders = await db
      .select()
      .from(order)
      .where(
        and(
          gte(order.createdAt, todayStart),
          lt(order.createdAt, todayEnd)
        )
      );

    const totalOrders = orders.length;
    const totalRevenue = orders
      .filter((o) => o.status !== "CANCELLED")
      .reduce((sum, o) => sum + o.totalAmount, 0);

    const byStatus = {
      PLACED: orders.filter((o) => o.status === "PLACED").length,
      PREPARING: orders.filter((o) => o.status === "PREPARING").length,
      SERVED: orders.filter((o) => o.status === "SERVED").length,
      CANCELLED: orders.filter((o) => o.status === "CANCELLED").length,
    };

    const paidCount = orders.filter(
      (o) => o.paymentStatus === "PAID" && o.status !== "CANCELLED"
    ).length;
    const unpaidCount = orders.filter(
      (o) => o.paymentStatus === "UNPAID" && o.status !== "CANCELLED"
    ).length;

    const paidAmount = orders
      .filter((o) => o.paymentStatus === "PAID" && o.status !== "CANCELLED")
      .reduce((sum, o) => sum + o.totalAmount, 0);
    const unpaidAmount = orders
      .filter((o) => o.paymentStatus === "UNPAID" && o.status !== "CANCELLED")
      .reduce((sum, o) => sum + o.totalAmount, 0);

    return NextResponse.json({
      summary: {
        totalOrders,
        totalRevenue,
        byStatus,
        payment: {
          paidCount,
          unpaidCount,
          paidAmount,
          unpaidAmount,
        },
      },
    });
  } catch (error) {
    console.error("Admin summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch summary" },
      { status: 500 }
    );
  }
}
