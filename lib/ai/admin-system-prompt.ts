import { db } from "@/lib/db";
import { menuItem } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSummary } from "@/lib/statistics";
import { getAdminInsightsSummary } from "@/lib/ml/admin-insights";

// ─── Types ───────────────────────────────────────────────

export interface AdminSystemPromptContext {
  userId: string;
  userName: string;
  orgId: string;
  currentHour: number;
  currentDay: string;
  totalOrders: number;
  revenue: number;
  served: number;
  cancelled: number;
  paidAmount: number;
  unpaidAmount: number;
  totalItems: number;
  availableCount: number;
  insightsSummary: string;
}

// ─── Build Context ───────────────────────────────────────

/**
 * Gather dynamic per-request context for the admin system prompt.
 * Prefetches today's summary, menu counts, and ML insights.
 */
export async function buildAdminSystemPromptContext(
  userId: string,
  userName: string,
  orgId: string,
): Promise<AdminSystemPromptContext> {
  const now = new Date();
  const currentHour = now.getHours();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentDay = days[now.getDay()];

  // Fetch today's order summary, menu counts, and ML insights in parallel
  const [summaryResult, menuItems, insights] = await Promise.all([
    getSummary({ organizationId: orgId }).catch(() => null),
    db
      .select({
        available: menuItem.available,
      })
      .from(menuItem)
      .where(eq(menuItem.organizationId, orgId)),
    getAdminInsightsSummary(orgId).catch(() => null),
  ]);

  const summary = summaryResult?.summary;
  const totalItems = menuItems.length;
  const availableCount = menuItems.filter((m) => m.available).length;

  // Build concise insights bullet points
  let insightsSummary = "No insights available.";
  if (insights) {
    const bullets: string[] = [];

    if (insights.kpis.revenueGrowth7d !== 0) {
      const direction = insights.kpis.revenueGrowth7d > 0 ? "↑" : "↓";
      bullets.push(
        `Revenue trend: ${direction} ${Math.abs(insights.kpis.revenueGrowth7d).toFixed(1)}% (7d)`,
      );
    }

    if (insights.kpis.overallCancelRate > 5) {
      bullets.push(
        `Cancel rate: ${insights.kpis.overallCancelRate.toFixed(1)}% — needs attention`,
      );
    }

    if (insights.kpis.atRiskCustomers > 0) {
      bullets.push(`${insights.kpis.atRiskCustomers} at-risk customers detected`);
    }

    for (const alert of insights.demandAlerts.slice(0, 3)) {
      bullets.push(`${alert.name}: ${alert.action} ~${alert.forecastQty} units`);
    }

    for (const rec of insights.recommendations.slice(0, 3)) {
      bullets.push(rec);
    }

    if (bullets.length > 0) {
      insightsSummary = bullets.map((b) => `- ${b}`).join("\n");
    }
  }

  return {
    userId,
    userName,
    orgId,
    currentHour,
    currentDay,
    totalOrders: summary?.totalOrders ?? 0,
    revenue: summary?.totalRevenue ?? 0,
    served: summary?.byStatus.SERVED ?? 0,
    cancelled: summary?.byStatus.CANCELLED ?? 0,
    paidAmount: summary?.payment.paidAmount ?? 0,
    unpaidAmount: summary?.payment.unpaidAmount ?? 0,
    totalItems,
    availableCount,
    insightsSummary,
  };
}

// ─── System Prompt ───────────────────────────────────────

export function buildAdminSystemPrompt(ctx: AdminSystemPromptContext): string {
  const mealPeriod = getMealPeriod(ctx.currentHour);

  const fmtCompact = (n: number): string => {
    if (n >= 100_000) return `${(n / 1_000).toFixed(1)}K`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(0);
  };

  return `You are Certe Admin Assistant, a very brief AI helper for canteen administrators.

## CRITICAL RULES
1. **Be EXTREMELY brief.** Max 1-2 short sentences per response. Prefer tool calls over guessing.
2. **Tool calls first.** Always call a tool before answering data questions. NEVER guess numbers.
3. **No filler.** No greetings, no "Sure!", no "Here's what I found", no "Let me check".
4. **Data-driven only.** Only reference data from tools or this context. Never hallucinate.
5. **Currency**: ₹ (Indian Rupees). Use compact numbers (e.g., ₹1.2K not ₹1,200).
6. **Actionable insights.** End with a recommendation when possible.
7. **When asked about prep/quantities**, always call get_optimal_prep or get_demand_forecast first.
8. **When asked about performance/trends**, always call relevant tool first.
9. **When asked to perform actions** (open/close canteens, change items, manage orders), use the action tools directly. Confirm after executing.
10. **For bulk operations**, always retrieve the list first (get_canteens, get_menu_items, get_active_orders) then perform the action.

## Scope
You have **full access to all canteens** within this organization. All tools query org-wide data across every canteen. The context below is the organization-level aggregate, not a single canteen. You can answer about any canteen or the overall organization. Never say you lack access to data — use your tools to retrieve it.

## Action Capabilities
You can **directly execute** these operations:
- **Open/close canteens** — toggle_canteen_status (get_canteens to find IDs first)
- **Show/hide menu items** — set_item_availability (get_menu_items to find IDs first)
- **Change stock quantities** — update_item_quantity (set to 0 for sold out, null for unlimited, or any positive number)
- **Bulk stock updates** — use get_menu_items to find items by category/name, then update_item_quantity for each
- **Start preparing / cancel orders** — update_order_status (get_active_orders to find IDs first)
- **Create menu items** — create_menu_items (use when told to add new items like "samosa - 25, vada pav - 20" where the number is the price; if a default quantity is mentioned apply it)

When the admin asks to perform any of these, **do it immediately** — don't just describe what to do.
For bulk operations like "set stock to 50 for all snack items", retrieve items first, filter by criteria, then update each one.
For menu creation: parse the item name and price from natural language, infer the category (SNACKS by default), apply default_quantity if given. Call get_canteens first if no canteen_id is known.

## Context
- **Admin**: ${ctx.userName}
- **Time**: ${ctx.currentDay}, ${formatHour(ctx.currentHour)} (${mealPeriod})
- **Today (org-wide)**: ${ctx.totalOrders} orders, ₹${fmtCompact(ctx.revenue)} revenue, ${ctx.served} served, ${ctx.cancelled} cancelled
- **Payment**: ₹${fmtCompact(ctx.paidAmount)} collected, ₹${fmtCompact(ctx.unpaidAmount)} pending
- **Menu**: ${ctx.totalItems} items (${ctx.availableCount} available)

## Key Insights
${ctx.insightsSummary}`;
}

// ─── Helpers ─────────────────────────────────────────────

function getMealPeriod(hour: number): string {
  if (hour < 10) return "Morning / Breakfast time";
  if (hour < 12) return "Mid-morning break";
  if (hour < 14) return "Lunch time";
  if (hour < 16) return "Afternoon snack time";
  return "After school hours";
}

function formatHour(hour: number): string {
  if (hour === 0) return "12:00 AM";
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return "12:00 PM";
  return `${hour - 12}:00 PM`;
}
