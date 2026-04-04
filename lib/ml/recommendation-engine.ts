import { db } from "@/lib/db";
import { menuItem, canteen } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import type {
  FoodHistoryItem,
  MenuPopularityItem,
  ParentControlsData,
  PeerBehaviorItem,
  MenuItemFeedbackStats,
} from "./data-collector";
import {
  getUserFoodHistory,
  getMenuPopularity,
  getParentControls,
  getPeerBehavior,
  getWalletHistory,
  getMenuFeedbackStats,
} from "./data-collector";

// ─── Types ───────────────────────────────────────────────

export interface ScoredRecommendation {
  menuItemId: string;
  name: string;
  category: string;
  price: number;
  score: number;
  reasons: string[];
  canteenId: string | null;
  canteenName: string | null;
  imageUrl: string | null;
}

interface ItemSimilarity {
  itemA: string;
  itemB: string;
  similarity: number;
}

// ─── Configuration ───────────────────────────────────────

const WEIGHTS = {
  PREFERENCE: 0.25,
  TIME_AWARE: 0.18,
  PEER_BOOST: 0.12,
  POPULARITY: 0.12,
  CO_PURCHASE: 0.08,
  PRICE_FIT: 0.10,
  FEEDBACK: 0.15,
} as const;

const HISTORY_DAYS = 30;
const POPULARITY_DAYS = 14;
const PEER_DAYS = 14;

// ─── Main Recommendation Function ────────────────────────

/**
 * Generate scored menu item recommendations for a child.
 * Takes into account personal history, time-of-day, peer behavior,
 * popularity, co-purchase patterns, budget constraints, and parent blocks.
 */
