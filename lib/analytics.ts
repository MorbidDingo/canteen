import { db } from "@/lib/db";
import {
  order,
  orderItem,
  menuItem,
  organizationDevice,
  parentControl,
  child,
  user,
  discount,
} from "@/lib/db/schema";
import { gte, eq, and, sql, isNotNull, or } from "drizzle-orm";
import type { ConfidenceLevel, MenuCategory } from "@/lib/constants";

// ─── Helpers ─────────────────────────────────────────────

function dateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n + 1);
  return d;
}

// ─── 1. Per-item daily breakdown ─────────────────────────

export interface ItemDailyRow {
  date: string;
  menuItemId: string;
  name: string;
  category: string;
  quantity: number;
  revenue: number;
  cancelledQty: number;
}

export async function getItemDailyBreakdown(days: number, organizationId: string): Promise<ItemDailyRow[]> {
  const startDate = daysAgo(days);

  const rows = await db
    .select({
      menuItemId: orderItem.menuItemId,
      name: menuItem.name,
      category: menuItem.category,
      quantity: orderItem.quantity,
      unitPrice: orderItem.unitPrice,
      orderStatus: order.status,
      orderDate: order.createdAt,
    })
    .from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
    .where(and(gte(order.createdAt, startDate), eq(menuItem.organizationId, organizationId)));

  const map = new Map<string, ItemDailyRow>();

  for (const r of rows) {
    const dk = dateKey(new Date(r.orderDate));
    const key = `${dk}:${r.menuItemId}`;
    if (!map.has(key)) {
      map.set(key, {
        date: dk,
        menuItemId: r.menuItemId,
        name: r.name,
        category: r.category,
        quantity: 0,
        revenue: 0,
        cancelledQty: 0,
      });
    }
    const row = map.get(key)!;
    if (r.orderStatus === "CANCELLED") {
      row.cancelledQty += r.quantity;
    } else {
      row.quantity += r.quantity;
      row.revenue += r.quantity * r.unitPrice;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── 2. Stock / Prep Recommendations ────────────────────

export interface StockRecommendation {
  menuItemId: string;
  name: string;
  category: string;
  currentStock: number;
  avgDailySold: number;
  avgDailyCancelled: number;
  suggestedPrep: number;
  confidence: ConfidenceLevel;
  trend: "up" | "down" | "stable";
  daysOfData: number;
  last7: number[];
}

export async function getStockRecommendations(organizationId: string): Promise<StockRecommendation[]> {
  // Only for tracked-stock items
  const trackedItems = await db
    .select()
    .from(menuItem)
    .where(and(eq(menuItem.organizationId, organizationId), isNotNull(menuItem.availableUnits)));

  if (trackedItems.length === 0) return [];

  const startDate = daysAgo(30); // Use up to 30 days of data
  const now = new Date();

  const orderData = await db
    .select({
      menuItemId: orderItem.menuItemId,
      quantity: orderItem.quantity,
      orderStatus: order.status,
      orderDate: order.createdAt,
    })
    .from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
    .where(and(gte(order.createdAt, startDate), eq(menuItem.organizationId, organizationId)));

  // Build per-item daily aggregates
  const itemDailyMap = new Map<
    string,
    Map<string, { sold: number; cancelled: number }>
  >();

  for (const r of orderData) {
    const dk = dateKey(new Date(r.orderDate));
    if (!itemDailyMap.has(r.menuItemId)) {
      itemDailyMap.set(r.menuItemId, new Map());
    }
    const daily = itemDailyMap.get(r.menuItemId)!;
    if (!daily.has(dk)) {
      daily.set(dk, { sold: 0, cancelled: 0 });
    }
    const day = daily.get(dk)!;
    if (r.orderStatus === "CANCELLED") {
      day.cancelled += r.quantity;
    } else {
      day.sold += r.quantity;
    }
  }

  const results: StockRecommendation[] = [];

  for (const item of trackedItems) {
    const daily = itemDailyMap.get(item.id);
    const daysMap = daily ? Array.from(daily.entries()) : [];
    const daysOfData = daysMap.length;

    const totalSold = daysMap.reduce((s, [, d]) => s + d.sold, 0);
    const totalCancelled = daysMap.reduce((s, [, d]) => s + d.cancelled, 0);

    const avgDailySold = daysOfData > 0 ? totalSold / daysOfData : 0;
    const avgDailyCancelled =
      daysOfData > 0 ? totalCancelled / daysOfData : 0;

    // Suggested prep: avg sold + 15% buffer, minus what's already in stock
    const rawPrep = Math.ceil(avgDailySold * 1.15) - (item.availableUnits ?? 0);
    const suggestedPrep = Math.max(0, rawPrep);

    // Confidence based on days of data
    let confidence: ConfidenceLevel = "LOW";
    if (daysOfData >= 10) confidence = "HIGH";
    else if (daysOfData >= 5) confidence = "MEDIUM";

    // Trend: compare last 3 days vs previous 3 days
    const last7: number[] = [];
    for (let d = 6; d >= 0; d--) {
      const dt = new Date(now);
      dt.setDate(dt.getDate() - d);
      const dk2 = dateKey(dt);
      const dayData = daily?.get(dk2);
      last7.push(dayData?.sold ?? 0);
    }

    const recent3 = last7.slice(4).reduce((s, v) => s + v, 0);
    const prev3 = last7.slice(1, 4).reduce((s, v) => s + v, 0);
    let trend: "up" | "down" | "stable" = "stable";
    if (recent3 > prev3 * 1.2) trend = "up";
    else if (recent3 < prev3 * 0.8) trend = "down";

    results.push({
      menuItemId: item.id,
      name: item.name,
      category: item.category,
      currentStock: item.availableUnits ?? 0,
      avgDailySold: Math.round(avgDailySold * 10) / 10,
      avgDailyCancelled: Math.round(avgDailyCancelled * 10) / 10,
      suggestedPrep,
      confidence,
      trend,
      daysOfData,
      last7,
    });
  }

  return results.sort((a, b) => b.suggestedPrep - a.suggestedPrep);
}

// ─── 3. Discount Suggestions ─────────────────────────────

export interface DiscountSuggestion {
  menuItemId: string;
  name: string;
  category: string;
  currentPrice: number;
  reason: string;
  suggestedType: "PERCENTAGE" | "FLAT";
  suggestedValue: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
  metrics: {
    totalSold: number;
    totalCancelled: number;
    cancelRate: number;
    avgDailySold: number;
    currentStock: number | null;
    revenue: number;
  };
}

export async function getDiscountSuggestions(organizationId: string): Promise<DiscountSuggestion[]> {
  const startDate = daysAgo(14);

  const allItems = await db
    .select()
    .from(menuItem)
    .where(eq(menuItem.organizationId, organizationId));

  const orderData = await db
    .select({
      menuItemId: orderItem.menuItemId,
      quantity: orderItem.quantity,
      unitPrice: orderItem.unitPrice,
      orderStatus: order.status,
      orderDate: order.createdAt,
    })
    .from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
    .where(and(gte(order.createdAt, startDate), eq(menuItem.organizationId, organizationId)));

  // Aggregate per item
  const agg = new Map<
    string,
    { sold: number; cancelled: number; revenue: number; days: Set<string> }
  >();
  for (const r of orderData) {
    if (!agg.has(r.menuItemId)) {
      agg.set(r.menuItemId, { sold: 0, cancelled: 0, revenue: 0, days: new Set() });
    }
    const a = agg.get(r.menuItemId)!;
    const dk = dateKey(new Date(r.orderDate));
    a.days.add(dk);
    if (r.orderStatus === "CANCELLED") {
      a.cancelled += r.quantity;
    } else {
      a.sold += r.quantity;
      a.revenue += r.quantity * r.unitPrice;
    }
  }

  // Existing active discounts (exclude items that already have one)
  const existingDiscounts = await db
    .select({ menuItemId: discount.menuItemId })
    .from(discount)
    .innerJoin(menuItem, eq(discount.menuItemId, menuItem.id))
    .where(and(eq(menuItem.organizationId, organizationId), eq(discount.active, true)));
  const discountedIds = new Set(existingDiscounts.map((d) => d.menuItemId));

  const totalItemsSold = Array.from(agg.values()).reduce((s, a) => s + a.sold, 0);
  const avgSoldPerItem = allItems.length > 0 ? totalItemsSold / allItems.length : 0;

  const suggestions: DiscountSuggestion[] = [];

  for (const item of allItems) {
    if (discountedIds.has(item.id)) continue;

    const data = agg.get(item.id);
    const sold = data?.sold ?? 0;
    const cancelled = data?.cancelled ?? 0;
    const revenue = data?.revenue ?? 0;
    const totalOrders = sold + cancelled;
    const cancelRate = totalOrders > 0 ? cancelled / totalOrders : 0;
    const daysActive = data?.days.size ?? 0;
    const avgDailySold = daysActive > 0 ? sold / daysActive : 0;

    const metrics = {
      totalSold: sold,
      totalCancelled: cancelled,
      cancelRate: Math.round(cancelRate * 100),
      avgDailySold: Math.round(avgDailySold * 10) / 10,
      currentStock: item.availableUnits,
      revenue: Math.round(revenue),
    };

    // Rule 1: High cancellation rate (>20%) with enough orders
    if (cancelRate > 0.2 && totalOrders >= 5) {
      suggestions.push({
        menuItemId: item.id,
        name: item.name,
        category: item.category,
        currentPrice: item.price,
        reason: `High cancellation rate (${metrics.cancelRate}%). Consider price reduction or quality review.`,
        suggestedType: "PERCENTAGE",
        suggestedValue: 15,
        priority: "HIGH",
        metrics,
      });
      continue;
    }

    // Rule 2: Overstocked slow movers (tracked stock > 3x avg daily sales)
    if (
      item.availableUnits !== null &&
      avgDailySold > 0 &&
      item.availableUnits > avgDailySold * 3
    ) {
      suggestions.push({
        menuItemId: item.id,
        name: item.name,
        category: item.category,
        currentPrice: item.price,
        reason: `Overstocked: ${item.availableUnits} units in stock but only ${metrics.avgDailySold}/day sold. Clear inventory with a discount.`,
        suggestedType: "PERCENTAGE",
        suggestedValue: 10,
        priority: "MEDIUM",
        metrics,
      });
      continue;
    }

    // Rule 3: Slow mover (sold < 30% of average across all items)
    if (avgSoldPerItem > 0 && sold < avgSoldPerItem * 0.3 && sold > 0) {
      suggestions.push({
        menuItemId: item.id,
        name: item.name,
        category: item.category,
        currentPrice: item.price,
        reason: `Low popularity: only ${sold} units sold in 14 days (avg across items: ${Math.round(avgSoldPerItem)}). Boost with a discount.`,
        suggestedType: "PERCENTAGE",
        suggestedValue: 20,
        priority: "LOW",
        metrics,
      });
      continue;
    }

    // Rule 4: Zero sales but available
    if (sold === 0 && item.available) {
      suggestions.push({
        menuItemId: item.id,
        name: item.name,
        category: item.category,
        currentPrice: item.price,
        reason: `No sales in the last 14 days. Consider a promotional discount or removing.`,
        suggestedType: "PERCENTAGE",
        suggestedValue: 25,
        priority: "MEDIUM",
        metrics,
      });
    }
  }

  return suggestions.sort((a, b) => {
    const pri = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return pri[a.priority] - pri[b.priority];
  });
}

// ─── 4. Category Block Stats ─────────────────────────────

export interface CategoryBlockStat {
  category: MenuCategory;
  blockedCount: number;
  totalParents: number;
  percentage: number;
}

export async function getCategoryBlockStats(organizationId: string): Promise<CategoryBlockStat[]> {
  const controls = await db
    .select({ blockedCategories: parentControl.blockedCategories })
    .from(parentControl)
    .innerJoin(child, eq(parentControl.childId, child.id))
    .where(eq(child.organizationId, organizationId));

  const totalParentsResult = await db
    .select({ count: sql<number>`count(distinct ${child.parentId})` })
    .from(child)
    .where(eq(child.organizationId, organizationId));
  const totalParents = Number(totalParentsResult[0]?.count ?? 0);

  const counts: Record<string, number> = {
    SNACKS: 0,
    MEALS: 0,
    DRINKS: 0,
    PACKED_FOOD: 0,
  };

  for (const c of controls) {
    try {
      const blocked: string[] = JSON.parse(c.blockedCategories ?? "[]");
      for (const cat of blocked) {
        if (cat in counts) counts[cat]++;
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return (Object.entries(counts) as [MenuCategory, number][]).map(
    ([category, blockedCount]) => ({
      category,
      blockedCount,
      totalParents,
      percentage:
        totalParents > 0
          ? Math.round((blockedCount / totalParents) * 100)
          : 0,
    })
  );
}

// ─── 5. Revenue by Category ──────────────────────────────

export interface CategoryRevenue {
  category: string;
  revenue: number;
  orders: number;
  quantity: number;
}

export async function getRevenueByCategory(days: number, organizationId: string): Promise<CategoryRevenue[]> {
  const startDate = daysAgo(days);

  const rows = await db
    .select({
      category: menuItem.category,
      quantity: orderItem.quantity,
      unitPrice: orderItem.unitPrice,
      orderStatus: order.status,
    })
    .from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
    .where(
      and(
        gte(order.createdAt, startDate),
        eq(menuItem.organizationId, organizationId),
        sql`${order.status} != 'CANCELLED'`
      )
    );

  const map = new Map<string, CategoryRevenue>();
  for (const r of rows) {
    if (!map.has(r.category)) {
      map.set(r.category, { category: r.category, revenue: 0, orders: 0, quantity: 0 });
    }
    const c = map.get(r.category)!;
    c.revenue += r.quantity * r.unitPrice;
    c.quantity += r.quantity;
    c.orders++;
  }

  return Array.from(map.values())
    .map((c) => ({ ...c, revenue: Math.round(c.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ─── 6. Payment Method Breakdown ─────────────────────────

export interface PaymentBreakdown {
  method: string;
  count: number;
  amount: number;
}

export async function getPaymentMethodBreakdown(
  days: number,
  organizationId: string,
): Promise<PaymentBreakdown[]> {
  const startDate = daysAgo(days);

  const orders = await db
    .select({
      paymentMethod: order.paymentMethod,
      totalAmount: order.totalAmount,
      status: order.status,
    })
    .from(order)
    .leftJoin(child, eq(order.childId, child.id))
    .leftJoin(organizationDevice, eq(order.deviceId, organizationDevice.id))
    .where(
      and(
        gte(order.createdAt, startDate),
        or(eq(child.organizationId, organizationId), eq(organizationDevice.organizationId, organizationId)),
        sql`${order.status} != 'CANCELLED'`
      )
    );

  const map = new Map<string, PaymentBreakdown>();
  for (const o of orders) {
    if (!map.has(o.paymentMethod)) {
      map.set(o.paymentMethod, { method: o.paymentMethod, count: 0, amount: 0 });
    }
    const p = map.get(o.paymentMethod)!;
    p.count++;
    p.amount += o.totalAmount;
  }

  return Array.from(map.values())
    .map((p) => ({ ...p, amount: Math.round(p.amount) }))
    .sort((a, b) => b.amount - a.amount);
}

// ─── 7. Peak Hours Analysis ──────────────────────────────

export interface PeakHourData {
  hour: number;
  label: string;
  orders: number;
  revenue: number;
}

export async function getPeakHoursAnalysis(
  days: number,
  organizationId: string,
): Promise<PeakHourData[]> {
  const startDate = daysAgo(days);

  const orders = await db
    .select({
      createdAt: order.createdAt,
      totalAmount: order.totalAmount,
      status: order.status,
    })
    .from(order)
    .leftJoin(child, eq(order.childId, child.id))
    .leftJoin(organizationDevice, eq(order.deviceId, organizationDevice.id))
    .where(
      and(
        gte(order.createdAt, startDate),
        or(eq(child.organizationId, organizationId), eq(organizationDevice.organizationId, organizationId)),
        sql`${order.status} != 'CANCELLED'`
      )
    );

  // Initialize all 24 hours
  const hourMap: PeakHourData[] = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${i.toString().padStart(2, "0")}:00`,
    orders: 0,
    revenue: 0,
  }));

  for (const o of orders) {
    const h = new Date(o.createdAt).getHours();
    hourMap[h].orders++;
    hourMap[h].revenue += o.totalAmount;
  }

  // Round revenue
  for (const h of hourMap) {
    h.revenue = Math.round(h.revenue);
  }

  return hourMap;
}

// ─── Combined analytics endpoint ─────────────────────────

export async function getFullAnalytics(days: number, organizationId: string) {
  const [
    itemBreakdown,
    recommendations,
    discountSuggestions,
    categoryBlocks,
    revenueByCategory,
    paymentBreakdown,
    peakHours,
  ] = await Promise.all([
    getItemDailyBreakdown(days, organizationId),
    getStockRecommendations(organizationId),
    getDiscountSuggestions(organizationId),
    getCategoryBlockStats(organizationId),
    getRevenueByCategory(days, organizationId),
    getPaymentMethodBreakdown(days, organizationId),
    getPeakHoursAnalysis(days, organizationId),
  ]);

  return {
    itemBreakdown,
    recommendations,
    discountSuggestions,
    categoryBlocks,
    revenueByCategory,
    paymentBreakdown,
    peakHours,
  };
}
