import { db } from "@/lib/db";
import { menuItem, discount, canteen, order, orderItem } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
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
import { broadcast } from "@/lib/sse";
import { incrementUnits } from "@/lib/units";
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

  // ─── ACTION TOOLS ─────────────────────────────────────

  {
    name: "toggle_canteen_status",
    description:
      "Open or close one or multiple canteens. Changes canteen status between ACTIVE (open) and INACTIVE (closed).",
    input_schema: {
      type: "object" as const,
      properties: {
        canteen_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of canteen IDs to toggle. Use get_canteens first to find IDs.",
        },
        status: {
          type: "string",
          enum: ["ACTIVE", "INACTIVE"],
          description: "Target status: ACTIVE = open, INACTIVE = closed.",
        },
      },
      required: ["canteen_ids", "status"],
    },
  },
  {
    name: "get_canteens",
    description:
      "Get all canteens in the organization with their current status (ACTIVE/INACTIVE), name, and location.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "set_item_availability",
    description:
      "Make one or multiple menu items available or unavailable for ordering.",
    input_schema: {
      type: "object" as const,
      properties: {
        item_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of menu item IDs to update. Use get_menu_items first to find IDs.",
        },
        available: {
          type: "boolean",
          description: "true = available for ordering, false = unavailable.",
        },
      },
      required: ["item_ids", "available"],
    },
  },
  {
    name: "update_item_quantity",
    description:
      "Change the available units (stock quantity) of a menu item. Set to 0 for sold out, null for unlimited.",
    input_schema: {
      type: "object" as const,
      properties: {
        item_id: {
          type: "string",
          description: "The menu item ID to update.",
        },
        available_units: {
          type: ["number", "null"],
          description: "New unit count. 0 = sold out, null = unlimited, positive number = exact stock.",
        },
      },
      required: ["item_id", "available_units"],
    },
  },
  {
    name: "update_order_status",
    description:
      "Change the status of one or multiple orders. Valid transitions: PLACED → PREPARING or CANCELLED, PREPARING → SERVED. Cancelling a paid order refunds wallet and restores stock.",
    input_schema: {
      type: "object" as const,
      properties: {
        order_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of order IDs to update.",
        },
        status: {
          type: "string",
          enum: ["PREPARING", "SERVED", "CANCELLED"],
          description: "Target status for the orders.",
        },
      },
      required: ["order_ids", "status"],
    },
  },
  {
    name: "get_active_orders",
    description:
      "Get all currently active (non-terminal) orders: PLACED and PREPARING. Use this to find order IDs before changing status.",
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
    case "toggle_canteen_status":
      return handleToggleCanteenStatus(ctx, input);
    case "get_canteens":
      return handleGetCanteens(ctx);
    case "set_item_availability":
      return handleSetItemAvailability(ctx, input);
    case "update_item_quantity":
      return handleUpdateItemQuantity(ctx, input);
    case "update_order_status":
      return handleUpdateOrderStatus(ctx, input);
    case "get_active_orders":
      return handleGetActiveOrders(ctx);
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

// ─── ACTION Tool Handlers ────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  PLACED: ["PREPARING", "CANCELLED"],
  PREPARING: ["SERVED"],
  SERVED: [],
  CANCELLED: [],
};

async function handleToggleCanteenStatus(
  ctx: AdminToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const canteenIds = input.canteen_ids as string[];
    const status = input.status as "ACTIVE" | "INACTIVE";

    if (!canteenIds?.length) return JSON.stringify({ error: "No canteen IDs provided" });
    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      return JSON.stringify({ error: "Status must be ACTIVE or INACTIVE" });
    }

    const results: { id: string; name: string; status: string }[] = [];

    for (const id of canteenIds) {
      const [existing] = await db
        .select({ id: canteen.id, name: canteen.name, organizationId: canteen.organizationId })
        .from(canteen)
        .where(and(eq(canteen.id, id), eq(canteen.organizationId, ctx.orgId)))
        .limit(1);

      if (!existing) {
        results.push({ id, name: "unknown", status: "NOT_FOUND" });
        continue;
      }

      await db
        .update(canteen)
        .set({ status, updatedAt: new Date() })
        .where(eq(canteen.id, id));

      results.push({ id, name: existing.name, status });
    }

    broadcast("menu-updated");
    return JSON.stringify({
      success: true,
      message: `Updated ${results.filter((r) => r.status !== "NOT_FOUND").length} canteen(s)`,
      results,
    });
  } catch (e) {
    return JSON.stringify({ error: `Failed to toggle canteen: ${formatError(e)}` });
  }
}

async function handleGetCanteens(
  ctx: AdminToolContext,
): Promise<string> {
  try {
    const canteens = await db
      .select({
        id: canteen.id,
        name: canteen.name,
        location: canteen.location,
        status: canteen.status,
      })
      .from(canteen)
      .where(eq(canteen.organizationId, ctx.orgId));
    return JSON.stringify(canteens);
  } catch (e) {
    return JSON.stringify({ error: `Failed to get canteens: ${formatError(e)}` });
  }
}

