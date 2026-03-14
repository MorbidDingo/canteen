import { NextResponse } from "next/server";
import { and, eq, gte, lte, or, isNull, ne, desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { child, menuItem, preOrder, preOrderItem, user } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const today = todayISODate();

    const rows = await db
      .select({
        id: preOrder.id,
        mode: preOrder.mode,
        status: preOrder.status,
        scheduledDate: preOrder.scheduledDate,
        subscriptionUntil: preOrder.subscriptionUntil,
        lastFulfilledDate: preOrder.lastFulfilledDate,
        createdAt: preOrder.createdAt,
        childId: preOrder.childId,
        childName: child.name,
        parentName: user.name,
        parentEmail: user.email,
      })
      .from(preOrder)
      .innerJoin(child, eq(child.id, preOrder.childId))
      .innerJoin(user, eq(user.id, preOrder.parentId))
      .where(
        and(
          eq(preOrder.status, "PENDING"),
          or(
            and(eq(preOrder.mode, "ONE_DAY"), eq(preOrder.scheduledDate, today)),
            and(
              eq(preOrder.mode, "SUBSCRIPTION"),
              lte(preOrder.scheduledDate, today),
              or(isNull(preOrder.subscriptionUntil), gte(preOrder.subscriptionUntil, today)),
              or(isNull(preOrder.lastFulfilledDate), ne(preOrder.lastFulfilledDate, today)),
            ),
          ),
        ),
      )
      .orderBy(desc(preOrder.createdAt));

    const ids = rows.map((r) => r.id);

    const itemRows = ids.length
      ? await db
          .select({
            preOrderId: preOrderItem.preOrderId,
            menuItemId: preOrderItem.menuItemId,
            menuItemName: menuItem.name,
            quantity: preOrderItem.quantity,
          })
          .from(preOrderItem)
          .innerJoin(menuItem, eq(menuItem.id, preOrderItem.menuItemId))
          .where(inArray(preOrderItem.preOrderId, ids))
      : [];

    const itemsByPreOrder = new Map<string, Array<{ menuItemId: string; menuItemName: string; quantity: number }>>();
    for (const row of itemRows) {
      const current = itemsByPreOrder.get(row.preOrderId) ?? [];
      current.push({ menuItemId: row.menuItemId, menuItemName: row.menuItemName, quantity: row.quantity });
      itemsByPreOrder.set(row.preOrderId, current);
    }

    const prepDemandMap = new Map<
      string,
      { menuItemId: string; menuItemName: string; quantity: number; fromOneDay: number; fromSubscription: number }
    >();

    for (const row of rows) {
      const items = itemsByPreOrder.get(row.id) ?? [];
      for (const item of items) {
        const key = item.menuItemId;
        const existing = prepDemandMap.get(key) ?? {
          menuItemId: item.menuItemId,
          menuItemName: item.menuItemName,
          quantity: 0,
          fromOneDay: 0,
          fromSubscription: 0,
        };

        existing.quantity += item.quantity;
        if (row.mode === "SUBSCRIPTION") {
          existing.fromSubscription += item.quantity;
        } else {
          existing.fromOneDay += item.quantity;
        }

        prepDemandMap.set(key, existing);
      }
    }

    const oneDay = rows
      .filter((r) => r.mode === "ONE_DAY")
      .map((r) => ({
        ...r,
        items: itemsByPreOrder.get(r.id) ?? [],
      }));

    const subscriptions = rows
      .filter((r) => r.mode === "SUBSCRIPTION")
      .map((r) => ({
        ...r,
        items: itemsByPreOrder.get(r.id) ?? [],
      }));

    const prepDemand = Array.from(prepDemandMap.values()).sort((a, b) => b.quantity - a.quantity);

    return NextResponse.json({
      oneDay,
      subscriptions,
      prepDemand,
      summary: {
        oneDayCount: oneDay.length,
        subscriptionCount: subscriptions.length,
        totalPlannedItems: prepDemand.reduce((sum, item) => sum + item.quantity, 0),
      },
    });
  } catch (error) {
    console.error("Admin pre-orders fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch pre-orders" }, { status: 500 });
  }
}