export async function getRecommendations(
  childId: string,
  orgId: string,
  options?: {
    className?: string | null;
    maxResults?: number;
    currentHour?: number;
    currentDayOfWeek?: number;
    budgetRemaining?: number | null;
  },
): Promise<ScoredRecommendation[]> {
  const maxResults = options?.maxResults ?? 10;
  const now = new Date();
  const currentHour = options?.currentHour ?? now.getHours();
  const currentDow = options?.currentDayOfWeek ?? now.getDay();

  // Fetch all data in parallel
  const [history, popularity, controls, peers, walletSnap, availableItems, feedbackStats] =
    await Promise.all([
      getUserFoodHistory(childId, orgId, HISTORY_DAYS),
      getMenuPopularity(orgId, POPULARITY_DAYS),
      getParentControls(childId),
      getPeerBehavior(orgId, options?.className ?? null, PEER_DAYS),
      getWalletHistory(childId, 30),
      getAvailableMenuItems(orgId),
      getMenuFeedbackStats(orgId, 30),
    ]);

  const budgetRemaining = options?.budgetRemaining ?? walletSnap.currentBalance;

  // Build scoring components
  const preferenceScores = buildPreferenceVector(history, availableItems);
  const timeScores = buildTimeAwareScores(popularity, currentHour, currentDow);
  const peerScores = buildPeerScores(peers);
  const popularityScores = buildPopularityScores(popularity);
  const coScores = buildCoPurchaseScores(history, availableItems);
  const feedbackScores = buildFeedbackScores(feedbackStats);

  // Score each available item
  const scored: ScoredRecommendation[] = [];

  for (const item of availableItems) {
    // Filter out blocked items/categories
    if (isBlocked(item, controls)) continue;

    // Filter over-budget items
    if (budgetRemaining !== null && item.price > budgetRemaining) continue;

    // Filter items exceeding daily spend limit
    if (controls.dailySpendLimit !== null && item.price > controls.dailySpendLimit) continue;

    const reasons: string[] = [];
    let score = 0;

    // Preference score
    const pref = preferenceScores.get(item.id) ?? 0;
    score += pref * WEIGHTS.PREFERENCE;
    if (pref > 0.5) reasons.push("Matches your preferences");

    // Time-aware score
    const timeSc = timeScores.get(item.id) ?? 0;
    score += timeSc * WEIGHTS.TIME_AWARE;
    if (timeSc > 0.5) reasons.push("Popular at this time");

    // Peer boost
    const peerSc = peerScores.get(item.id) ?? 0;
    score += peerSc * WEIGHTS.PEER_BOOST;
    if (peerSc > 0.5) reasons.push("Popular with classmates");

    // Overall popularity
    const popSc = popularityScores.get(item.id) ?? 0;
    score += popSc * WEIGHTS.POPULARITY;
    if (popSc > 0.7) reasons.push("Trending in your school");

    // Co-purchase similarity
    const coSc = coScores.get(item.id) ?? 0;
    score += coSc * WEIGHTS.CO_PURCHASE;
    if (coSc > 0.3) reasons.push("Often ordered with your favorites");

    // Feedback score (user ratings)
    const fbSc = feedbackScores.get(item.id) ?? 0;
    score += fbSc * WEIGHTS.FEEDBACK;
    if (fbSc > 0.7) reasons.push("Highly rated");
    else if (fbSc > 0.4) reasons.push("Well reviewed");

    // Price fit (closer to avg spending = higher score)
    const priceFit = computePriceFit(item.price, history);
    score += priceFit * WEIGHTS.PRICE_FIT;
    if (priceFit > 0.7) reasons.push("Within your usual price range");

    // Fallback reason
    if (reasons.length === 0) reasons.push("Available now");

    scored.push({
      menuItemId: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      score,
      reasons,
      canteenId: item.canteenId,
      canteenName: item.canteenName,
      imageUrl: item.imageUrl,
    });
  }

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

// ─── Scoring Components ──────────────────────────────────

/**
 * Build user preference vector from order history.
 * Items ordered more frequently get higher scores. Category affinity is also factored in.
 */
function buildPreferenceVector(
  history: FoodHistoryItem[],
  availableItems: AvailableItem[],
): Map<string, number> {
  const scores = new Map<string, number>();
  if (history.length === 0) return scores;

  // Direct item frequency
  const itemFreq = new Map<string, number>();
  const categoryFreq = new Map<string, number>();
  let totalOrders = 0;

  for (const h of history) {
    itemFreq.set(h.menuItemId, (itemFreq.get(h.menuItemId) ?? 0) + h.quantity);
    categoryFreq.set(h.category, (categoryFreq.get(h.category) ?? 0) + h.quantity);
    totalOrders += h.quantity;
  }

  const maxItemFreq = Math.max(...itemFreq.values(), 1);
  const maxCatFreq = Math.max(...categoryFreq.values(), 1);

  for (const item of availableItems) {
    const directScore = (itemFreq.get(item.id) ?? 0) / maxItemFreq;
    const categoryScore = (categoryFreq.get(item.category) ?? 0) / maxCatFreq;
    // 70% direct, 30% category affinity
    scores.set(item.id, directScore * 0.7 + categoryScore * 0.3);
  }

  return scores;
}

/**
 * Score items based on their popularity at the current time of day and day of week.
 */
function buildTimeAwareScores(
  popularity: MenuPopularityItem[],
  hour: number,
  dow: number,
): Map<string, number> {
  const scores = new Map<string, number>();
  if (popularity.length === 0) return scores;

  // Find max hourly and dow values for normalization
  let maxHourly = 1;
  let maxDow = 1;
  for (const item of popularity) {
    const hourVal = item.hourlyDistribution[hour] ?? 0;
    const dowVal = item.dayOfWeekDistribution[dow] ?? 0;
    if (hourVal > maxHourly) maxHourly = hourVal;
    if (dowVal > maxDow) maxDow = dowVal;
  }

  for (const item of popularity) {
    const hourScore = (item.hourlyDistribution[hour] ?? 0) / maxHourly;
    const dowScore = (item.dayOfWeekDistribution[dow] ?? 0) / maxDow;
    scores.set(item.menuItemId, hourScore * 0.6 + dowScore * 0.4);
  }

  return scores;
}

/**
 * Score items based on peer ordering behavior.
 */
function buildPeerScores(peers: PeerBehaviorItem[]): Map<string, number> {
  const scores = new Map<string, number>();
  if (peers.length === 0) return scores;

  const maxOrders = Math.max(...peers.map((p) => p.orderCount), 1);
  for (const p of peers) {
    scores.set(p.menuItemId, p.orderCount / maxOrders);
  }

  return scores;
}

/**
 * Score items by overall popularity (total orders).
 */
function buildPopularityScores(popularity: MenuPopularityItem[]): Map<string, number> {
  const scores = new Map<string, number>();
  if (popularity.length === 0) return scores;

  const maxOrdered = Math.max(...popularity.map((p) => p.totalOrdered), 1);
  for (const item of popularity) {
    scores.set(item.menuItemId, item.totalOrdered / maxOrdered);
  }

  return scores;
}

/**
 * Co-purchase similarity: items frequently bought together by this user.
 * Uses item-item co-occurrence within the same order.
 */
function buildCoPurchaseScores(
  history: FoodHistoryItem[],
  availableItems: AvailableItem[],
): Map<string, number> {
  const scores = new Map<string, number>();
  if (history.length === 0) return scores;

  // Group items by order
  const orderGroups = new Map<string, string[]>();
  for (const h of history) {
    const existing = orderGroups.get(h.orderId) ?? [];
    existing.push(h.menuItemId);
    orderGroups.set(h.orderId, existing);
  }

  // Build co-occurrence matrix
  const coOccurrence = new Map<string, number>();
  for (const items of orderGroups.values()) {
    if (items.length < 2) continue;
    const unique = [...new Set(items)];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = [unique[i], unique[j]].sort().join("|");
        coOccurrence.set(key, (coOccurrence.get(key) ?? 0) + 1);
      }
    }
  }

  if (coOccurrence.size === 0) return scores;

  // Find user's most frequently ordered items (top 5)
  const itemFreq = new Map<string, number>();
  for (const h of history) {
    itemFreq.set(h.menuItemId, (itemFreq.get(h.menuItemId) ?? 0) + h.quantity);
  }
  const topItems = [...itemFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  // Score available items by co-occurrence with top items
  const maxCoOccurrence = Math.max(...coOccurrence.values(), 1);
  for (const item of availableItems) {
    let coScore = 0;
    for (const topId of topItems) {
      const key = [item.id, topId].sort().join("|");
      coScore += (coOccurrence.get(key) ?? 0) / maxCoOccurrence;
    }
    scores.set(item.id, Math.min(coScore / topItems.length, 1));
  }

  return scores;
}

