import { db } from "@/lib/db";
import {
  order,
  orderItem,
  menuItem,
  canteen,
  wallet,
  walletTransaction,
  parentControl,
  child,
  preOrder,
  preOrderItem,
  gateLog,
  orderFeedback,
  orderCancellationReason,
} from "@/lib/db/schema";
import { eq, and, gte, desc, sql, ne } from "drizzle-orm";

// ─── Helpers ─────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n + 1);
  return d;
}

// ─── Types ───────────────────────────────────────────────

export interface FoodHistoryItem {
  orderId: string;
  menuItemId: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  orderedAt: Date;
  dayOfWeek: number; // 0=Sun, 6=Sat
  hour: number;
}

export interface SpendingProfile {
  totalSpent: number;
  dailyAverage: number;
  dailyStdDev: number;
  dailySpending: { date: string; amount: number }[];
  peakDay: string | null;
  peakAmount: number;
}

export interface MenuPopularityItem {
  menuItemId: string;
  name: string;
  category: string;
  price: number;
  totalOrdered: number;
  uniqueBuyers: number;
  canteenId: string | null;
  canteenName: string | null;
  /** Breakdown by hour-of-day (0–23) */
  hourlyDistribution: Record<number, number>;
  /** Breakdown by day-of-week (0–6) */
  dayOfWeekDistribution: Record<number, number>;
}

export interface ParentControlsData {
  dailySpendLimit: number | null;
  perOrderLimit: number | null;
  blockedCategories: string[];
  blockedItemIds: string[];
}

export interface PeerBehaviorItem {
  menuItemId: string;
  name: string;
  category: string;
  orderCount: number;
  uniqueBuyers: number;
}

export interface WalletHistoryEntry {
  type: string;
  amount: number;
  balanceAfter: number;
  createdAt: Date;
}

export interface WalletSnapshot {
  currentBalance: number;
  history: WalletHistoryEntry[];
  topUpFrequencyPerWeek: number;
  avgTopUpAmount: number;
}

// ─── Data Collection Functions ───────────────────────────

/**
 * Get a child's food order history with timestamps, categories, and prices.
 */
export async function getUserFoodHistory(
  childId: string,
  orgId: string,
  days: number,
): Promise<FoodHistoryItem[]> {
  const since = daysAgo(days);

  const rows = await db
    .select({
      orderId: order.id,
      menuItemId: orderItem.menuItemId,
      name: menuItem.name,
      category: menuItem.category,
      price: orderItem.unitPrice,
      quantity: orderItem.quantity,
      orderedAt: order.createdAt,
    })
    .from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
    .where(
      and(
        eq(order.childId, childId),
        eq(menuItem.organizationId, orgId),
        gte(order.createdAt, since),
        ne(order.status, "CANCELLED"),
      ),
    )
    .orderBy(desc(order.createdAt));

  return rows.map((r) => ({
    orderId: r.orderId,
    menuItemId: r.menuItemId,
    name: r.name,
    category: r.category,
    price: r.price,
    quantity: r.quantity,
    orderedAt: new Date(r.orderedAt),
    dayOfWeek: new Date(r.orderedAt).getDay(),
    hour: new Date(r.orderedAt).getHours(),
  }));
}

/**
 * Compute daily spending stats and variance for a child.
 */
