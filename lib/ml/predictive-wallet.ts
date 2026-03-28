import { mean } from "simple-statistics";
import {
  getUserFoodHistory,
  getUserSpendingProfile,
  getWalletHistory,
  type FoodHistoryItem,
} from "./data-collector";
import { getRecommendations } from "./recommendation-engine";

// ─── Types ───────────────────────────────────────────────

export interface WalletForecast {
  currentBalance: number;
  projectedDailySpend: number;
  depletionDate: string | null; // ISO date when balance hits 0
  daysUntilDepletion: number | null;
  rechargeRecommendation: number;
  dailyLimitExceedanceRisk: "LOW" | "MEDIUM" | "HIGH";
  weeklyProjection: { date: string; projectedBalance: number }[];
}

export interface ConsumptionPrediction {
  menuItemId: string;
  name: string;
  category: string;
  price: number;
  probability: number;
  estimatedSpend: number;
}

// ─── Configuration ───────────────────────────────────────

const HISTORY_DAYS = 30;
const FORECAST_DAYS = 7;
const DAY_OF_WEEK_WEIGHT = 0.6;
const OVERALL_WEIGHT = 0.4;

// ─── Wallet Forecast ─────────────────────────────────────

/**
 * Project wallet balance depletion, recommend recharge amount,
 * and assess daily limit exceedance risk.
 */
export async function getWalletForecast(
  childId: string,
  orgId: string,
  dailySpendLimit?: number | null,
): Promise<WalletForecast> {
  const [profile, walletSnap] = await Promise.all([
    getUserSpendingProfile(childId, orgId, HISTORY_DAYS),
    getWalletHistory(childId, HISTORY_DAYS),
  ]);

  const currentBalance = walletSnap.currentBalance;
  const dailyAmounts = profile.dailySpending;

  // Build day-of-week weighted average spending
  const dowAmounts: Record<number, number[]> = {};
  for (const d of dailyAmounts) {
    const dow = new Date(d.date + "T00:00:00").getDay();
    if (!dowAmounts[dow]) dowAmounts[dow] = [];
    dowAmounts[dow].push(d.amount);
  }

  const overallAvg = dailyAmounts.length > 0 ? mean(dailyAmounts.map((d) => d.amount)) : 0;

  // Compute projected daily spend using weighted day-of-week average
  const today = new Date();
  const projectedDailySpend = computeProjectedDailySpend(
    today.getDay(),
    dowAmounts,
    overallAvg,
  );

  // Project balances for the next FORECAST_DAYS
  const weeklyProjection: { date: string; projectedBalance: number }[] = [];
  let runningBalance = currentBalance;

  for (let i = 1; i <= FORECAST_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();

    // Skip weekends
    if (dow === 0 || dow === 6) {
      weeklyProjection.push({
        date: d.toISOString().split("T")[0],
        projectedBalance: runningBalance,
      });
      continue;
    }

    const dailySpend = computeProjectedDailySpend(dow, dowAmounts, overallAvg);
    runningBalance = Math.max(0, runningBalance - dailySpend);
    weeklyProjection.push({
      date: d.toISOString().split("T")[0],
      projectedBalance: Math.round(runningBalance * 100) / 100,
    });
  }

  // Depletion date
  let depletionDate: string | null = null;
  let daysUntilDepletion: number | null = null;

  if (projectedDailySpend > 0) {
    // Simulate day by day until depletion
    let balance = currentBalance;
    let dayCount = 0;
    const maxDays = 90;
    const startDate = new Date(today);

    while (balance > 0 && dayCount < maxDays) {
      dayCount++;
      const d = new Date(startDate);
      d.setDate(d.getDate() + dayCount);
      const dow = d.getDay();

      // Skip weekends
      if (dow === 0 || dow === 6) continue;

      const dailySpend = computeProjectedDailySpend(dow, dowAmounts, overallAvg);
      balance -= dailySpend;
    }

    if (balance <= 0) {
      const depDate = new Date(startDate);
      depDate.setDate(depDate.getDate() + dayCount);
      depletionDate = depDate.toISOString().split("T")[0];
      daysUntilDepletion = dayCount;
    }
  }

  // Recharge recommendation: enough for 2 weeks of weekday spending
  const avgWeekdaySpend = computeAvgWeekdaySpend(dowAmounts, overallAvg);
  const rechargeRecommendation = Math.ceil(avgWeekdaySpend * 10); // ~2 weeks of weekdays

  // Daily limit exceedance risk
  let dailyLimitExceedanceRisk: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  if (dailySpendLimit != null && dailySpendLimit > 0) {
    const ratio = projectedDailySpend / dailySpendLimit;
    if (ratio > 0.9) dailyLimitExceedanceRisk = "HIGH";
    else if (ratio > 0.7) dailyLimitExceedanceRisk = "MEDIUM";
  }

  return {
    currentBalance,
    projectedDailySpend: Math.round(projectedDailySpend * 100) / 100,
    depletionDate,
    daysUntilDepletion,
    rechargeRecommendation,
    dailyLimitExceedanceRisk,
    weeklyProjection,
  };
}

