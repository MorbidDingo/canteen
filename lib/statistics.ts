import { db } from "@/lib/db";
import { order, orderItem, menuItem, user, preOrder, preOrderItem } from "@/lib/db/schema";
import { gte, eq, and, lte, or, isNull, ne, inArray } from "drizzle-orm";

async function getTodayPreOrderDemand() {
  const today = new Date().toISOString().slice(0, 10);

  const activeToday = await db
    .select({ id: preOrder.id, mode: preOrder.mode })
    .from(preOrder)
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
    );

  if (activeToday.length === 0) {
    return {
      oneDayCount: 0,
      subscriptionCount: 0,
      totalPlannedItems: 0,
      demandByItem: [] as Array<{ menuItemId: string; name: string; quantity: number }>,
    };
  }

  const preOrderIds = activeToday.map((row) => row.id);
  const modeById = new Map(activeToday.map((row) => [row.id, row.mode]));

  const items = await db
    .select({
      preOrderId: preOrderItem.preOrderId,
      menuItemId: preOrderItem.menuItemId,
      quantity: preOrderItem.quantity,
      name: menuItem.name,
    })
    .from(preOrderItem)
    .innerJoin(menuItem, eq(menuItem.id, preOrderItem.menuItemId))
    .where(inArray(preOrderItem.preOrderId, preOrderIds));

  const demandMap = new Map<string, { menuItemId: string; name: string; quantity: number }>();
  for (const item of items) {
    const current = demandMap.get(item.menuItemId) ?? {
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: 0,
    };
    current.quantity += item.quantity;
    demandMap.set(item.menuItemId, current);
  }

  const oneDayCount = activeToday.filter((row) => modeById.get(row.id) === "ONE_DAY").length;
  const subscriptionCount = activeToday.filter((row) => modeById.get(row.id) === "SUBSCRIPTION").length;
  const demandByItem = Array.from(demandMap.values()).sort((a, b) => b.quantity - a.quantity);

  return {
    oneDayCount,
    subscriptionCount,
    totalPlannedItems: demandByItem.reduce((sum, row) => sum + row.quantity, 0),
    demandByItem,
  };
}