export async function getUserSpendingProfile(
  childId: string,
  orgId: string,
  days: number,
): Promise<SpendingProfile> {
  const history = await getUserFoodHistory(childId, orgId, days);

  // Aggregate by date
  const dailyMap = new Map<string, number>();
  for (const item of history) {
    const dk = item.orderedAt.toISOString().split("T")[0];
    dailyMap.set(dk, (dailyMap.get(dk) ?? 0) + item.price * item.quantity);
  }

  const dailySpending = Array.from(dailyMap.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const amounts = dailySpending.map((d) => d.amount);
  const totalSpent = amounts.reduce((s, v) => s + v, 0);
  const dailyAverage = amounts.length > 0 ? totalSpent / amounts.length : 0;

  // Standard deviation
  let dailyStdDev = 0;
  if (amounts.length > 1) {
    const variance =
      amounts.reduce((s, v) => s + (v - dailyAverage) ** 2, 0) / (amounts.length - 1);
    dailyStdDev = Math.sqrt(variance);
  }

  // Peak day
  let peakDay: string | null = null;
  let peakAmount = 0;
  for (const d of dailySpending) {
    if (d.amount > peakAmount) {
      peakAmount = d.amount;
      peakDay = d.date;
    }
  }

  return { totalSpent, dailyAverage, dailyStdDev, dailySpending, peakDay, peakAmount };
}

/**
 * Get menu item popularity within an org, broken down by time-of-day and day-of-week.
 */
export async function getMenuPopularity(
  orgId: string,
  days: number,
): Promise<MenuPopularityItem[]> {
  const since = daysAgo(days);

  const rows = await db
    .select({
      menuItemId: orderItem.menuItemId,
      name: menuItem.name,
      category: menuItem.category,
      price: menuItem.price,
      canteenId: menuItem.canteenId,
      canteenName: canteen.name,
      quantity: orderItem.quantity,
      userId: order.userId,
      orderedAt: order.createdAt,
    })
    .from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
    .leftJoin(canteen, eq(menuItem.canteenId, canteen.id))
    .where(
      and(
        eq(menuItem.organizationId, orgId),
        gte(order.createdAt, since),
        ne(order.status, "CANCELLED"),
      ),
    );

  const itemMap = new Map<
    string,
    {
      name: string;
      category: string;
      price: number;
      canteenId: string | null;
      canteenName: string | null;
      totalOrdered: number;
      buyers: Set<string>;
      hourly: Record<number, number>;
      dow: Record<number, number>;
    }
  >();

  for (const r of rows) {
    let entry = itemMap.get(r.menuItemId);
    if (!entry) {
      entry = {
        name: r.name,
        category: r.category,
        price: r.price,
        canteenId: r.canteenId ?? null,
        canteenName: r.canteenName ?? null,
        totalOrdered: 0,
        buyers: new Set(),
        hourly: {},
        dow: {},
      };
      itemMap.set(r.menuItemId, entry);
    }

    entry.totalOrdered += r.quantity;
    entry.buyers.add(r.userId);

    const dt = new Date(r.orderedAt);
    const hour = dt.getHours();
    const dow = dt.getDay();
    entry.hourly[hour] = (entry.hourly[hour] ?? 0) + r.quantity;
    entry.dow[dow] = (entry.dow[dow] ?? 0) + r.quantity;
  }

  return Array.from(itemMap.entries())
    .map(([menuItemId, e]) => ({
      menuItemId,
      name: e.name,
      category: e.category,
      price: e.price,
      canteenId: e.canteenId,
      canteenName: e.canteenName,
      totalOrdered: e.totalOrdered,
      uniqueBuyers: e.buyers.size,
      hourlyDistribution: e.hourly,
      dayOfWeekDistribution: e.dow,
    }))
    .sort((a, b) => b.totalOrdered - a.totalOrdered);
}

/**
 * Get parent controls for a child: spend limits, blocked categories/items.
 */
export async function getParentControls(childId: string): Promise<ParentControlsData> {
  const rows = await db
    .select()
    .from(parentControl)
    .where(eq(parentControl.childId, childId))
    .limit(1);

  if (rows.length === 0) {
    return {
      dailySpendLimit: null,
      perOrderLimit: null,
      blockedCategories: [],
      blockedItemIds: [],
    };
  }

  const pc = rows[0];
  return {
    dailySpendLimit: pc.dailySpendLimit,
    perOrderLimit: pc.perOrderLimit,
    blockedCategories: safeParseJsonArray(pc.blockedCategories),
    blockedItemIds: safeParseJsonArray(pc.blockedItemIds),
  };
}

/**
 * Get what peers (same class/grade within org) are ordering.
 */
export async function getPeerBehavior(
  orgId: string,
  className: string | null,
  days: number,
): Promise<PeerBehaviorItem[]> {
  const since = daysAgo(days);

  // Find peer childIds in the same class within the org
  const peerFilter = className
    ? and(eq(child.organizationId, orgId), eq(child.className, className))
    : eq(child.organizationId, orgId);

  const peers = await db
    .select({ id: child.id })
    .from(child)
    .where(peerFilter);

  if (peers.length === 0) return [];

  const peerIds = new Set(peers.map((p) => p.id));

  // Get their orders
  const rows = await db
    .select({
      menuItemId: orderItem.menuItemId,
      name: menuItem.name,
      category: menuItem.category,
      quantity: orderItem.quantity,
      childId: order.childId,
    })
    .from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
    .where(
      and(
        eq(menuItem.organizationId, orgId),
        gte(order.createdAt, since),
        ne(order.status, "CANCELLED"),
      ),
    );

  const itemMap = new Map<
    string,
    { name: string; category: string; count: number; buyers: Set<string> }
  >();

  for (const r of rows) {
    if (!r.childId || !peerIds.has(r.childId)) continue;

    let entry = itemMap.get(r.menuItemId);
    if (!entry) {
      entry = { name: r.name, category: r.category, count: 0, buyers: new Set() };
      itemMap.set(r.menuItemId, entry);
    }
    entry.count += r.quantity;
    entry.buyers.add(r.childId);
  }

  return Array.from(itemMap.entries())
    .map(([menuItemId, e]) => ({
      menuItemId,
      name: e.name,
      category: e.category,
      orderCount: e.count,
      uniqueBuyers: e.buyers.size,
    }))
    .sort((a, b) => b.orderCount - a.orderCount);
}

/**
 * Get wallet balance + transaction history for a child.
 */
export async function getWalletHistory(
  childId: string,
  days: number,
): Promise<WalletSnapshot> {
  const since = daysAgo(days);

  // Get wallet
  const wallets = await db
    .select()
    .from(wallet)
    .where(eq(wallet.childId, childId))
    .limit(1);

  const currentBalance = wallets.length > 0 ? wallets[0].balance : 0;
  const walletId = wallets.length > 0 ? wallets[0].id : null;

  if (!walletId) {
    return { currentBalance: 0, history: [], topUpFrequencyPerWeek: 0, avgTopUpAmount: 0 };
  }

  // Get transactions
  const txns = await db
    .select({
      type: walletTransaction.type,
      amount: walletTransaction.amount,
      balanceAfter: walletTransaction.balanceAfter,
      createdAt: walletTransaction.createdAt,
    })
    .from(walletTransaction)
    .where(and(eq(walletTransaction.walletId, walletId), gte(walletTransaction.createdAt, since)))
    .orderBy(desc(walletTransaction.createdAt));

  const history: WalletHistoryEntry[] = txns.map((t) => ({
    type: t.type,
    amount: t.amount,
    balanceAfter: t.balanceAfter,
    createdAt: new Date(t.createdAt),
  }));

  // Compute top-up frequency
  const topUps = history.filter((h) => h.type === "TOP_UP");
  const weeks = Math.max(days / 7, 1);
  const topUpFrequencyPerWeek = topUps.length / weeks;
  const avgTopUpAmount =
    topUps.length > 0
      ? topUps.reduce((s, t) => s + t.amount, 0) / topUps.length
      : 0;

  return { currentBalance, history, topUpFrequencyPerWeek, avgTopUpAmount };
}

// ─── Utilities ───────────────────────────────────────────

function safeParseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Order Feedback Data ─────────────────────────────────

export interface MenuItemFeedbackStats {
  menuItemId: string;
  name: string;
  category: string;
  avgHealthy: number;
  avgTaste: number;
  avgQuantity: number;
  totalReviews: number;
  recentReviews: string[]; // latest natural-language reviews
}

/**
 * Get aggregated feedback stats per menu item across the org.
 * Returns average ratings and recent natural-language reviews.
 */
export async function getMenuFeedbackStats(
  orgId: string,
  days: number,
): Promise<MenuItemFeedbackStats[]> {
  const since = daysAgo(days);

  const rows = await db
    .select({
      menuItemId: orderItem.menuItemId,
      name: menuItem.name,
      category: menuItem.category,
      healthyRating: orderFeedback.healthyRating,
      tasteRating: orderFeedback.tasteRating,
      quantityRating: orderFeedback.quantityRating,
      overallReview: orderFeedback.overallReview,
      createdAt: orderFeedback.createdAt,
    })
    .from(orderFeedback)
    .innerJoin(order, eq(orderFeedback.orderId, order.id))
    .innerJoin(orderItem, eq(orderItem.orderId, order.id))
    .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
    .where(
      and(
        eq(menuItem.organizationId, orgId),
        gte(orderFeedback.createdAt, since),
      ),
    );

  const itemMap = new Map<
    string,
    {
      name: string;
      category: string;
      healthySum: number;
      tasteSum: number;
      quantitySum: number;
      count: number;
      reviews: { text: string; at: Date }[];
    }
  >();

  for (const r of rows) {
    let entry = itemMap.get(r.menuItemId);
    if (!entry) {
      entry = {
        name: r.name,
        category: r.category,
        healthySum: 0,
        tasteSum: 0,
        quantitySum: 0,
        count: 0,
        reviews: [],
      };
      itemMap.set(r.menuItemId, entry);
    }
    entry.healthySum += r.healthyRating;
    entry.tasteSum += r.tasteRating;
    entry.quantitySum += r.quantityRating;
    entry.count += 1;
    if (r.overallReview) {
      entry.reviews.push({ text: r.overallReview, at: new Date(r.createdAt) });
    }
  }

  return Array.from(itemMap.entries()).map(([menuItemId, e]) => ({
    menuItemId,
    name: e.name,
    category: e.category,
    avgHealthy: Math.round((e.healthySum / e.count) * 10) / 10,
    avgTaste: Math.round((e.tasteSum / e.count) * 10) / 10,
    avgQuantity: Math.round((e.quantitySum / e.count) * 10) / 10,
    totalReviews: e.count,
    recentReviews: e.reviews
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 3)
      .map((r) => r.text),
  }));
}

