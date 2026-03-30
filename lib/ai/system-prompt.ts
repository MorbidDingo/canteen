import { db } from "@/lib/db";
import {
  child,
  wallet,
  menuItem,
  certeSubscription,
  parentControl,
} from "@/lib/db/schema";
import { eq, and, gte, desc, inArray, asc } from "drizzle-orm";
import { MENU_CATEGORIES } from "@/lib/constants";
import { getWalletForecast, type WalletForecast } from "@/lib/ml/predictive-wallet";
import { getMenuPopularity, type MenuPopularityItem, getMenuFeedbackStats, type MenuItemFeedbackStats } from "@/lib/ml/data-collector";
import { getRecommendations, type ScoredRecommendation } from "@/lib/ml/recommendation-engine";

// ─── Types ───────────────────────────────────────────────

interface ChildSummary {
  id: string;
  name: string;
  className: string | null;
  section: string | null;
}

interface WalletInsight {
  childName: string;
  forecast: WalletForecast;
}

interface PopularItem {
  menuItemId: string;
  name: string;
  category: string;
  price: number;
  totalOrdered: number;
  canteenId: string | null;
  canteenName: string | null;
}

interface RecommendedItem {
  menuItemId: string;
  name: string;
  category: string;
  price: number;
  score: number;
  reasons: string[];
  canteenId: string | null;
  canteenName: string | null;
}

interface FeedbackSummary {
  menuItemId: string;
  name: string;
  avgHealthy: number;
  avgTaste: number;
  avgQuantity: number;
  totalReviews: number;
  recentReviews: string[];
}

interface SystemPromptContext {
  userId: string;
  userName: string;
  userRole: string;
  orgId: string;
  children: ChildSummary[];
  walletBalance: number;
  certePlusActive: boolean;
  menuCategories: string[];
  currentHour: number;
  currentDay: string;
  walletInsights: WalletInsight[];
  popularItems: PopularItem[];
  todaysPicks: RecommendedItem[];
  feedbackStats: FeedbackSummary[];
}

// ─── Build Context ───────────────────────────────────────

/**
 * Gather dynamic per-request context for the system prompt.
 * Prefetches common data so Claude doesn't need tool calls for the happy path.
 */