async function handleSetItemAvailability(
  ctx: AdminToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const itemIds = input.item_ids as string[];
    const available = input.available as boolean;

    if (!itemIds?.length) return JSON.stringify({ error: "No item IDs provided" });

    // Verify items belong to this org
    const items = await db
      .select({ id: menuItem.id, name: menuItem.name })
      .from(menuItem)
      .where(
        and(
          eq(menuItem.organizationId, ctx.orgId),
          inArray(menuItem.id, itemIds),
        ),
      );

    if (items.length === 0) return JSON.stringify({ error: "No matching items found" });

    await db
      .update(menuItem)
      .set({ available, updatedAt: new Date() })
      .where(
        and(
          eq(menuItem.organizationId, ctx.orgId),
          inArray(menuItem.id, itemIds),
        ),
      );

    broadcast("menu-updated");
    return JSON.stringify({
      success: true,
      message: `${items.length} item(s) marked ${available ? "available" : "unavailable"}`,
      items: items.map((i) => ({ id: i.id, name: i.name, available })),
    });
  } catch (e) {
    return JSON.stringify({ error: `Failed to update availability: ${formatError(e)}` });
  }
}

async function handleUpdateItemQuantity(
  ctx: AdminToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const itemId = input.item_id as string;
    const units = input.available_units as number | null;

    if (!itemId) return JSON.stringify({ error: "No item ID provided" });

    const [item] = await db
      .select({ id: menuItem.id, name: menuItem.name, availableUnits: menuItem.availableUnits })
      .from(menuItem)
      .where(and(eq(menuItem.id, itemId), eq(menuItem.organizationId, ctx.orgId)))
      .limit(1);

    if (!item) return JSON.stringify({ error: "Item not found" });

    await db
      .update(menuItem)
      .set({ availableUnits: units, updatedAt: new Date() })
      .where(eq(menuItem.id, itemId));

    broadcast("menu-updated");
    return JSON.stringify({
      success: true,
      message: `${item.name}: quantity updated from ${item.availableUnits ?? "unlimited"} to ${units ?? "unlimited"}`,
      item: { id: item.id, name: item.name, previousUnits: item.availableUnits, newUnits: units },
    });
  } catch (e) {
    return JSON.stringify({ error: `Failed to update quantity: ${formatError(e)}` });
  }
}

async function handleUpdateOrderStatus(
  ctx: AdminToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const orderIds = input.order_ids as string[];
    const newStatus = input.status as string;

    if (!orderIds?.length) return JSON.stringify({ error: "No order IDs provided" });
    if (!["PREPARING", "SERVED", "CANCELLED"].includes(newStatus)) {
      return JSON.stringify({ error: "Invalid status. Must be PREPARING, SERVED, or CANCELLED" });
    }

    const results: { orderId: string; tokenCode: string | null; from: string; to: string; success: boolean; error?: string }[] = [];

    for (const orderId of orderIds) {
      const [existing] = await db
        .select({
          id: order.id,
          status: order.status,
          tokenCode: order.tokenCode,
          totalAmount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          childId: order.childId,
        })
        .from(order)
        .where(eq(order.id, orderId))
        .limit(1);

      if (!existing) {
        results.push({ orderId, tokenCode: null, from: "?", to: newStatus, success: false, error: "Not found" });
        continue;
      }

      const allowed = VALID_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(newStatus)) {
        results.push({
          orderId,
          tokenCode: existing.tokenCode,
          from: existing.status,
          to: newStatus,
          success: false,
          error: `Cannot go from ${existing.status} to ${newStatus}`,
        });
        continue;
      }

      // Handle cancellation with refund
      if (newStatus === "CANCELLED" && existing.paymentStatus === "PAID") {
        const items = await db
          .select({ menuItemId: orderItem.menuItemId, quantity: orderItem.quantity })
          .from(orderItem)
          .where(eq(orderItem.orderId, orderId));

        if (items.length > 0) {
          await incrementUnits(items);
        }
      }

      await db
        .update(order)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(order.id, orderId));

      results.push({
        orderId,
        tokenCode: existing.tokenCode,
        from: existing.status,
        to: newStatus,
        success: true,
      });
    }

    broadcast("orders-updated");
    broadcast("menu-updated");

    const successCount = results.filter((r) => r.success).length;
    return JSON.stringify({
      success: successCount > 0,
      message: `${successCount}/${orderIds.length} order(s) updated to ${newStatus}`,
      results,
    });
  } catch (e) {
    return JSON.stringify({ error: `Failed to update orders: ${formatError(e)}` });
  }
}

async function handleGetActiveOrders(
  ctx: AdminToolContext,
): Promise<string> {
  try {
    const activeOrders = await db
      .select({
        id: order.id,
        tokenCode: order.tokenCode,
        status: order.status,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
      })
      .from(order)
      .where(
        inArray(order.status, ["PLACED", "PREPARING"]),
      );
    return JSON.stringify(activeOrders);
  } catch (e) {
    return JSON.stringify({ error: `Failed to get active orders: ${formatError(e)}` });
  }
}
