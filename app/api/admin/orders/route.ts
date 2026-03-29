import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { order } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

// GET — list all orders (admin)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const canteenId = searchParams.get("canteenId");

    const conditions = [];
    if (status) conditions.push(eq(order.status, status as "PLACED" | "PREPARING" | "SERVED" | "CANCELLED"));
    if (canteenId) conditions.push(eq(order.canteenId, canteenId));

    const orders = await db.query.order.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(order.createdAt)],
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            phone: true,
            childName: true,
            childGrNumber: true,
          },
        },
        items: {
          with: {
            menuItem: true,
          },
        },
      },
    });

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Admin fetch orders error:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
