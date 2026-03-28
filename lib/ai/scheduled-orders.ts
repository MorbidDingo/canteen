import { db } from "@/lib/db";
import {
  preOrder,
  preOrderItem,
  menuItem,
  wallet,
  walletTransaction,
  child,
} from "@/lib/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { getParentControls } from "@/lib/ml/data-collector";

// ─── Types ───────────────────────────────────────────────

export interface ScheduleOrderInput {
  childId: string;
  parentId: string;
  orgId: string;
  scheduledDate: string; // YYYY-MM-DD
  items: { menuItemId: string; quantity: number; breakName?: string }[];
}

export interface WeeklyScheduleInput {
  childId: string;
  parentId: string;
  orgId: string;
  startDate: string; // YYYY-MM-DD
  subscriptionUntil: string; // YYYY-MM-DD
  items: { menuItemId: string; quantity: number; breakName?: string }[];
  siblingChildIds: string[];
}

interface ScheduleResult {
  success: boolean;
  preOrderId?: string;
  error?: string;
  totalCost?: number;
}

// ─── One-Day Scheduled Order ─────────────────────────────

/**
 * Create a one-time pre-order for a specific date.
 * Used by Claude when a user says "Buy milkshake at 12:30 PM tomorrow".
 */
export async function createScheduledOrder(
  input: ScheduleOrderInput,
): Promise<ScheduleResult> {
  const { childId, parentId, orgId, scheduledDate, items } = input;

  // Validate date
  const schedDate = new Date(scheduledDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (schedDate <= today) {
    return { success: false, error: "Scheduled date must be in the future" };
  }

  // Validate child belongs to parent
  const [childRow] = await db
    .select({ id: child.id, parentId: child.parentId })
    .from(child)
    .where(and(eq(child.id, childId), eq(child.parentId, parentId)))
    .limit(1);

  if (!childRow) {
    return { success: false, error: "Child not found" };
  }

  // Validate menu items
  const menuItemIds = items.map((i) => i.menuItemId);
  const menuItems = await db
    .select({ id: menuItem.id, name: menuItem.name, price: menuItem.price, category: menuItem.category })
    .from(menuItem)
    .where(and(inArray(menuItem.id, menuItemIds), eq(menuItem.organizationId, orgId)));

  if (menuItems.length !== menuItemIds.length) {
    return { success: false, error: "One or more menu items not found" };
  }

  // Check parent controls
  const controls = await getParentControls(childId);
  const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

  for (const item of items) {
    const mi = menuItemMap.get(item.menuItemId);
    if (!mi) continue;
    if (controls.blockedCategories.includes(mi.category)) {
      return { success: false, error: `${mi.name} is in a blocked category` };
    }
    if (controls.blockedItemIds.includes(mi.id)) {
      return { success: false, error: `${mi.name} is blocked by parent controls` };
    }
  }

  // Calculate total
  const totalCost = items.reduce((sum, item) => {
    const mi = menuItemMap.get(item.menuItemId)!;
    return sum + mi.price * item.quantity;
  }, 0);

  // Check balance
  const siblings = await db
    .select({ id: child.id })
    .from(child)
    .where(eq(child.parentId, parentId));

  const siblingIds = siblings.map((s) => s.id);
  const [walletRow] = await db
    .select()
    .from(wallet)
    .where(inArray(wallet.childId, siblingIds))
    .orderBy(asc(wallet.createdAt))
    .limit(1);

  if (!walletRow || walletRow.balance < totalCost) {
    return {
      success: false,
      error: `Insufficient balance. Need ₹${totalCost.toFixed(2)}, available ₹${(walletRow?.balance ?? 0).toFixed(2)}`,
    };
  }

  // Create pre-order (no wallet deduction for ONE_DAY — deducted on fulfillment)
  const [created] = await db
    .insert(preOrder)
    .values({
      childId,
      parentId,
      mode: "ONE_DAY",
      scheduledDate,
      status: "PENDING",
    })
    .returning();

  await db.insert(preOrderItem).values(
    items.map((item) => ({
      preOrderId: created.id,
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      breakName: item.breakName || null,
    })),
  );

  return {
    success: true,
    preOrderId: created.id,
    totalCost,
  };
}

// ─── Weekly Schedule (Subscription) ──────────────────────

/**
 * Create a subscription pre-order for recurring daily orders.
 * Used by Claude when a user says "Order sandwich every day for lunch".
 */
export async function createWeeklySchedule(
  input: WeeklyScheduleInput,
): Promise<ScheduleResult> {
  const { childId, parentId, orgId, startDate, subscriptionUntil, items, siblingChildIds } = input;

  // Validate dates
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(subscriptionUntil + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (start <= today) {
    return { success: false, error: "Start date must be in the future" };
  }
  if (end <= start) {
    return { success: false, error: "End date must be after start date" };
  }

  // Count school days
  const schoolDays = countSchoolDays(start, end);
  if (schoolDays < 5) {
    return { success: false, error: "Subscription must cover at least 5 school days" };
  }

  // Validate menu items
  const menuItemIds = items.map((i) => i.menuItemId);
  const menuItems = await db
    .select({ id: menuItem.id, name: menuItem.name, price: menuItem.price, subscribable: menuItem.subscribable })
    .from(menuItem)
    .where(and(inArray(menuItem.id, menuItemIds), eq(menuItem.organizationId, orgId)));

  // Check subscribable
  for (const mi of menuItems) {
    if (!mi.subscribable) {
      return { success: false, error: `${mi.name} is not available for subscriptions` };
    }
  }

  const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

  // Calculate daily cost and total
  const dailyCost = items.reduce((sum, item) => {
    const mi = menuItemMap.get(item.menuItemId);
    return sum + (mi?.price ?? 0) * item.quantity;
  }, 0);

  const platformFee = 1.02; // 2% platform fee
  const totalCost = Math.round(dailyCost * schoolDays * platformFee * 100) / 100;

  // Check balance
  const [walletRow] = await db
    .select()
    .from(wallet)
    .where(inArray(wallet.childId, siblingChildIds))
    .orderBy(asc(wallet.createdAt))
    .limit(1);

  if (!walletRow || walletRow.balance < totalCost) {
    return {
      success: false,
      error: `Insufficient balance. Need ₹${totalCost.toFixed(2)} for ${schoolDays} school days (incl. 2% platform fee), available ₹${(walletRow?.balance ?? 0).toFixed(2)}`,
    };
  }

  // Deduct wallet and create subscription in transaction
  const created = await db.transaction(async (tx) => {
    const [latestWallet] = await tx
      .select()
      .from(wallet)
      .where(inArray(wallet.childId, siblingChildIds))
      .orderBy(asc(wallet.createdAt))
      .limit(1);

    if (!latestWallet || latestWallet.balance < totalCost) {
      throw new Error("Insufficient balance");
    }

    const newBalance = latestWallet.balance - totalCost;
    await tx
      .update(wallet)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(inArray(wallet.childId, siblingChildIds));

    await tx.insert(walletTransaction).values({
      walletId: latestWallet.id,
      type: "DEBIT",
      amount: totalCost,
      balanceAfter: newBalance,
      description: `Pre-order subscription (${schoolDays} school days, incl. 2% platform fee) via AI assistant`,
    });

    const [po] = await tx
      .insert(preOrder)
      .values({
        childId,
        parentId,
        mode: "SUBSCRIPTION",
        scheduledDate: startDate,
        subscriptionUntil,
        status: "PENDING",
      })
      .returning();

    await tx.insert(preOrderItem).values(
      items.map((item) => ({
        preOrderId: po.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        breakName: item.breakName || null,
      })),
    );

    return po;
  });

  return {
    success: true,
    preOrderId: created.id,
    totalCost,
  };
}

// ─── Helpers ─────────────────────────────────────────────

function countSchoolDays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) count++; // skip weekends
    current.setDate(current.getDate() + 1);
  }
  return count;
}