export interface CancellationStats {
  reason: string;
  count: number;
  recentOtherTexts: string[];
}

/**
 * Get cancellation reason breakdown for the org.
 */
export async function getCancellationStats(
  orgId: string,
  days: number,
): Promise<CancellationStats[]> {
  const since = daysAgo(days);

  const rows = await db
    .select({
      reason: orderCancellationReason.reason,
      otherText: orderCancellationReason.otherText,
      createdAt: orderCancellationReason.createdAt,
    })
    .from(orderCancellationReason)
    .innerJoin(order, eq(orderCancellationReason.orderId, order.id))
    .innerJoin(child, eq(order.childId, child.id))
    .where(
      and(
        eq(child.organizationId, orgId),
        gte(orderCancellationReason.createdAt, since),
      ),
    );

  const reasonMap = new Map<
    string,
    { count: number; otherTexts: { text: string; at: Date }[] }
  >();

  for (const r of rows) {
    let entry = reasonMap.get(r.reason);
    if (!entry) {
      entry = { count: 0, otherTexts: [] };
      reasonMap.set(r.reason, entry);
    }
    entry.count += 1;
    if (r.otherText) {
      entry.otherTexts.push({ text: r.otherText, at: new Date(r.createdAt) });
    }
  }

  return Array.from(reasonMap.entries()).map(([reason, e]) => ({
    reason,
    count: e.count,
    recentOtherTexts: e.otherTexts
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 3)
      .map((r) => r.text),
  }));
}
