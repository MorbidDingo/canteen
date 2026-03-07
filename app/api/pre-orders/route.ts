import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { preOrder, preOrderItem, child, menuItem } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

// GET /api/pre-orders — list pre-orders for the logged-in parent
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preOrders = await db
    .select({
      id: preOrder.id,
      childId: preOrder.childId,
      childName: child.name,
      scheduledDate: preOrder.scheduledDate,
      status: preOrder.status,
      createdAt: preOrder.createdAt,
    })
    .from(preOrder)
    .innerJoin(child, eq(child.id, preOrder.childId))
    .where(eq(preOrder.parentId, session.user.id))
    .orderBy(desc(preOrder.createdAt))
    .limit(50);

  // Fetch items for each pre-order
  const result = await Promise.all(
    preOrders.map(async (po) => {
      const items = await db
        .select({
          name: menuItem.name,
          quantity: preOrderItem.quantity,
        })
        .from(preOrderItem)
        .innerJoin(menuItem, eq(menuItem.id, preOrderItem.menuItemId))
        .where(eq(preOrderItem.preOrderId, po.id));

      return { ...po, items };
    })
  );

  return NextResponse.json(result);
}
