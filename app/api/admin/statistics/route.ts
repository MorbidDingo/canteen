import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { order, orderItem, menuItem, user } from "@/lib/db/schema";
import { and, gte, lt, eq, sql, desc } from "drizzle-orm";

// GET — statistics data for admin dashboard
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get("days") || "30";
    const days = Math.min(Math.max(parseInt(daysParam) || 30, 1), 365);

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);

    // ─── 1. Daily order breakdown ────────────────────────
    const allOrders = await db
      .select()
      .from(order)
      .where(gte(order.createdAt, startDate));

    // Group by day
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
        date: key,
        totalOrders: 0,
        totalRevenue: 0,
        served: 0,
        cancelled: 0,
        placed: 0,
        preparing: 0,
        paidAmount: 0,
        unpaidAmount: 0,
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

    const dailyStats = Array.from(dailyMap.values()).sort(
      (a, b) => b.date.localeCompare(a.date)
    );

    // ─── 2. Item popularity (rolling stats) ──────────────
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
      id: string;
      name: string;
      category: string;
      currentPrice: number;
      totalQuantity: number;
      totalRevenue: number;
      orderCount: number;
      cancelledQuantity: number;
      dailyBreakdown: Map<string, { quantity: number; revenue: number }>;
    }>();

    for (const row of itemOrders) {
      if (!itemMap.has(row.menuItemId)) {
        itemMap.set(row.menuItemId, {
          id: row.menuItemId,
          name: row.itemName,
          category: row.itemCategory,
          currentPrice: row.itemPrice,
          totalQuantity: 0,
          totalRevenue: 0,
          orderCount: 0,
          cancelledQuantity: 0,
          dailyBreakdown: new Map(),
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
        // Calculate average daily quantity
        const daysWithOrders = item.dailyBreakdown.size;
        const avgDailyQuantity = daysWithOrders > 0
          ? item.totalQuantity / daysWithOrders
          : 0;

        // Last 7 days trend
        const last7 = [];
        for (let d = 6; d >= 0; d--) {
          const date = new Date(now);
          date.setDate(date.getDate() - d);
          const key = date.toISOString().split("T")[0];
          const dayData = item.dailyBreakdown.get(key);
          last7.push({
            date: key,
            quantity: dayData?.quantity || 0,
            revenue: dayData?.revenue || 0,
          });
        }

        return {
          id: item.id,
          name: item.name,
          category: item.category,
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

    // ─── 3. Overall summary for period ───────────────────
    const activeOrders = allOrders.filter((o) => o.status !== "CANCELLED");
    const overallSummary = {
      totalOrders: allOrders.length,
      totalRevenue: Math.round(activeOrders.reduce((s, o) => s + o.totalAmount, 0) * 100) / 100,
      avgOrderValue: activeOrders.length > 0
        ? Math.round((activeOrders.reduce((s, o) => s + o.totalAmount, 0) / activeOrders.length) * 100) / 100
        : 0,
      servedOrders: allOrders.filter((o) => o.status === "SERVED").length,
      cancelledOrders: allOrders.filter((o) => o.status === "CANCELLED").length,
      paidTotal: Math.round(
        activeOrders
          .filter((o) => o.paymentStatus === "PAID")
          .reduce((s, o) => s + o.totalAmount, 0) * 100
      ) / 100,
      unpaidTotal: Math.round(
        activeOrders
          .filter((o) => o.paymentStatus === "UNPAID")
          .reduce((s, o) => s + o.totalAmount, 0) * 100
      ) / 100,
      days,
    };

    // ─── 4. Top parents by order count ───────────────────
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

    // Fetch parent names
    let topParents: { name: string; childName: string | null; orderCount: number; totalSpent: number }[] = [];
    if (topParentIds.length > 0) {
      const userIds = topParentIds.map((p) => p.userId);
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

    return NextResponse.json({
      dailyStats,
      itemStats,
      overallSummary,
      topParents,
    });
  } catch (error) {
    console.error("Statistics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}
