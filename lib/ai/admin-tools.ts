import { db } from "@/lib/db";
import { menuItem, discount } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSummary } from "@/lib/statistics";
import { getFullAnalytics } from "@/lib/analytics";
import {
  getDemandForecast,
  getRevenueTrendAnalysis,
  getItemPerformanceScores,
  getWasteAnalysis,
  getCustomerSegmentation,
  getOptimalPrepQuantities,
} from "@/lib/ml/admin-insights";
import type Anthropic from "@anthropic-ai/sdk";

// ─── Context passed to every admin tool handler ──────────

export interface AdminToolContext {
  userId: string;
  orgId: string;
}

// ─── Tool Definitions (Claude tool_use format) ───────────

export const ADMIN_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_todays_summary",
    description:
      "Get today's order summary including total orders, revenue, status breakdown, and payment split.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_order_analytics",
    description:
      "Get order analytics: item breakdown, stock recommendations, discount suggestions, revenue by category, payment breakdown, and peak hours.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Number of days to analyze. Default: 30",
        },
      },
      required: [],
    },
  },
  {
    name: "get_demand_forecast",
    description:
      "Get ML-based demand forecast for tomorrow. Shows predicted quantities, confidence ranges, and recommended prep actions per item.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Days of history to use for the forecast. Default: 30",
        },
      },
      required: [],
    },
  },
  {
    name: "get_revenue_trends",
    description:
      "Get revenue trend analysis: daily revenue with moving averages, growth rates, anomalies, and 7-day projections.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Days of history to analyze. Default: 60",
        },
      },
      required: [],
    },
  },
  {
    name: "get_item_performance",
    description:
      "Get performance scores (0-100) for each menu item with tier classification and breakdown by sales, revenue, growth, satisfaction, and cancellations.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Days of history to score. Default: 30",
        },
      },
      required: [],
    },
  },
  {
    name: "get_waste_analysis",
    description:
      "Get waste and cancellation analysis: top cancelled items, cancellation patterns by hour/day, revenue lost, and detected waste patterns.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Days of history to analyze. Default: 30",
        },
      },
      required: [],
    },
  },
  {
    name: "get_customer_segments",
    description:
      "Get customer segmentation: HIGH_VALUE, REGULAR, OCCASIONAL, and AT_RISK segments with counts, avg order value, and revenue.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: {
          type: "number",
          description: "Days of history for segmentation. Default: 60",
        },
      },
      required: [],
    },
  },
  {
    name: "get_optimal_prep",
    description:
      "Get optimal prep quantities for today. Shows how much of each item to prepare based on historical demand, day-of-week patterns, and trends.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_menu_items",
    description:
      "Get all menu items with current availability, prices, and units. Includes both available and unavailable items.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_active_discounts",
    description:
      "Get all currently active discounts with the associated menu item name, discount type, value, and reason.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

// ─── Tool Dispatcher ─────────────────────────────────────

export async function executeAdminTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: AdminToolContext,
): Promise<string> {
  switch (toolName) {
    case "get_todays_summary":
      return handleGetTodaysSummary(ctx);
    case "get_order_analytics":
      return handleGetOrderAnalytics(ctx, input);
    case "get_demand_forecast":
      return handleGetDemandForecast(ctx, input);
    case "get_revenue_trends":
      return handleGetRevenueTrends(ctx, input);
    case "get_item_performance":
      return handleGetItemPerformance(ctx, input);
    case "get_waste_analysis":
      return handleGetWasteAnalysis(ctx, input);
    case "get_customer_segments":
      return handleGetCustomerSegments(ctx, input);
    case "get_optimal_prep":
      return handleGetOptimalPrep(ctx);
    case "get_menu_items":
      return handleGetMenuItems(ctx);
    case "get_active_discounts":
      return handleGetActiveDiscounts(ctx);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ─── Helpers ─────────────────────────────────────────────

function formatError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ─── Tool Handlers ───────────────────────────────────────

async function handleGetTodaysSummary(
  ctx: AdminToolContext,
): Promise<string> {
  try {
    const { summary } = await getSummary({ organizationId: ctx.orgId });
    return JSON.stringify({
      totalOrders: summary.totalOrders,
      totalRevenue: summary.totalRevenue,
      byStatus: summary.byStatus,
      payment: summary.payment,
      preOrders: summary.preOrders,
    });
  } catch (e) {
    return JSON.stringify({ error: `Failed to get summary: ${formatError(e)}` });
  }
}

async function handleGetOrderAnalytics(
  ctx: AdminToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const days = typeof input.days === "number" ? input.days : 30;
    const data = await getFullAnalytics(days, ctx.orgId);
    return JSON.stringify({
      itemBreakdown: data.itemBreakdown.slice(0, 20),
      recommendations: data.recommendations.slice(0, 10),
      discountSuggestions: data.discountSuggestions.slice(0, 10),
      revenueByCategory: data.revenueByCategory,
      paymentBreakdown: data.paymentBreakdown,
      peakHours: data.peakHours,
    });
  } catch (e) {
    return JSON.stringify({ error: `Failed to get analytics: ${formatError(e)}` });
  }
}

async function handleGetDemandForecast(
  ctx: AdminToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const days = typeof input.days === "number" ? input.days : 30;
    const forecast = await getDemandForecast(ctx.orgId, days);
    return JSON.stringify(
      forecast.map((f) => ({
        name: f.name,
        category: f.category,
        forecastQty: f.forecastQty,
        confidenceLow: f.confidenceLow,
        confidenceHigh: f.confidenceHigh,
        action: f.action,
        recentAvg: f.recentAvg,
      })),
    );
  } catch (e) {
    return JSON.stringify({ error: `Failed to get forecast: ${formatError(e)}` });
  }
}