/**
 * How well the item price fits the user's typical spending per item.
 */
function computePriceFit(price: number, history: FoodHistoryItem[]): number {
  if (history.length === 0) return 0.5; // neutral

  const avgPrice =
    history.reduce((s, h) => s + h.price, 0) / history.length;

  if (avgPrice === 0) return 0.5;

  // Score: 1.0 if price matches avg exactly, decays with distance
  const ratio = Math.abs(price - avgPrice) / avgPrice;
  return Math.max(0, 1 - ratio);
}

// ─── Constraint Filtering ────────────────────────────────

function isBlocked(
  item: AvailableItem,
  controls: ParentControlsData,
): boolean {
  if (controls.blockedCategories.includes(item.category)) return true;
  if (controls.blockedItemIds.includes(item.id)) return true;
  return false;
}

/**
 * Build feedback-based scores from aggregated user ratings.
 * Combines healthy, taste, and quantity ratings into a composite 0-1 score.
 */
function buildFeedbackScores(
  stats: MenuItemFeedbackStats[],
): Map<string, number> {
  const scores = new Map<string, number>();
  if (stats.length === 0) return scores;

  for (const s of stats) {
    if (s.totalReviews === 0) continue;
    // Weighted average: taste 50%, healthy 30%, quantity 20% — normalized to 0-1
    const composite =
      (s.avgTaste * 0.5 + s.avgHealthy * 0.3 + s.avgQuantity * 0.2) / 5;
    // Apply confidence scaling: more reviews = more reliable
    const confidence = Math.min(1, s.totalReviews / 10);
    scores.set(s.menuItemId, composite * confidence);
  }

  return scores;
}

// ─── Available Menu Items ────────────────────────────────

interface AvailableItem {
  id: string;
  name: string;
  category: string;
  price: number;
  canteenId: string | null;
  canteenName: string | null;
  imageUrl: string | null;
}

async function getAvailableMenuItems(orgId: string): Promise<AvailableItem[]> {
  const rows = await db
    .select({
      id: menuItem.id,
      name: menuItem.name,
      category: menuItem.category,
      price: menuItem.price,
      availableUnits: menuItem.availableUnits,
      canteenId: menuItem.canteenId,
      canteenName: canteen.name,
      imageUrl: menuItem.imageUrl,
    })
    .from(menuItem)
    .leftJoin(canteen, eq(menuItem.canteenId, canteen.id))
    .where(
      and(
        eq(menuItem.organizationId, orgId),
        eq(menuItem.available, true),
      ),
    );

  // Filter out sold-out items (availableUnits === 0 means sold out; null means unlimited)
  return rows
    .filter((r) => r.availableUnits === null || r.availableUnits > 0)
    .map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      price: r.price,
      canteenId: r.canteenId ?? null,
      canteenName: r.canteenName ?? null,
      imageUrl: r.imageUrl ?? null,
    }));
}