// ─── Consumption Prediction ──────────────────────────────

/**
 * Predict what a child is likely to order on a given date.
 * Uses order history frequency + ML recommendations to estimate
 * probable items and spending.
 */
export async function predictConsumption(
  childId: string,
  orgId: string,
  date: Date,
  options?: { className?: string | null },
): Promise<ConsumptionPrediction[]> {
  const targetHour = 12; // default to lunch hour
  const targetDow = date.getDay();

  // Get recommendations (which already factor in time, preferences, etc.)
  const recommendations = await getRecommendations(childId, orgId, {
    className: options?.className,
    maxResults: 10,
    currentHour: targetHour,
    currentDayOfWeek: targetDow,
  });

  // Also analyze historical ordering patterns for this day-of-week
  const history = await getUserFoodHistory(childId, orgId, HISTORY_DAYS);

  // Item frequency on this dow
  const dowFreq = new Map<string, number>();
  let totalDowOrders = 0;

  for (const h of history) {
    if (h.dayOfWeek === targetDow) {
      dowFreq.set(h.menuItemId, (dowFreq.get(h.menuItemId) ?? 0) + h.quantity);
      totalDowOrders += h.quantity;
    }
  }

  // Combine recommendation scores with historical dow frequency
  const predictions: ConsumptionPrediction[] = recommendations.map((rec) => {
    const historicalFreq = totalDowOrders > 0
      ? (dowFreq.get(rec.menuItemId) ?? 0) / totalDowOrders
      : 0;

    // Blend recommendation score (0–1 range) with historical freq
    const probability = Math.min(
      rec.score * 0.6 + historicalFreq * 0.4,
      0.95, // cap at 95%
    );

    return {
      menuItemId: rec.menuItemId,
      name: rec.name,
      category: rec.category,
      price: rec.price,
      probability: Math.round(probability * 100) / 100,
      estimatedSpend: Math.round(rec.price * probability * 100) / 100,
    };
  });

  // Sort by probability descending
  predictions.sort((a, b) => b.probability - a.probability);

  return predictions;
}

// ─── Helpers ─────────────────────────────────────────────

function computeProjectedDailySpend(
  dow: number,
  dowAmounts: Record<number, number[]>,
  overallAvg: number,
): number {
  // Weekends: assume 0 spend
  if (dow === 0 || dow === 6) return 0;

  const dowData = dowAmounts[dow];
  if (dowData && dowData.length >= 2) {
    const dowAvg = mean(dowData);
    return dowAvg * DAY_OF_WEEK_WEIGHT + overallAvg * OVERALL_WEIGHT;
  }

  return overallAvg;
}

function computeAvgWeekdaySpend(
  dowAmounts: Record<number, number[]>,
  overallAvg: number,
): number {
  let total = 0;
  let count = 0;
  // Monday=1 through Friday=5
  for (let dow = 1; dow <= 5; dow++) {
    total += computeProjectedDailySpend(dow, dowAmounts, overallAvg);
    count++;
  }
  return count > 0 ? total / count : overallAvg;
}