async function handleGetRevenueTrends(
  ctx: AdminToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const days = typeof input.days === "number" ? input.days : 60;
    const trends = await getRevenueTrendAnalysis(ctx.orgId, days);
    return JSON.stringify({
      totalRevenue: trends.totalRevenue,
      avgDailyRevenue: trends.avgDailyRevenue,
      growthRate7d: trends.growthRate7d,
      growthRate30d: trends.growthRate30d,
      anomalies: trends.anomalies,
      projectedRevenue: trends.projectedRevenue,
      recentDays: trends.dailyRevenue.slice(-7),
    });
  } catch (e) {
    return JSON.stringify({ error: `Failed to get revenue trends: ${formatError(e)}` });
  }
}

async function handleGetItemPerformance(
  ctx: AdminToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const days = typeof input.days === "number" ? input.days : 30;
    const scores = await getItemPerformanceScores(ctx.orgId, days);
    return JSON.stringify(
      scores.map((s) => ({
        name: s.name,
        category: s.category,
        score: s.score,
        tier: s.tier,
        totalSold: s.totalSold,
        totalRevenue: s.totalRevenue,
        avgRating: s.avgRating,
        cancellationRate: s.cancellationRate,
      })),
    );
  } catch (e) {
    return JSON.stringify({ error: `Failed to get item performance: ${formatError(e)}` });
  }
}

async function handleGetWasteAnalysis(
  ctx: AdminToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const days = typeof input.days === "number" ? input.days : 30;
    const waste = await getWasteAnalysis(ctx.orgId, days);
    return JSON.stringify({
      totalCancelled: waste.totalCancelled,
      totalRevenueLost: waste.totalRevenueLost,
      topCancelledItems: waste.topCancelledItems.slice(0, 10),
      cancellationByHour: waste.cancellationByHour,
      cancellationByDay: waste.cancellationByDay,
      topReasons: waste.topReasons,
      patterns: waste.patterns,
    });
  } catch (e) {
    return JSON.stringify({ error: `Failed to get waste analysis: ${formatError(e)}` });
  }
}

async function handleGetCustomerSegments(
  ctx: AdminToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const days = typeof input.days === "number" ? input.days : 60;
    const segmentation = await getCustomerSegmentation(ctx.orgId, days);
    return JSON.stringify({
      totalCustomers: segmentation.totalCustomers,
      segments: segmentation.segments,
      highlights: segmentation.highlights,
    });
  } catch (e) {
    return JSON.stringify({ error: `Failed to get customer segments: ${formatError(e)}` });
  }
}

async function handleGetOptimalPrep(
  ctx: AdminToolContext,
): Promise<string> {
  try {
    const prep = await getOptimalPrepQuantities(ctx.orgId);
    return JSON.stringify(
      prep.map((p) => ({
        name: p.name,
        category: p.category,
        optimalQty: p.optimalQty,
        confidence: p.confidence,
        currentStock: p.currentStock,
        prepNeeded: p.prepNeeded,
      })),
    );
  } catch (e) {
    return JSON.stringify({ error: `Failed to get prep quantities: ${formatError(e)}` });
  }
}

async function handleGetMenuItems(
  ctx: AdminToolContext,
): Promise<string> {
  try {
    const items = await db
      .select({
        id: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        category: menuItem.category,
        available: menuItem.available,
        availableUnits: menuItem.availableUnits,
        subscribable: menuItem.subscribable,
      })
      .from(menuItem)
      .where(eq(menuItem.organizationId, ctx.orgId));
    return JSON.stringify(items);
  } catch (e) {
    return JSON.stringify({ error: `Failed to get menu items: ${formatError(e)}` });
  }
}

async function handleGetActiveDiscounts(
  ctx: AdminToolContext,
): Promise<string> {
  try {
    const discounts = await db
      .select({
        id: discount.id,
        menuItemName: menuItem.name,
        type: discount.type,
        value: discount.value,
        reason: discount.reason,
        mode: discount.mode,
        startDate: discount.startDate,
        endDate: discount.endDate,
      })
      .from(discount)
      .innerJoin(menuItem, eq(discount.menuItemId, menuItem.id))
      .where(
        and(
          eq(menuItem.organizationId, ctx.orgId),
          eq(discount.active, true),
        ),
      );
    return JSON.stringify(discounts);
  } catch (e) {
    return JSON.stringify({ error: `Failed to get discounts: ${formatError(e)}` });
  }
}