export async function buildSystemPromptContext(
  userId: string,
  userName: string,
  userRole: string,
  orgId: string,
): Promise<SystemPromptContext> {
  // Fetch children
  const children = await db
    .select({
      id: child.id,
      name: child.name,
      className: child.className,
      section: child.section,
    })
    .from(child)
    .where(eq(child.parentId, userId));

  // Fetch wallet balance
  const childIds = children.map((c) => c.id);
  let walletBalance = 0;
  if (childIds.length > 0) {
    const [walletRow] = await db
      .select({ balance: wallet.balance })
      .from(wallet)
      .where(inArray(wallet.childId, childIds))
      .orderBy(asc(wallet.createdAt))
      .limit(1);
    walletBalance = walletRow?.balance ?? 0;
  }

  // Check Certe+ status
  const now = new Date();
  const [activeSub] = await db
    .select({ id: certeSubscription.id })
    .from(certeSubscription)
    .where(
      and(
        eq(certeSubscription.parentId, userId),
        eq(certeSubscription.status, "ACTIVE"),
        gte(certeSubscription.endDate, now),
      ),
    )
    .limit(1);

  // Available categories from current menu
  const menuCategories = Object.keys(MENU_CATEGORIES);

  const currentHour = now.getHours();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentDay = days[now.getDay()];

  // Fetch wallet forecasts for personalization
  const walletInsights: WalletInsight[] = [];
  for (const c of children) {
    try {
      const forecast = await getWalletForecast(c.id, orgId);
      walletInsights.push({ childName: c.name, forecast });
    } catch {
      // Skip if forecast fails — non-critical
    }
  }

  // Fetch popular items (org-wide, last 7 days)
  let popularItems: PopularItem[] = [];
  try {
    const raw = await getMenuPopularity(orgId, 7);
    popularItems = raw
      .sort((a, b) => b.totalOrdered - a.totalOrdered)
      .slice(0, 8)
      .map((p) => ({
        menuItemId: p.menuItemId,
        name: p.name,
        category: p.category,
        price: p.price,
        totalOrdered: p.totalOrdered,
        canteenId: p.canteenId ?? null,
        canteenName: p.canteenName ?? null,
      }));
  } catch {
    // Non-critical
  }

  // Fetch personalised "today's picks" for first child
  let todaysPicks: RecommendedItem[] = [];
  if (children.length > 0) {
    try {
      const recs = await getRecommendations(children[0].id, orgId, {
        className: children[0].className,
        maxResults: 6,
        currentHour,
        currentDayOfWeek: now.getDay(),
        budgetRemaining: walletBalance,
      });
      todaysPicks = recs.map((r) => ({
        menuItemId: r.menuItemId,
        name: r.name,
        category: r.category,
        price: r.price,
        score: r.score,
        reasons: r.reasons,
        canteenId: r.canteenId ?? null,
        canteenName: r.canteenName ?? null,
      }));
    } catch {
      // Non-critical
    }
  }

  // Fetch feedback stats (aggregated ratings per item, last 30 days)
  let feedbackStats: FeedbackSummary[] = [];
  try {
    const raw = await getMenuFeedbackStats(orgId, 30);
    feedbackStats = raw
      .sort((a, b) => b.totalReviews - a.totalReviews)
      .slice(0, 10)
      .map((f) => ({
        menuItemId: f.menuItemId,
        name: f.name,
        avgHealthy: f.avgHealthy,
        avgTaste: f.avgTaste,
        avgQuantity: f.avgQuantity,
        totalReviews: f.totalReviews,
        recentReviews: f.recentReviews,
      }));
  } catch {
    // Non-critical
  }

  return {
    userId,
    userName,
    userRole,
    orgId,
    children,
    walletBalance,
    certePlusActive: !!activeSub,
    menuCategories,
    currentHour,
    currentDay,
    walletInsights,
    popularItems,
    todaysPicks,
    feedbackStats,
  };
}

// ─── System Prompt ───────────────────────────────────────