export async function getStatistics(days: number) {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);

  // ─── 1. Daily order breakdown ────────────────────────
  const allOrders = await db.select().from(order).where(gte(order.createdAt, startDate));

  const dailyMap = new Map<string, {
    date: string;
    totalOrders: number;
    totalRevenue: number;
    served: number;
    cancelled: number;
    placed: number;
    preparing: number;
    paidAmount: number;
    unpaidAmount: number;
  }>();

  for (let d = 0; d < days; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    if (date > now) break;
    const key = date.toISOString().split("T")[0];
    dailyMap.set(key, {
      date: key, totalOrders: 0, totalRevenue: 0,
      served: 0, cancelled: 0, placed: 0, preparing: 0,
      paidAmount: 0, unpaidAmount: 0,
    });
  }

  for (const o of allOrders) {
    const key = new Date(o.createdAt).toISOString().split("T")[0];
    const day = dailyMap.get(key);
    if (!day) continue;
    day.totalOrders++;
    if (o.status !== "CANCELLED") {
      day.totalRevenue += o.totalAmount;
      if (o.paymentStatus === "PAID") day.paidAmount += o.totalAmount;
      else day.unpaidAmount += o.totalAmount;
    }
    switch (o.status) {
      case "SERVED": day.served++; break;
      case "CANCELLED": day.cancelled++; break;
      case "PLACED": day.placed++; break;
      case "PREPARING": day.preparing++; break;
    }
  }

  const dailyStats = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));

  // ─── 2. Item popularity ──────────────────────────────
  const itemOrders = await db
    .select({
      menuItemId: orderItem.menuItemId,
      itemName: menuItem.name,
      itemCategory: menuItem.category,
      itemPrice: menuItem.price,
      quantity: orderItem.quantity,
      unitPrice: orderItem.unitPrice,
      orderStatus: order.status,
      orderDate: order.createdAt,
    })
    .from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
    .where(gte(order.createdAt, startDate));

  const itemMap = new Map<string, {
    id: string; name: string; category: string; currentPrice: number;
    totalQuantity: number; totalRevenue: number; orderCount: number;
    cancelledQuantity: number;
    dailyBreakdown: Map<string, { quantity: number; revenue: number }>;
  }>();

  for (const row of itemOrders) {
    if (!itemMap.has(row.menuItemId)) {
      itemMap.set(row.menuItemId, {
        id: row.menuItemId, name: row.itemName, category: row.itemCategory,
        currentPrice: row.itemPrice, totalQuantity: 0, totalRevenue: 0,
        orderCount: 0, cancelledQuantity: 0, dailyBreakdown: new Map(),
      });
    }
    const item = itemMap.get(row.menuItemId)!;
    if (row.orderStatus === "CANCELLED") {
      item.cancelledQuantity += row.quantity;
    } else {
      item.totalQuantity += row.quantity;
      item.totalRevenue += row.quantity * row.unitPrice;
      item.orderCount++;
      const dateKey = new Date(row.orderDate).toISOString().split("T")[0];
      if (!item.dailyBreakdown.has(dateKey)) {
        item.dailyBreakdown.set(dateKey, { quantity: 0, revenue: 0 });
      }
      const dayData = item.dailyBreakdown.get(dateKey)!;
      dayData.quantity += row.quantity;
      dayData.revenue += row.quantity * row.unitPrice;
    }
  }

  const itemStats = Array.from(itemMap.values())
    .map((item) => {
      const daysWithOrders = item.dailyBreakdown.size;
      const avgDailyQuantity = daysWithOrders > 0 ? item.totalQuantity / daysWithOrders : 0;
      const last7 = [];
      for (let d = 6; d >= 0; d--) {
        const date = new Date(now);
        date.setDate(date.getDate() - d);
        const key = date.toISOString().split("T")[0];
        const dayData = item.dailyBreakdown.get(key);
        last7.push({ date: key, quantity: dayData?.quantity || 0, revenue: dayData?.revenue || 0 });
      }
      return {
        id: item.id, name: item.name, category: item.category,
        currentPrice: item.currentPrice,
        totalQuantity: item.totalQuantity,
        totalRevenue: Math.round(item.totalRevenue * 100) / 100,
        orderCount: item.orderCount,
        cancelledQuantity: item.cancelledQuantity,
        avgDailyQuantity: Math.round(avgDailyQuantity * 10) / 10,
        last7Days: last7,
      };
    })
    .sort((a, b) => b.totalQuantity - a.totalQuantity);

  // ─── 3. Overall summary ──────────────────────────────
  const activeOrders = allOrders.filter((o) => o.status !== "CANCELLED");
  const preOrderDemand = await getTodayPreOrderDemand();

  const overallSummary = {
    totalOrders: allOrders.length,
    totalRevenue: Math.round(activeOrders.reduce((s, o) => s + o.totalAmount, 0) * 100) / 100,
    avgOrderValue: activeOrders.length > 0
      ? Math.round((activeOrders.reduce((s, o) => s + o.totalAmount, 0) / activeOrders.length) * 100) / 100
      : 0,
    servedOrders: allOrders.filter((o) => o.status === "SERVED").length,
    cancelledOrders: allOrders.filter((o) => o.status === "CANCELLED").length,
    paidTotal: Math.round(activeOrders.filter((o) => o.paymentStatus === "PAID").reduce((s, o) => s + o.totalAmount, 0) * 100) / 100,
    unpaidTotal: Math.round(activeOrders.filter((o) => o.paymentStatus === "UNPAID").reduce((s, o) => s + o.totalAmount, 0) * 100) / 100,
    oneDayPreOrdersToday: preOrderDemand.oneDayCount,
    subscriptionsToday: preOrderDemand.subscriptionCount,
    plannedPrepItemsToday: preOrderDemand.totalPlannedItems,
    days,
  };

  // ─── 4. Top parents ──────────────────────────────────
  const parentMap = new Map<string, { userId: string; orderCount: number; totalSpent: number }>();
  for (const o of activeOrders) {
    if (!parentMap.has(o.userId)) {
      parentMap.set(o.userId, { userId: o.userId, orderCount: 0, totalSpent: 0 });
    }
    const p = parentMap.get(o.userId)!;
    p.orderCount++;
    p.totalSpent += o.totalAmount;
  }

  const topParentIds = Array.from(parentMap.values())
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 10);

  let topParents: { name: string; childName: string | null; orderCount: number; totalSpent: number }[] = [];
  if (topParentIds.length > 0) {
    const users = await db.select().from(user);
    const userMap = new Map(users.map((u) => [u.id, u]));
    topParents = topParentIds.map((p) => {
      const u = userMap.get(p.userId);
      return {
        name: u?.name || "Unknown",
        childName: u?.childName || null,
        orderCount: p.orderCount,
        totalSpent: Math.round(p.totalSpent * 100) / 100,
      };
    });
  }

  return { dailyStats, itemStats, overallSummary, topParents };
}

export async function getSummary() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const { and, gte, lt } = await import("drizzle-orm");

  const orders = await db
    .select()
    .from(order)
    .where(and(gte(order.createdAt, todayStart), lt(order.createdAt, todayEnd)));

  const totalOrders = orders.length;
  const totalRevenue = orders.filter((o) => o.status !== "CANCELLED").reduce((sum, o) => sum + o.totalAmount, 0);

  const byStatus = {
    PLACED: orders.filter((o) => o.status === "PLACED").length,
    PREPARING: orders.filter((o) => o.status === "PREPARING").length,
    SERVED: orders.filter((o) => o.status === "SERVED").length,
    CANCELLED: orders.filter((o) => o.status === "CANCELLED").length,
  };

  const paidCount = orders.filter((o) => o.paymentStatus === "PAID" && o.status !== "CANCELLED").length;
  const unpaidCount = orders.filter((o) => o.paymentStatus === "UNPAID" && o.status !== "CANCELLED").length;
  const paidAmount = orders.filter((o) => o.paymentStatus === "PAID" && o.status !== "CANCELLED").reduce((sum, o) => sum + o.totalAmount, 0);
  const unpaidAmount = orders.filter((o) => o.paymentStatus === "UNPAID" && o.status !== "CANCELLED").reduce((sum, o) => sum + o.totalAmount, 0);
  const preOrderDemand = await getTodayPreOrderDemand();

  return {
    summary: {
      totalOrders,
      totalRevenue,
      byStatus,
      payment: { paidCount, unpaidCount, paidAmount, unpaidAmount },
      preOrders: {
        oneDayCount: preOrderDemand.oneDayCount,
        subscriptionCount: preOrderDemand.subscriptionCount,
        totalPlannedItems: preOrderDemand.totalPlannedItems,
        topDemandItems: preOrderDemand.demandByItem.slice(0, 5),
      },
    },
  };
}
