import { db } from "@/lib/db";
import { parentNotification, child, order, orderItem, menuItem } from "@/lib/db/schema";
import { eq, and, gte, ne, desc } from "drizzle-orm";
import { mean, standardDeviation } from "simple-statistics";
import {
  getUserSpendingProfile,
  getParentControls,
  getUserFoodHistory,
} from "./data-collector";

// ─── Types ───────────────────────────────────────────────

export type AnomalyType =
  | "SPENDING_SPIKE"
  | "SKIPPED_MEAL"
  | "RESTRICTED_ATTEMPT"
  | "TIMING_ANOMALY";

export type AnomalySeverity = "LOW" | "MEDIUM" | "HIGH";

export interface AnomalyAlert {
  childId: string;
  orgId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  message: string;
  data: Record<string, unknown>;
}

// ─── Configuration ───────────────────────────────────────

const ROLLING_WINDOW_DAYS = 14;
const ZSCORE_THRESHOLD = 2.0; // >2σ above rolling avg = spike
const EXPECTED_MEAL_WINDOWS = [
  { label: "Morning break", startHour: 9, endHour: 11 },
  { label: "Lunch", startHour: 12, endHour: 14 },
] as const;

// ─── Per-Order Anomaly Check ─────────────────────────────

/**
 * Run anomaly checks on a single order event.
 * Call this after an order is placed (synchronous, fast).
 */
export async function checkOrderAnomaly(
  childId: string,
  orgId: string,
  orderTotal: number,
  orderHour: number,
): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];

  // 1. Spending spike check
  const spendingAlert = await checkSpendingSpike(childId, orgId, orderTotal);
  if (spendingAlert) alerts.push(spendingAlert);

  // 2. Timing anomaly check
  const timingAlert = checkTimingAnomaly(childId, orgId, orderHour);
  if (timingAlert) alerts.push(timingAlert);

  return alerts;
}

/**
 * Check if a single order amount is a spending spike relative to rolling average.
 */
async function checkSpendingSpike(
  childId: string,
  orgId: string,
  orderTotal: number,
): Promise<AnomalyAlert | null> {
  const profile = await getUserSpendingProfile(childId, orgId, ROLLING_WINDOW_DAYS);

  if (profile.dailySpending.length < 3) return null; // not enough data

  const amounts = profile.dailySpending.map((d) => d.amount);
  const avg = mean(amounts);
  const std = standardDeviation(amounts);

  if (std === 0) return null; // no variance

  const zScore = (orderTotal - avg) / std;

  if (zScore > ZSCORE_THRESHOLD) {
    const severity: AnomalySeverity = zScore > 3.0 ? "HIGH" : "MEDIUM";
    return {
      childId,
      orgId,
      type: "SPENDING_SPIKE",
      severity,
      message: `Spending of ₹${orderTotal.toFixed(0)} is ${zScore.toFixed(1)}σ above the ${ROLLING_WINDOW_DAYS}-day average of ₹${avg.toFixed(0)}`,
      data: { orderTotal, rollingAvg: avg, rollingStd: std, zScore },
    };
  }

  return null;
}

/**
 * Check if an order occurred at an unusual time.
 */
function checkTimingAnomaly(
  childId: string,
  orgId: string,
  hour: number,
): AnomalyAlert | null {
  const inWindow = EXPECTED_MEAL_WINDOWS.some(
    (w) => hour >= w.startHour && hour < w.endHour,
  );

  if (!inWindow) {
    return {
      childId,
      orgId,
      type: "TIMING_ANOMALY",
      severity: "LOW",
      message: `Order placed at ${hour}:00, outside of expected meal times`,
      data: { hour, expectedWindows: EXPECTED_MEAL_WINDOWS },
    };
  }

  return null;
}

// ─── Batch Anomaly Detection (Nightly/Cron) ──────────────

/**
 * Run batch anomaly detection for all children in an organization.
 * Intended to be called from a cron job (e.g., /api/ml/batch).
 */
export async function runBatchAnomalyDetection(orgId: string): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];

  // Get all children in org
  const children = await db
    .select({ id: child.id, name: child.name, className: child.className })
    .from(child)
    .where(eq(child.organizationId, orgId));

  for (const c of children) {
    // 1. Spending spike detection (daily aggregated)
    const spendingAlerts = await detectDailySpendingSpikes(c.id, orgId);
    alerts.push(...spendingAlerts);

    // 2. Skipped meal detection
    const skippedAlerts = await detectSkippedMeals(c.id, orgId);
    alerts.push(...skippedAlerts);

    // 3. Restricted item attempt detection
    const restrictedAlerts = await detectRestrictedAttempts(c.id, orgId);
    alerts.push(...restrictedAlerts);
  }

  return alerts;
}

/**
 * Detect days where spending was abnormally high vs rolling average.
 */