export function buildSystemPrompt(ctx: SystemPromptContext): string {
  const childrenList = ctx.children.length > 0
    ? ctx.children
        .map((c) => `  - ${c.name} (ID: ${c.id}${c.className ? `, Class: ${c.className}` : ""}${c.section ? ` ${c.section}` : ""})`)
        .join("\n")
    : "  No children linked yet.";

  const mealPeriod = getMealPeriod(ctx.currentHour);

  // Build wallet insights section
  const walletInsightsText = ctx.walletInsights.length > 0
    ? ctx.walletInsights.map((w) => {
        const f = w.forecast;
        const depletion = f.daysUntilDepletion != null
          ? `depletes in ${f.daysUntilDepletion} days`
          : "stable";
        return `  - ${w.childName}: ₹${f.currentBalance.toFixed(0)} balance, avg ₹${f.projectedDailySpend.toFixed(0)}/day, ${depletion}, recharge suggestion ₹${f.rechargeRecommendation}, risk: ${f.dailyLimitExceedanceRisk}`;
      }).join("\n")
    : "  No forecast data available.";

  // Build popular items section
  const popularText = ctx.popularItems.length > 0
    ? ctx.popularItems.map((p) =>
        `  - ${p.name} (ID: ${p.menuItemId}, ₹${p.price}, ${p.category}, canteen: ${p.canteenName ?? "unknown"}, canteenId: ${p.canteenId ?? ""}, ordered ${p.totalOrdered}× this week)`
      ).join("\n")
    : "  No popularity data yet.";

  // Build today's picks section
  const picksText = ctx.todaysPicks.length > 0
    ? ctx.todaysPicks.map((r) =>
        `  - ${r.name} (ID: ${r.menuItemId}, ₹${r.price}, ${r.category}, canteen: ${r.canteenName ?? "unknown"}, canteenId: ${r.canteenId ?? ""}, score: ${r.score.toFixed(2)}, reasons: ${r.reasons.join(", ")})`
      ).join("\n")
    : "  No personalised picks available.";

  // Build feedback stats section
  const feedbackText = ctx.feedbackStats.length > 0
    ? ctx.feedbackStats.map((f) => {
        const reviews = f.recentReviews.length > 0
          ? ` | Reviews: "${f.recentReviews.join('", "')}"`
          : "";
        return `  - ${f.name} (ID: ${f.menuItemId}): healthy ${f.avgHealthy}/5, taste ${f.avgTaste}/5, qty ${f.avgQuantity}/5, ${f.totalReviews} reviews${reviews}`;
      }).join("\n")
    : "  No feedback data yet.";

  return `You are Certe+, a concise AI assistant for a school canteen app.

## CRITICAL RULES — FOLLOW STRICTLY
1. **Be extremely brief.** Max 2-3 short sentences per response. No filler, no greetings, no "Sure!", no "Here's what I found".
2. **ONLY use data from this system context or tool results.** NEVER invent, guess, or hallucinate menu items, prices, IDs, or any other data. If the system context or a tool does not provide the information, say you don't have that data and offer to look it up via tools.
3. **Action-oriented output ONLY.** When suggesting food items, wallet top-ups, or control changes, embed structured action markers that the app will render as buttons.
4. **Use these action markers in your response:**
   - For menu items (BROWSE only): \`[[MENU_ITEMS]]\` followed by a JSON array of {menuItemId, name, price, discountedPrice?, category, available, canteenId, canteenName, reasons?} on the next line, then \`[[/MENU_ITEMS]]\`
   - For wallet top-up: \`[[TOPUP:amount]]\` e.g. \`[[TOPUP:500]]\`
   - For control suggestion: \`[[CONTROL:type:value]]\` e.g. \`[[CONTROL:daily_limit:200]]\` or \`[[CONTROL:block_category:PACKED_FOOD]]\`
5. **Never output long paragraphs or bullet-point essays.**
6. **When showing menu items for browsing, always use the MENU_ITEMS marker** — never list items as plain text. Only include items whose menuItemId you received from the system context or a tool call.
7. **Currency**: ₹ (Indian Rupees). Never reveal internal IDs in text.
8. **Single child**: auto-use their ID. **Multi-child**: ask which child only when ambiguous.
9. **Low balance** (below ₹50): mention it briefly + add a TOPUP action.
10. **For "popular now" or "what's popular" queries**: use the Popular Items data below. For "today's picks" or "what should I order" queries: use the Today's Picks data below. ONLY reference items listed in those sections — never make up items.
11. **If Popular Items or Today's Picks are empty**: call the get_menu tool to fetch current items instead of guessing.

## ORDERING vs BROWSING
- When the user says "order X", "buy me X", "order my usual", "get me lunch", or any explicit **purchase intent**: use the \`place_order\` tool to place the order directly via wallet payment. Do NOT show MENU_ITEMS add-to-cart buttons. Flow: look up their history (get_order_history) or recommendations, confirm items + total with the user, then call place_order once they confirm.
- When the user says "show me the menu", "what's available", "what's good today": use MENU_ITEMS markers to let them browse and add items to cart themselves.
- For general accounts (no children), use the default child ID provided below — it represents the user themselves.

## Context
- **User**: ${ctx.userName} (${ctx.userRole})
- **Wallet**: ₹${ctx.walletBalance.toFixed(2)}
- **Time**: ${ctx.currentDay}, ${formatHour(ctx.currentHour)} (${mealPeriod})
- **Certe+**: ${ctx.certePlusActive ? "Active" : "Inactive"}
- **Children**:
${childrenList}
${ctx.children.length === 1 ? `\nDefault child ID: ${ctx.children[0].id}` : ""}

## Popular Items (org-wide, last 7 days)
${popularText}

## Today's Picks (personalised ML recommendations)
${picksText}

## Wallet Insights (ML Forecast)
${walletInsightsText}

## Food Ratings & Reviews (user feedback, last 30 days)
${feedbackText}

## Categories
${ctx.menuCategories.join(", ")}`;
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
