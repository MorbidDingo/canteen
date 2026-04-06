import { db } from "@/lib/db";
import {
  order,
  orderItem,
  menuItem,
  orderFeedback,
  orderCancellationReason,
} from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";
import type { ConfidenceLevel } from "@/lib/constants";

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

function dayOfWeek(d: Date): number {
  return d.getDay(); // 0=Sun … 6=Sat
}

/** Simple linear regression returning slope and intercept. */
function linearRegression(ys: number[]): { slope: number; intercept: number } {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += ys[i];
    sumXY += i * ys[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─── Shared data fetcher ─────────────────────────────────

interface RawOrderRow {
  menuItemId: string;
  menuItemName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  orderStatus: string;
  orderDate: Date;
  orderId: string;
  userId: string;
  totalAmount: number;
}

async function fetchOrderData(orgId: string, startDate: Date): Promise<RawOrderRow[]> {
  return db
    .select({
      menuItemId: orderItem.menuItemId,
      menuItemName: menuItem.name,
      category: menuItem.category,
      quantity: orderItem.quantity,
      unitPrice: orderItem.unitPrice,
      orderStatus: order.status,
      orderDate: order.createdAt,
      orderId: order.id,
      userId: order.userId,
      totalAmount: order.totalAmount,
    })
    .from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
    .where(
      and(gte(order.createdAt, startDate), eq(menuItem.organizationId, orgId)),
    );
}

// ─── 1. Demand Forecast ─────────────────────────────────

export type PrepAction = "INCREASE" | "DECREASE" | "MAINTAIN";

export interface DemandForecastItem {
  menuItemId: string;
  name: string;
  category: string;
  forecastQty: number;
  confidenceLow: number;
  confidenceHigh: number;
  action: PrepAction;
  recentAvg: number;
  dayOfWeekFactor: number;
}

/**
 * Predict next-day demand per menu item using a weighted moving average
 * with day-of-week seasonality adjustment.
 *
 * **Approach:** Compute a 7-day exponentially-weighted moving average (recent
 * days get higher weight). Then scale by a day-of-week ratio derived from
 * historical same-day averages vs the overall average. Confidence interval
 * is ±1.5 standard deviations of daily demand.
 */
export async function getDemandForecast(
  orgId: string,
  days: number = 30,
): Promise<DemandForecastItem[]> {
  const startDate = daysAgo(days);
  const rows = await fetchOrderData(orgId, startDate);

  if (rows.length === 0) return [];

  // Per-item, per-date quantity (non-cancelled)
  const itemDaily = new Map<string, Map<string, number>>();
  const itemMeta = new Map<string, { name: string; category: string }>();

  for (const r of rows) {
    if (r.orderStatus === "CANCELLED") continue;
    if (!itemDaily.has(r.menuItemId)) {
      itemDaily.set(r.menuItemId, new Map());
      itemMeta.set(r.menuItemId, { name: r.menuItemName, category: r.category });
    }
    const daily = itemDaily.get(r.menuItemId)!;
    const dk = dateKey(new Date(r.orderDate));
    daily.set(dk, (daily.get(dk) ?? 0) + r.quantity);
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDow = dayOfWeek(tomorrow);

  const results: DemandForecastItem[] = [];

  for (const [itemId, daily] of itemDaily) {
    const meta = itemMeta.get(itemId)!;

    // Build ordered daily series
    const dates: string[] = [];
    for (let d = 0; d < days; d++) {
      const dt = new Date(startDate);
      dt.setDate(dt.getDate() + d);
      dates.push(dateKey(dt));
    }
    const series = dates.map((dk) => daily.get(dk) ?? 0);

    // Weighted moving average (exponential decay, α = 0.3)
    const alpha = 0.3;
    let wma = series[0];
    for (let i = 1; i < series.length; i++) {
      wma = alpha * series[i] + (1 - alpha) * wma;
    }

    // Day-of-week seasonality factor
    const dowBuckets: number[][] = [[], [], [], [], [], [], []];
    for (let i = 0; i < dates.length; i++) {
      const dt = new Date(dates[i]);
      dowBuckets[dayOfWeek(dt)].push(series[i]);
    }
    const overallAvg = mean(series);
    const targetDowAvg = mean(dowBuckets[targetDow]);
    const dowFactor =
      overallAvg > 0 ? targetDowAvg / overallAvg : 1;

    const forecast = Math.max(0, Math.round(wma * dowFactor));

    // Confidence interval: ±1.5σ
    const sd = stdDev(series);
    const margin = Math.round(1.5 * sd);
    const low = Math.max(0, forecast - margin);
    const high = forecast + margin;

    // Action recommendation
    const recentAvg = mean(series.slice(-7));
    let action: PrepAction = "MAINTAIN";
    if (forecast > recentAvg * 1.15) action = "INCREASE";
    else if (forecast < recentAvg * 0.85) action = "DECREASE";

    results.push({
      menuItemId: itemId,
      name: meta.name,
      category: meta.category,
      forecastQty: forecast,
      confidenceLow: low,
      confidenceHigh: high,
      action,
      recentAvg: Math.round(recentAvg * 10) / 10,
      dayOfWeekFactor: Math.round(dowFactor * 100) / 100,
    });
  }

  return results.sort((a, b) => b.forecastQty - a.forecastQty);
}

// ─── 2. Revenue Trend Analysis ──────────────────────────

export interface RevenueAnomaly {
  date: string;
  revenue: number;
  zScore: number;
  type: "SPIKE" | "DIP";
}

export interface RevenueTrendAnalysis {
  dailyRevenue: { date: string; revenue: number; ma7: number | null; ma30: number | null }[];
  growthRate7d: number;
  growthRate30d: number;
  anomalies: RevenueAnomaly[];
  projectedRevenue: { date: string; projected: number }[];
  totalRevenue: number;
  avgDailyRevenue: number;
}

/**
 * Analyze revenue trends with 7-day and 30-day moving averages,
 * growth rates, anomaly detection (Z-score > 2), and 7-day projection
 * via linear regression on recent data.
 */
export async function getRevenueTrendAnalysis(
  orgId: string,
  days: number = 60,
): Promise<RevenueTrendAnalysis> {
  const startDate = daysAgo(days);
  const rows = await fetchOrderData(orgId, startDate);

  // Daily revenue map (non-cancelled only)
  const revenueMap = new Map<string, number>();
  for (const r of rows) {
    if (r.orderStatus === "CANCELLED") continue;
    const dk = dateKey(new Date(r.orderDate));
    revenueMap.set(dk, (revenueMap.get(dk) ?? 0) + r.quantity * r.unitPrice);
  }

  // Build ordered date series
  const dates: string[] = [];
  for (let d = 0; d < days; d++) {
    const dt = new Date(startDate);
    dt.setDate(dt.getDate() + d);
    dates.push(dateKey(dt));
  }
  const revenues = dates.map((dk) => revenueMap.get(dk) ?? 0);

  // Moving averages
  const dailyRevenue: RevenueTrendAnalysis["dailyRevenue"] = [];
  for (let i = 0; i < dates.length; i++) {
    const window7 = revenues.slice(Math.max(0, i - 6), i + 1);
    const window30 = revenues.slice(Math.max(0, i - 29), i + 1);
    dailyRevenue.push({
      date: dates[i],
      revenue: Math.round(revenues[i] * 100) / 100,
      ma7: window7.length >= 7 ? Math.round(mean(window7) * 100) / 100 : null,
      ma30: window30.length >= 30 ? Math.round(mean(window30) * 100) / 100 : null,
    });
  }

  // Growth rates
  const last7 = revenues.slice(-7);
  const prev7 = revenues.slice(-14, -7);
  const sum7 = last7.reduce((s, v) => s + v, 0);
  const sumPrev7 = prev7.reduce((s, v) => s + v, 0);
  const growthRate7d = sumPrev7 > 0 ? ((sum7 - sumPrev7) / sumPrev7) * 100 : 0;

  const last30 = revenues.slice(-30);
  const prev30 = revenues.slice(-60, -30);
  const sum30 = last30.reduce((s, v) => s + v, 0);
  const sumPrev30 = prev30.reduce((s, v) => s + v, 0);
  const growthRate30d = sumPrev30 > 0 ? ((sum30 - sumPrev30) / sumPrev30) * 100 : 0;

  // Anomaly detection (Z-score on 14-day rolling window)
  const anomalies: RevenueAnomaly[] = [];
  for (let i = 14; i < revenues.length; i++) {
    const window = revenues.slice(i - 14, i);
    const m = mean(window);
    const sd = stdDev(window);
    if (sd === 0) continue;
    const z = (revenues[i] - m) / sd;
    if (Math.abs(z) >= 2) {
      anomalies.push({
        date: dates[i],
        revenue: Math.round(revenues[i] * 100) / 100,
        zScore: Math.round(z * 100) / 100,
        type: z > 0 ? "SPIKE" : "DIP",
      });
    }
  }

  // 7-day projection using linear regression on last 14 days
  const recentWindow = revenues.slice(-14);
  const { slope, intercept } = linearRegression(recentWindow);
  const projectedRevenue: { date: string; projected: number }[] = [];
  for (let d = 1; d <= 7; d++) {
    const dt = new Date();
    dt.setDate(dt.getDate() + d);
    const projected = Math.max(0, intercept + slope * (recentWindow.length - 1 + d));
    projectedRevenue.push({
      date: dateKey(dt),
      projected: Math.round(projected * 100) / 100,
    });
  }

  const totalRevenue = revenues.reduce((s, v) => s + v, 0);

  return {
    dailyRevenue,
    growthRate7d: Math.round(growthRate7d * 100) / 100,
    growthRate30d: Math.round(growthRate30d * 100) / 100,
    anomalies,
    projectedRevenue,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    avgDailyRevenue: Math.round((totalRevenue / Math.max(1, days)) * 100) / 100,
  };
}

// ─── 3. Item Performance Scores ─────────────────────────

export type PerformanceTier =
  | "STAR"
  | "GROWING"
  | "STABLE"
  | "DECLINING"
  | "UNDERPERFORMING";

export interface ItemPerformanceScore {
  menuItemId: string;
  name: string;
  category: string;
  score: number;
  tier: PerformanceTier;
  breakdown: {
    salesVolume: number;
    revenueContribution: number;
    growthTrend: number;
    customerSatisfaction: number;
    cancellationRateInverse: number;
  };
  totalSold: number;
  totalRevenue: number;
  avgRating: number | null;
  cancellationRate: number;
}

/**
 * Score each menu item 0-100 across five weighted dimensions:
 *   - Sales volume (25%) — normalized rank among all items
 *   - Revenue contribution (25%) — share of total org revenue
 *   - Growth trend (20%) — linear regression slope on weekly sales
 *   - Customer satisfaction (15%) — average feedback rating
 *   - Cancellation-rate inverse (15%) — lower cancellation = higher score
 *
 * Items are bucketed into tiers based on composite score.
 */
export async function getItemPerformanceScores(
  orgId: string,
  days: number = 30,
): Promise<ItemPerformanceScore[]> {
  const startDate = daysAgo(days);

  const [rows, feedbackRows] = await Promise.all([
    fetchOrderData(orgId, startDate),
    db
      .select({
        orderId: orderFeedback.orderId,
        healthy: orderFeedback.healthyRating,
        taste: orderFeedback.tasteRating,
        quantity: orderFeedback.quantityRating,
      })
      .from(orderFeedback)
      .innerJoin(order, eq(orderFeedback.orderId, order.id))
      .innerJoin(orderItem, eq(order.id, orderItem.orderId))
      .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
      .where(
        and(gte(order.createdAt, startDate), eq(menuItem.organizationId, orgId)),
      ),
  ]);

  if (rows.length === 0) return [];

  // Aggregate per item
  interface ItemAgg {
    name: string;
    category: string;
    sold: number;
    cancelled: number;
    revenue: number;
    weeklySales: Map<number, number>; // weekIndex → qty
  }
  const items = new Map<string, ItemAgg>();

  for (const r of rows) {
    if (!items.has(r.menuItemId)) {
      items.set(r.menuItemId, {
        name: r.menuItemName,
        category: r.category,
        sold: 0,
        cancelled: 0,
        revenue: 0,
        weeklySales: new Map(),
      });
    }
    const agg = items.get(r.menuItemId)!;
    const weekIdx = Math.floor(
      (new Date(r.orderDate).getTime() - startDate.getTime()) / (7 * 86_400_000),
    );
    if (r.orderStatus === "CANCELLED") {
      agg.cancelled += r.quantity;
    } else {
      agg.sold += r.quantity;
      agg.revenue += r.quantity * r.unitPrice;
      agg.weeklySales.set(weekIdx, (agg.weeklySales.get(weekIdx) ?? 0) + r.quantity);
    }
  }

  // Feedback → avg rating per order, then map to items
  const orderRatingMap = new Map<string, number>();
  for (const f of feedbackRows) {
    const avg = (f.healthy + f.taste + f.quantity) / 3;
    orderRatingMap.set(f.orderId, avg);
  }

  // Map feedback to items via orderItem join data
  const itemRatings = new Map<string, number[]>();
  for (const r of rows) {
    if (r.orderStatus === "CANCELLED") continue;
    const rating = orderRatingMap.get(r.orderId);
    if (rating !== undefined) {
      if (!itemRatings.has(r.menuItemId)) itemRatings.set(r.menuItemId, []);
      itemRatings.get(r.menuItemId)!.push(rating);
    }
  }

  // Compute normalization bounds
  const allSold = Array.from(items.values()).map((a) => a.sold);
  const maxSold = Math.max(...allSold, 1);

  const results: ItemPerformanceScore[] = [];

  for (const [itemId, agg] of items) {
    // 1. Sales volume score (0-100 normalized)
    const salesScore = (agg.sold / maxSold) * 100;

    // 2. Revenue contribution score (normalized to top performer)
    const maxRevenue = Math.max(...Array.from(items.values()).map((a) => a.revenue), 1);
    const revenueScore = (agg.revenue / maxRevenue) * 100;

    // 3. Growth trend score via weekly regression slope
    const numWeeks = Math.ceil(days / 7);
    const weeklyArr: number[] = [];
    for (let w = 0; w < numWeeks; w++) {
      weeklyArr.push(agg.weeklySales.get(w) ?? 0);
    }
    const { slope } = linearRegression(weeklyArr);
    const avgWeekly = mean(weeklyArr);
    const growthPct = avgWeekly > 0 ? (slope / avgWeekly) * 100 : 0;
    // Map growth to 0-100 (50 = flat, 100 = strong growth, 0 = strong decline)
    const growthScore = clamp(50 + growthPct * 5, 0, 100);

    // 4. Customer satisfaction score
    const ratings = itemRatings.get(itemId);
    const avgRating = ratings && ratings.length > 0 ? mean(ratings) : null;
    // Scale 1-5 rating to 0-100
    const satisfactionScore = avgRating !== null ? ((avgRating - 1) / 4) * 100 : 50;

    // 5. Cancellation rate inverse score
    const totalOrders = agg.sold + agg.cancelled;
    const cancelRate = totalOrders > 0 ? agg.cancelled / totalOrders : 0;
    const cancelScore = (1 - cancelRate) * 100;

    // Weighted composite
    const score = Math.round(
      salesScore * 0.25 +
        clamp(revenueScore, 0, 100) * 0.25 +
        growthScore * 0.2 +
        satisfactionScore * 0.15 +
        cancelScore * 0.15,
    );

    // Tier assignment
    let tier: PerformanceTier;
    if (score >= 80) tier = "STAR";
    else if (score >= 60) tier = "GROWING";
    else if (score >= 40) tier = "STABLE";
    else if (score >= 20) tier = "DECLINING";
    else tier = "UNDERPERFORMING";

    results.push({
      menuItemId: itemId,
      name: agg.name,
      category: agg.category,
      score,
      tier,
      breakdown: {
        salesVolume: Math.round(salesScore),
        revenueContribution: Math.round(clamp(revenueScore, 0, 100)),
        growthTrend: Math.round(growthScore),
        customerSatisfaction: Math.round(satisfactionScore),
        cancellationRateInverse: Math.round(cancelScore),
      },
      totalSold: agg.sold,
      totalRevenue: Math.round(agg.revenue * 100) / 100,
      avgRating: avgRating !== null ? Math.round(avgRating * 100) / 100 : null,
      cancellationRate: Math.round(cancelRate * 100),
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

// ─── 4. Waste / Cancellation Analysis ───────────────────

export interface WastePatternInsight {
  pattern: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
}

export interface WasteAnalysis {
  topCancelledItems: {
    menuItemId: string;
    name: string;
    category: string;
    cancelledQty: number;
    cancelRate: number;
    estimatedRevenueLost: number;
  }[];
  cancellationByHour: { hour: number; count: number }[];
  cancellationByDay: { day: number; dayName: string; count: number }[];
  totalCancelled: number;
  totalRevenueLost: number;
  topReasons: { reason: string; count: number; percentage: number }[];
  patterns: WastePatternInsight[];
}

/**
 * Analyze cancellation/waste patterns including per-item cancellation rates,
 * time-of-day and day-of-week distributions, revenue impact, cancellation
 * reasons, and auto-detected patterns (e.g., "Mondays have 3× more
 * cancellations").
 */
export async function getWasteAnalysis(
  orgId: string,
  days: number = 30,
): Promise<WasteAnalysis> {
  const startDate = daysAgo(days);

  const [rows, reasonRows] = await Promise.all([
    fetchOrderData(orgId, startDate),
    db
      .select({
        reason: orderCancellationReason.reason,
        orderId: orderCancellationReason.orderId,
      })
      .from(orderCancellationReason)
      .innerJoin(order, eq(orderCancellationReason.orderId, order.id))
      .innerJoin(orderItem, eq(order.id, orderItem.orderId))
      .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
      .where(
        and(gte(order.createdAt, startDate), eq(menuItem.organizationId, orgId)),
      ),
  ]);

  // Per-item cancellation aggregation
  const itemAgg = new Map<
    string,
    { name: string; category: string; sold: number; cancelled: number; revenueLost: number }
  >();

  const hourCounts = new Array(24).fill(0) as number[];
  const dayCounts = new Array(7).fill(0) as number[];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  let totalCancelled = 0;
  let totalRevenueLost = 0;

  for (const r of rows) {
    if (!itemAgg.has(r.menuItemId)) {
      itemAgg.set(r.menuItemId, {
        name: r.menuItemName,
        category: r.category,
        sold: 0,
        cancelled: 0,
        revenueLost: 0,
      });
    }
    const agg = itemAgg.get(r.menuItemId)!;

    if (r.orderStatus === "CANCELLED") {
      agg.cancelled += r.quantity;
      const lost = r.quantity * r.unitPrice;
      agg.revenueLost += lost;
      totalCancelled += r.quantity;
      totalRevenueLost += lost;

      const dt = new Date(r.orderDate);
      hourCounts[dt.getHours()]++;
      dayCounts[dayOfWeek(dt)]++;
    } else {
      agg.sold += r.quantity;
    }
  }

  // Top cancelled items (by qty)
  const topCancelledItems = Array.from(itemAgg.entries())
    .filter(([, a]) => a.cancelled > 0)
    .map(([id, a]) => ({
      menuItemId: id,
      name: a.name,
      category: a.category,
      cancelledQty: a.cancelled,
      cancelRate: Math.round(
        (a.cancelled / Math.max(1, a.sold + a.cancelled)) * 100,
      ),
      estimatedRevenueLost: Math.round(a.revenueLost * 100) / 100,
    }))
    .sort((a, b) => b.cancelledQty - a.cancelledQty)
    .slice(0, 10);

  // Cancellation by hour
  const cancellationByHour = hourCounts.map((count, hour) => ({ hour, count }));

  // Cancellation by day
  const cancellationByDay = dayCounts.map((count, day) => ({
    day,
    dayName: dayNames[day],
    count,
  }));

  // Top reasons
  const reasonCounts = new Map<string, number>();
  for (const r of reasonRows) {
    reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1);
  }
  const totalReasonEntries = Array.from(reasonCounts.values()).reduce((s, v) => s + v, 0);
  const topReasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: totalReasonEntries > 0 ? Math.round((count / totalReasonEntries) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Auto-detect patterns
  const patterns: WastePatternInsight[] = [];
  const avgDayCount = mean(dayCounts);
  if (avgDayCount > 0) {
    for (let d = 0; d < 7; d++) {
      const ratio = dayCounts[d] / avgDayCount;
      if (ratio >= 2.5) {
        patterns.push({
          pattern: `${dayNames[d]}s have ${ratio.toFixed(1)}× more cancellations than average`,
          severity: "HIGH",
        });
      } else if (ratio >= 1.8) {
        patterns.push({
          pattern: `${dayNames[d]}s have ${ratio.toFixed(1)}× more cancellations than average`,
          severity: "MEDIUM",
        });
      }
    }
  }

  // Peak cancellation hour
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  const peakHourCount = hourCounts[peakHour];
  const avgHourCount = mean(hourCounts.filter((c) => c > 0));
  if (avgHourCount > 0 && peakHourCount >= avgHourCount * 2) {
    patterns.push({
      pattern: `Peak cancellation hour is ${peakHour}:00 with ${peakHourCount} cancellations`,
      severity: "MEDIUM",
    });
  }

  // High-cancel-rate items
  for (const item of topCancelledItems) {
    if (item.cancelRate >= 30 && item.cancelledQty >= 5) {
      patterns.push({
        pattern: `"${item.name}" has a ${item.cancelRate}% cancellation rate — consider reviewing`,
        severity: item.cancelRate >= 50 ? "HIGH" : "MEDIUM",
      });
    }
  }

  return {
    topCancelledItems,
    cancellationByHour,
    cancellationByDay,
    totalCancelled,
    totalRevenueLost: Math.round(totalRevenueLost * 100) / 100,
    topReasons,
    patterns,
  };
}

// ─── 5. Customer Segmentation ───────────────────────────

export type CustomerSegment = "HIGH_VALUE" | "REGULAR" | "OCCASIONAL" | "AT_RISK";

export interface CustomerSegmentInfo {
  segment: CustomerSegment;
  count: number;
  avgOrderValue: number;
  avgOrderFrequency: number;
  totalRevenue: number;
}

export interface CustomerSegmentationResult {
  segments: CustomerSegmentInfo[];
  totalCustomers: number;
  highlights: string[];
}

/**
 * Segment customers by monetary value and frequency using an RFM-inspired
 * approach:
 *   - HIGH_VALUE — top 20 % by total spend
 *   - REGULAR — ordered ≥ 1× per week on average
 *   - AT_RISK — previously active but declining frequency (recent half < 40 % of prior half)
 *   - OCCASIONAL — everyone else
 */
export async function getCustomerSegmentation(
  orgId: string,
  days: number = 60,
): Promise<CustomerSegmentationResult> {
  const startDate = daysAgo(days);
  const rows = await fetchOrderData(orgId, startDate);

  if (rows.length === 0) {
    return { segments: [], totalCustomers: 0, highlights: [] };
  }

  // Per-user aggregation (non-cancelled)
  interface UserAgg {
    totalSpend: number;
    orderDates: Date[];
    recentOrderCount: number;
    priorOrderCount: number;
  }
  const users = new Map<string, UserAgg>();
  const midpoint = new Date((startDate.getTime() + Date.now()) / 2);
  const processedOrders = new Set<string>();

  for (const r of rows) {
    if (r.orderStatus === "CANCELLED") continue;
    if (!users.has(r.userId)) {
      users.set(r.userId, { totalSpend: 0, orderDates: [], recentOrderCount: 0, priorOrderCount: 0 });
    }
    const u = users.get(r.userId)!;
    u.totalSpend += r.quantity * r.unitPrice;

    // Count distinct orders per half
    if (!processedOrders.has(r.orderId)) {
      processedOrders.add(r.orderId);
      u.orderDates.push(new Date(r.orderDate));
      if (new Date(r.orderDate) >= midpoint) {
        u.recentOrderCount++;
      } else {
        u.priorOrderCount++;
      }
    }
  }

  // Sort users by spend for top-20% threshold
  const spends = Array.from(users.values())
    .map((u) => u.totalSpend)
    .sort((a, b) => b - a);
  const top20Threshold = spends[Math.floor(spends.length * 0.2)] ?? 0;
  const weeks = Math.max(1, days / 7);

  // Classify
  const segMap = new Map<CustomerSegment, { count: number; totalSpend: number; totalOrders: number }>();
  for (const seg of ["HIGH_VALUE", "REGULAR", "OCCASIONAL", "AT_RISK"] as CustomerSegment[]) {
    segMap.set(seg, { count: 0, totalSpend: 0, totalOrders: 0 });
  }

  for (const [, u] of users) {
    const totalOrders = u.orderDates.length;
    const ordersPerWeek = totalOrders / weeks;
    let segment: CustomerSegment;

    if (u.totalSpend >= top20Threshold && top20Threshold > 0) {
      segment = "HIGH_VALUE";
    } else if (
      u.priorOrderCount > 0 &&
      u.recentOrderCount < u.priorOrderCount * 0.4
    ) {
      segment = "AT_RISK";
    } else if (ordersPerWeek >= 1) {
      segment = "REGULAR";
    } else {
      segment = "OCCASIONAL";
    }

    const s = segMap.get(segment)!;
    s.count++;
    s.totalSpend += u.totalSpend;
    s.totalOrders += totalOrders;
  }

  const segments: CustomerSegmentInfo[] = [];
  for (const [segment, data] of segMap) {
    if (data.count === 0) continue;
    segments.push({
      segment,
      count: data.count,
      avgOrderValue: Math.round((data.totalSpend / Math.max(1, data.totalOrders)) * 100) / 100,
      avgOrderFrequency: Math.round((data.totalOrders / data.count / weeks) * 100) / 100,
      totalRevenue: Math.round(data.totalSpend * 100) / 100,
    });
  }

  // Highlights
  const highlights: string[] = [];
  const highValue = segMap.get("HIGH_VALUE")!;
  const atRisk = segMap.get("AT_RISK")!;
  const totalCustomers = users.size;

  if (highValue.count > 0) {
    const hvPct = Math.round((highValue.totalSpend / spends.reduce((s, v) => s + v, 0)) * 100);
    highlights.push(
      `${highValue.count} high-value customers (${Math.round((highValue.count / totalCustomers) * 100)}%) generate ${hvPct}% of revenue`,
    );
  }
  if (atRisk.count > 0) {
    highlights.push(
      `${atRisk.count} customers are at risk of churning — their recent activity dropped below 40% of prior levels`,
    );
  }

  return {
    segments: segments.sort((a, b) => b.totalRevenue - a.totalRevenue),
    totalCustomers,
    highlights,
  };
}

// ─── 6. Optimal Prep Quantities ─────────────────────────

export interface OptimalPrepItem {
  menuItemId: string;
  name: string;
  category: string;
  optimalQty: number;
  confidence: ConfidenceLevel;
  currentStock: number;
  prepNeeded: number;
  breakdown: {
    baseAvg: number;
    dayOfWeekAdj: number;
    trendAdj: number;
    safetyBuffer: number;
  };
}

/**
 * Calculate optimal daily prep quantities using:
 *   1. Weighted moving average of last 21 days (exponential decay)
 *   2. Day-of-week seasonality multiplier
 *   3. Trend adjustment via linear regression slope
 *   4. Safety buffer scaled by demand variance (higher variance → larger buffer)
 *
 * This improves on the simple `avg × 1.15` in the existing analytics module.
 */
export async function getOptimalPrepQuantities(
  orgId: string,
): Promise<OptimalPrepItem[]> {
  const lookbackDays = 21;
  const startDate = daysAgo(lookbackDays);

  const [rows, trackedItems] = await Promise.all([
    fetchOrderData(orgId, startDate),
    db.select().from(menuItem).where(eq(menuItem.organizationId, orgId)),
  ]);

  if (trackedItems.length === 0) return [];

  // Build per-item daily series
  const itemDaily = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.orderStatus === "CANCELLED") continue;
    if (!itemDaily.has(r.menuItemId)) itemDaily.set(r.menuItemId, new Map());
    const daily = itemDaily.get(r.menuItemId)!;
    const dk = dateKey(new Date(r.orderDate));
    daily.set(dk, (daily.get(dk) ?? 0) + r.quantity);
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDow = dayOfWeek(tomorrow);

  const dates: string[] = [];
  for (let d = 0; d < lookbackDays; d++) {
    const dt = new Date(startDate);
    dt.setDate(dt.getDate() + d);
    dates.push(dateKey(dt));
  }

  const results: OptimalPrepItem[] = [];

  for (const item of trackedItems) {
    const daily = itemDaily.get(item.id);
    const series = dates.map((dk) => daily?.get(dk) ?? 0);

    // 1. Weighted moving average (α = 0.25)
    let wma = series[0];
    for (let i = 1; i < series.length; i++) {
      wma = 0.25 * series[i] + 0.75 * wma;
    }
    const baseAvg = Math.max(0, wma);

    // 2. Day-of-week seasonality
    const dowBuckets: number[][] = [[], [], [], [], [], [], []];
    for (let i = 0; i < dates.length; i++) {
      dowBuckets[dayOfWeek(new Date(dates[i]))].push(series[i]);
    }
    const overallMean = mean(series);
    const dowMean = mean(dowBuckets[targetDow]);
    const dowAdj = overallMean > 0 ? dowMean / overallMean : 1;

    // 3. Trend adjustment
    const { slope } = linearRegression(series);
    const trendAdj = slope * 3; // project 3 days ahead for momentum

    // 4. Safety buffer based on coefficient of variation
    const sd = stdDev(series);
    const cv = overallMean > 0 ? sd / overallMean : 0;
    // Higher CV → higher buffer (10-30% range)
    const bufferPct = 0.1 + clamp(cv, 0, 0.5) * 0.4;

    const rawOptimal = baseAvg * dowAdj + trendAdj;
    const safetyBuffer = rawOptimal * bufferPct;
    const optimalQty = Math.max(0, Math.round(rawOptimal + safetyBuffer));

    // Confidence based on data completeness and variance
    const daysWithData = series.filter((v) => v > 0).length;
    let confidence: ConfidenceLevel = "LOW";
    if (daysWithData >= 14 && cv < 0.5) confidence = "HIGH";
    else if (daysWithData >= 7) confidence = "MEDIUM";

    const currentStock = item.availableUnits ?? 0;
    const prepNeeded = Math.max(0, optimalQty - currentStock);

    results.push({
      menuItemId: item.id,
      name: item.name,
      category: item.category,
      optimalQty,
      confidence,
      currentStock,
      prepNeeded,
      breakdown: {
        baseAvg: Math.round(baseAvg * 10) / 10,
        dayOfWeekAdj: Math.round(dowAdj * 100) / 100,
        trendAdj: Math.round(trendAdj * 10) / 10,
        safetyBuffer: Math.round(safetyBuffer * 10) / 10,
      },
    });
  }

  return results.sort((a, b) => b.prepNeeded - a.prepNeeded);
}

// ─── 7. Admin Insights Summary ──────────────────────────

export interface AdminInsightsSummary {
  generatedAt: string;
  period: { days: number; from: string; to: string };
  kpis: {
    totalRevenue: number;
    avgDailyRevenue: number;
    revenueGrowth7d: number;
    totalOrders: number;
    totalCancelled: number;
    overallCancelRate: number;
    totalCustomers: number;
    atRiskCustomers: number;
  };
  topItems: { name: string; score: number; tier: PerformanceTier }[];
  demandAlerts: { name: string; action: PrepAction; forecastQty: number }[];
  wasteAlerts: WastePatternInsight[];
  recommendations: string[];
}

/**
 * Combine all insight engines into a single executive summary with
 * KPIs and up to 5 actionable recommendations prioritized by impact.
 */
export async function getAdminInsightsSummary(
  orgId: string,
  days: number = 30,
): Promise<AdminInsightsSummary> {
  const [forecast, revenue, performance, waste, customers] = await Promise.all([
    getDemandForecast(orgId, days),
    getRevenueTrendAnalysis(orgId, days),
    getItemPerformanceScores(orgId, days),
    getWasteAnalysis(orgId, days),
    getCustomerSegmentation(orgId, days),
  ]);

  const now = new Date();
  const startDate = daysAgo(days);

  // KPIs
  const totalOrders = performance.reduce((s, p) => s + p.totalSold, 0) + waste.totalCancelled;
  const overallCancelRate =
    totalOrders > 0 ? Math.round((waste.totalCancelled / totalOrders) * 100) : 0;

  const atRiskSeg = customers.segments.find((s) => s.segment === "AT_RISK");

  const kpis = {
    totalRevenue: revenue.totalRevenue,
    avgDailyRevenue: revenue.avgDailyRevenue,
    revenueGrowth7d: revenue.growthRate7d,
    totalOrders,
    totalCancelled: waste.totalCancelled,
    overallCancelRate,
    totalCustomers: customers.totalCustomers,
    atRiskCustomers: atRiskSeg?.count ?? 0,
  };

  // Top items
  const topItems = performance.slice(0, 5).map((p) => ({
    name: p.name,
    score: p.score,
    tier: p.tier,
  }));

  // Demand alerts (items that need action)
  const demandAlerts = forecast
    .filter((f) => f.action !== "MAINTAIN")
    .slice(0, 5)
    .map((f) => ({ name: f.name, action: f.action, forecastQty: f.forecastQty }));

  // Build recommendations (max 5)
  const recommendations: string[] = [];

  // Revenue trend recommendation
  if (revenue.growthRate7d < -10) {
    recommendations.push(
      `Revenue declined ${Math.abs(revenue.growthRate7d).toFixed(1)}% this week — consider promotions or menu refresh`,
    );
  } else if (revenue.growthRate7d > 15) {
    recommendations.push(
      `Revenue grew ${revenue.growthRate7d.toFixed(1)}% this week — ensure stock levels can meet rising demand`,
    );
  }

  // Waste recommendation
  if (overallCancelRate >= 15) {
    recommendations.push(
      `Cancellation rate is ${overallCancelRate}% — review top cancelled items and consider smaller batch prep`,
    );
  }

  // Underperforming items
  const underperformers = performance.filter((p) => p.tier === "UNDERPERFORMING");
  if (underperformers.length > 0) {
    const names = underperformers
      .slice(0, 3)
      .map((p) => p.name)
      .join(", ");
    recommendations.push(
      `${underperformers.length} item(s) underperforming: ${names} — consider discontinuing or repricing`,
    );
  }

  // At-risk customers
  if ((atRiskSeg?.count ?? 0) > 0) {
    recommendations.push(
      `${atRiskSeg?.count} customers at risk of churning — targeted offers could help retain them`,
    );
  }

  // Demand spikes
  const increaseItems = forecast.filter((f) => f.action === "INCREASE");
  if (increaseItems.length > 0) {
    const names = increaseItems
      .slice(0, 3)
      .map((f) => f.name)
      .join(", ");
    recommendations.push(
      `Increase prep for ${increaseItems.length} item(s) tomorrow: ${names}`,
    );
  }

  // Add waste pattern insights if we have room
  for (const p of waste.patterns) {
    if (recommendations.length >= 5) break;
    recommendations.push(p.pattern);
  }

  return {
    generatedAt: now.toISOString(),
    period: {
      days,
      from: dateKey(startDate),
      to: dateKey(now),
    },
    kpis,
    topItems,
    demandAlerts,
    wasteAlerts: waste.patterns,
    recommendations: recommendations.slice(0, 5),
  };
}