async function detectDailySpendingSpikes(
  childId: string,
  orgId: string,
): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const profile = await getUserSpendingProfile(childId, orgId, ROLLING_WINDOW_DAYS);

  if (profile.dailySpending.length < 5) return alerts;

  const amounts = profile.dailySpending.map((d) => d.amount);

  // Use moving average deviation: compare each day to the average of the prior days
  for (let i = 3; i < amounts.length; i++) {
    const prior = amounts.slice(Math.max(0, i - 7), i);
    if (prior.length < 3) continue;

    const avg = mean(prior);
    const std = standardDeviation(prior);
    if (std === 0) continue;

    const zScore = (amounts[i] - avg) / std;
    if (zScore > ZSCORE_THRESHOLD) {
      const severity: AnomalySeverity = zScore > 3.0 ? "HIGH" : "MEDIUM";
      alerts.push({
        childId,
        orgId,
        type: "SPENDING_SPIKE",
        severity,
        message: `On ${profile.dailySpending[i].date}, spending of ₹${amounts[i].toFixed(0)} was ${zScore.toFixed(1)}σ above the 7-day rolling average of ₹${avg.toFixed(0)}`,
        data: {
          date: profile.dailySpending[i].date,
          amount: amounts[i],
          rollingAvg: avg,
          rollingStd: std,
          zScore,
        },
      });
    }
  }

  return alerts;
}

/**
 * Detect skipped meals: days with no purchase during expected meal windows.
 * Only flags if the child has a consistent ordering pattern (>60% of recent days).
 */
async function detectSkippedMeals(
  childId: string,
  orgId: string,
): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const history = await getUserFoodHistory(childId, orgId, ROLLING_WINDOW_DAYS);

  if (history.length === 0) return alerts;

  // Group orders by date
  const orderDates = new Set<string>();
  for (const h of history) {
    orderDates.add(h.orderedAt.toISOString().split("T")[0]);
  }

  // Count weekdays in the window (skip weekends — schools usually closed)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let weekdays = 0;
  const missingDates: string[] = [];

  for (let i = 1; i <= ROLLING_WINDOW_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    weekdays++;

    const dk = d.toISOString().split("T")[0];
    if (!orderDates.has(dk)) {
      missingDates.push(dk);
    }
  }

  // Only flag if child normally orders on >60% of weekdays but recently missed
  const orderRate = (weekdays - missingDates.length) / Math.max(weekdays, 1);
  if (orderRate > 0.6 && missingDates.length > 0) {
    // Only report the most recent 3 missed days
    const recentMissed = missingDates.slice(0, 3);
    alerts.push({
      childId,
      orgId,
      type: "SKIPPED_MEAL",
      severity: recentMissed.length >= 3 ? "MEDIUM" : "LOW",
      message: `No orders on ${recentMissed.join(", ")} (normally orders ${Math.round(orderRate * 100)}% of school days)`,
      data: { missingDates: recentMissed, orderRate, totalMissed: missingDates.length },
    });
  }

  return alerts;
}

/**
 * Check if recent orders include items from categories the parent has blocked.
 * This catches orders placed via kiosk/operator bypass or stale control data.
 */
async function detectRestrictedAttempts(
  childId: string,
  orgId: string,
): Promise<AnomalyAlert[]> {
  const alerts: AnomalyAlert[] = [];
  const [controls, history] = await Promise.all([
    getParentControls(childId),
    getUserFoodHistory(childId, orgId, 3), // last 3 days only
  ]);

  if (controls.blockedCategories.length === 0 && controls.blockedItemIds.length === 0) {
    return alerts;
  }

  const violations: { name: string; category: string; date: string }[] = [];

  for (const h of history) {
    const blockedByCat = controls.blockedCategories.includes(h.category);
    const blockedById = controls.blockedItemIds.includes(h.menuItemId);
    if (blockedByCat || blockedById) {
      violations.push({
        name: h.name,
        category: h.category,
        date: h.orderedAt.toISOString().split("T")[0],
      });
    }
  }

  if (violations.length > 0) {
    const itemNames = [...new Set(violations.map((v) => v.name))];
    alerts.push({
      childId,
      orgId,
      type: "RESTRICTED_ATTEMPT",
      severity: "HIGH",
      message: `Orders for restricted items detected: ${itemNames.join(", ")}`,
      data: { violations },
    });
  }

  return alerts;
}

// ─── Notification Pipeline ───────────────────────────────

/**
 * Create parent notifications from anomaly alerts.
 * Integrates with the existing parentNotification table.
 */
export async function notifyParentOfAnomalies(
  alerts: AnomalyAlert[],
  parentId: string,
): Promise<void> {
  if (alerts.length === 0) return;

  const notifications = alerts.map((alert) => ({
    id: crypto.randomUUID(),
    parentId,
    childId: alert.childId,
    type: `ANOMALY_${alert.type}`,
    title: getAlertTitle(alert.type),
    message: alert.message,
    metadata: JSON.stringify({
      anomalyType: alert.type,
      severity: alert.severity,
      data: alert.data,
    }),
    createdAt: new Date(),
  }));

  await db.insert(parentNotification).values(notifications);
}

function getAlertTitle(type: AnomalyType): string {
  switch (type) {
    case "SPENDING_SPIKE":
      return "Unusual Spending Detected";
    case "SKIPPED_MEAL":
      return "Missed Meals Detected";
    case "RESTRICTED_ATTEMPT":
      return "Restricted Item Ordered";
    case "TIMING_ANOMALY":
      return "Unusual Order Time";
  }
}
