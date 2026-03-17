import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  preOrder,
  preOrderItem,
  child,
  menuItem,
  parentControl,
  discount,
  appSetting,
  certeSubscription,
} from "@/lib/db/schema";
import { eq, desc, and, gte, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";
import { APP_SETTINGS_DEFAULTS, MAX_ACTIVE_PREORDERS_PER_CHILD } from "@/lib/constants";
import { breakNames, parseBreakSlots } from "@/lib/break-slots";

type AllocationInput = {
  childId: string;
  menuItemId: string;
  quantity: number;
  breakName: string;
};

type EditItemInput = {
  menuItemId: string;
  quantity: number;
  breakName: string;
};

type MenuRow = {
  id: string;
  available: boolean;
  category: string;
  price: number;
  name: string;
  subscribable: boolean;
};

function safeParseJSON(val: string | null): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => String(v));
  } catch {
    return [];
  }
}

function normalizeBreakName(value: string): string {
  return value.trim();
}

function isSchoolDay(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Returns the next school day (Mon-Fri) after today.
 */
function getNextSchoolDay(): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 1);
  while (!isSchoolDay(date)) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return toIsoDate(date);
}

/**
 * Adds N school days to a start date and returns resulting ISO date.
 * schoolDaysToAdd = 0 returns startDate itself.
 */
function addSchoolDays(startDateIso: string, schoolDaysToAdd: number): string {
  const date = new Date(`${startDateIso}T00:00:00.000Z`);
  let remaining = Math.max(0, schoolDaysToAdd);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isSchoolDay(date)) {
      remaining -= 1;
    }
  }
  return toIsoDate(date);
}

function countSchoolDaysInclusive(startDateIso: string, endDateIso: string): number {
  const start = new Date(`${startDateIso}T00:00:00.000Z`);
  const end = new Date(`${endDateIso}T00:00:00.000Z`);
  if (end.getTime() < start.getTime()) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    if (isSchoolDay(cursor)) {
      count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

async function getAppSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSetting);
  const settings: Record<string, string> = { ...APP_SETTINGS_DEFAULTS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

async function getActiveCertePlus(parentId: string): Promise<{ id: string; endDate: Date } | null> {
  const now = new Date();
  const [active] = await db
    .select({ id: certeSubscription.id, endDate: certeSubscription.endDate })
    .from(certeSubscription)
    .where(
      and(
        eq(certeSubscription.parentId, parentId),
        eq(certeSubscription.status, "ACTIVE"),
        gte(certeSubscription.endDate, now),
      ),
    )
    .limit(1);
  return active ?? null;
}

async function getMenuAndDiscountMaps() {
  const menuRows = await db
    .select({
      id: menuItem.id,
      available: menuItem.available,
      category: menuItem.category,
      price: menuItem.price,
      name: menuItem.name,
      subscribable: menuItem.subscribable,
    })
    .from(menuItem);

  const now = new Date();
  const activeDiscounts = await db.select().from(discount).where(eq(discount.active, true));
  const discountMap = new Map(
    activeDiscounts
      .filter((d) => (!d.startDate || d.startDate <= now) && (!d.endDate || d.endDate >= now))
      .map((d) => [d.menuItemId, { type: d.type as "PERCENTAGE" | "FLAT", value: d.value }] as const),
  );

  const menuMap = new Map(menuRows.map((row) => [row.id, row] as const));
  return { menuRows, menuMap, discountMap };
}

function getEffectivePrice(
  menu: MenuRow,
  discountMap: Map<string, { type: "PERCENTAGE" | "FLAT"; value: number }>,
): number {
  const activeDiscount = discountMap.get(menu.id);
  if (!activeDiscount) return menu.price;
  if (activeDiscount.type === "PERCENTAGE") {
    return Math.round(menu.price * (1 - activeDiscount.value / 100) * 100) / 100;
  }
  return Math.max(0, Math.round((menu.price - activeDiscount.value) * 100) / 100);
}

function buildFoodSignature(items: Array<{ menuItemId: string; quantity: number }>): string {
  return items
    .map((item) => `${item.menuItemId}:${item.quantity}`)
    .sort()
    .join("|");
}

// GET /api/pre-orders - list pre-orders for the logged-in parent
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preOrders = await db
    .select({
      id: preOrder.id,
      childId: preOrder.childId,
      childName: child.name,
      mode: preOrder.mode,
      scheduledDate: preOrder.scheduledDate,
      subscriptionUntil: preOrder.subscriptionUntil,
      lastFulfilledDate: preOrder.lastFulfilledDate,
      status: preOrder.status,
      createdAt: preOrder.createdAt,
    })
    .from(preOrder)
    .innerJoin(child, eq(child.id, preOrder.childId))
    .where(eq(preOrder.parentId, session.user.id))
    .orderBy(desc(preOrder.createdAt))
    .limit(100);

  const result = await Promise.all(
    preOrders.map(async (po) => {
      const items = await db
        .select({
          id: preOrderItem.id,
          menuItemId: preOrderItem.menuItemId,
          name: menuItem.name,
          quantity: preOrderItem.quantity,
          breakName: preOrderItem.breakName,
          lastFulfilledOn: preOrderItem.lastFulfilledOn,
        })
        .from(preOrderItem)
        .innerJoin(menuItem, eq(menuItem.id, preOrderItem.menuItemId))
        .where(eq(preOrderItem.preOrderId, po.id));

      return { ...po, items };
    }),
  );

  return NextResponse.json(result);
}

// POST /api/pre-orders - create subscription pre-orders (one per selected child)
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      periodSchoolDays?: number;
      allocations?: AllocationInput[];
      childId?: string;
      items?: { menuItemId: string; quantity: number }[];
      scheduledDate?: string;
      subscriptionUntil?: string | null;
    };

    const settings = await getAppSettings();
    const MIN_PREORDER_VALUE = Number(settings.subscription_min_order_value) || 60;
    const MIN_SUBSCRIPTION_DAYS = Number(settings.subscription_min_days) || 3;
    const MAX_SUBSCRIPTION_DAYS = Number(settings.subscription_max_days) || 180;
    const breakSlots = parseBreakSlots(settings.subscription_breaks_json);
    const allowedBreaks = breakNames(breakSlots);
    const allowedBreakSet = new Set(allowedBreaks);

    const activeCertePlus = await getActiveCertePlus(session.user.id);
    if (!activeCertePlus) {
      return NextResponse.json(
        {
          error:
            "An active Certe+ subscription is required to use pre-orders. Subscribe from the pre-orders page or settings.",
        },
        { status: 403 },
      );
    }

    const effectiveStartDate = getNextSchoolDay();
    const certeEndDateIso = activeCertePlus.endDate.toISOString().slice(0, 10);
    const maxSchoolDaysFromSubscription = countSchoolDaysInclusive(effectiveStartDate, certeEndDateIso);
    if (maxSchoolDaysFromSubscription <= 0) {
      return NextResponse.json(
        {
          error: "Your Certe+ subscription has no school days left for new pre-orders.",
        },
        { status: 409 },
      );
    }

    const requestedPeriod = Number(body.periodSchoolDays);
    const periodSchoolDays =
      Number.isFinite(requestedPeriod) && requestedPeriod > 0
        ? requestedPeriod
        : maxSchoolDaysFromSubscription;

    const maxAllowedPeriod = Math.min(MAX_SUBSCRIPTION_DAYS, maxSchoolDaysFromSubscription);
    const minAllowedPeriod = Math.min(MIN_SUBSCRIPTION_DAYS, maxAllowedPeriod);
    if (periodSchoolDays < minAllowedPeriod || periodSchoolDays > maxAllowedPeriod) {
      return NextResponse.json(
        {
          error: `Subscription duration must be between ${minAllowedPeriod} and ${maxAllowedPeriod} school days based on your current subscription.`,
        },
        { status: 400 },
      );
    }

    const allocations: AllocationInput[] = Array.isArray(body.allocations)
      ? body.allocations
      : body.childId && Array.isArray(body.items)
      ? body.items.map((item) => ({
          childId: body.childId as string,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          breakName: allowedBreaks[0] ?? "Lunch Break",
        }))
      : [];

    if (allocations.length === 0) {
      return NextResponse.json(
        { error: "At least one child allocation is required" },
        { status: 400 },
      );
    }

    for (const allocation of allocations) {
      if (
        !allocation.childId ||
        !allocation.menuItemId ||
        !Number.isFinite(allocation.quantity) ||
        allocation.quantity <= 0
      ) {
        return NextResponse.json(
          { error: "Each allocation must include childId, menuItemId, quantity > 0 and breakName" },
          { status: 400 },
        );
      }
      const normalizedBreak = normalizeBreakName(allocation.breakName || "");
      if (!normalizedBreak) {
        return NextResponse.json({ error: "Break is required for each allocation" }, { status: 400 });
      }
      if (!allowedBreakSet.has(normalizedBreak)) {
        return NextResponse.json(
          { error: `Break "${normalizedBreak}" is no longer available. Please choose a valid break.` },
          { status: 409 },
        );
      }
      allocation.breakName = normalizedBreak;
    }

    const allocationsByChild = new Map<string, AllocationInput[]>();
    for (const allocation of allocations) {
      const current = allocationsByChild.get(allocation.childId) ?? [];
      current.push(allocation);
      allocationsByChild.set(allocation.childId, current);
    }

    const childIds = Array.from(allocationsByChild.keys());
    const childRows = await db
      .select({ id: child.id, parentId: child.parentId, name: child.name })
      .from(child)
      .where(inArray(child.id, childIds));

    if (childRows.length !== childIds.length) {
      return NextResponse.json({ error: "One or more children were not found" }, { status: 404 });
    }

    const childById = new Map(childRows.map((row) => [row.id, row] as const));
    for (const childId of childIds) {
      const row = childById.get(childId);
      if (!row || row.parentId !== session.user.id) {
        return NextResponse.json({ error: "One or more children are not linked to your account" }, { status: 404 });
      }
    }

    const existingPendingByChild = await db
      .select({ childId: preOrder.childId })
      .from(preOrder)
      .where(
        and(
          eq(preOrder.parentId, session.user.id),
          eq(preOrder.status, "PENDING"),
          inArray(preOrder.childId, childIds),
        ),
      );
    if (existingPendingByChild.length > 0) {
      const pendingChildIds = new Set(existingPendingByChild.map((row) => row.childId));
      const pendingChildNames = childRows
        .filter((row) => pendingChildIds.has(row.id))
        .map((row) => row.name);
      return NextResponse.json(
        {
          error:
            pendingChildNames.length > 0
              ? `Only ${MAX_ACTIVE_PREORDERS_PER_CHILD} active pre-order is allowed per child. Already active: ${pendingChildNames.join(", ")}.`
              : `Only ${MAX_ACTIVE_PREORDERS_PER_CHILD} active pre-order is allowed per child.`,
        },
        { status: 409 },
      );
    }

    const { menuMap, discountMap } = await getMenuAndDiscountMaps();

    const controlRows = await db
      .select({
        childId: parentControl.childId,
        dailySpendLimit: parentControl.dailySpendLimit,
        perOrderLimit: parentControl.perOrderLimit,
        blockedCategories: parentControl.blockedCategories,
        blockedItemIds: parentControl.blockedItemIds,
      })
      .from(parentControl)
      .where(inArray(parentControl.childId, childIds));
    const controlsByChildId = new Map(controlRows.map((row) => [row.childId, row] as const));

    const blockedReasons: string[] = [];
    const preparedByChild = new Map<
      string,
      {
        childName: string;
        total: number;
        items: Array<{ menuItemId: string; quantity: number; breakName: string; name: string; category: string }>;
      }
    >();

    for (const [childId, childAllocations] of allocationsByChild.entries()) {
      const childMeta = childById.get(childId);
      if (!childMeta) continue;

      const perChildBucket = new Map<
        string,
        { menuItemId: string; quantity: number; breakName: string; name: string; category: string; unitPrice: number }
      >();
      let childTotal = 0;

      for (const allocation of childAllocations) {
        const menu = menuMap.get(allocation.menuItemId);
        if (!menu || !menu.available || !menu.subscribable) {
          return NextResponse.json(
            { error: "One or more selected items are invalid, unavailable, or not subscribable" },
            { status: 400 },
          );
        }

        const unitPrice = getEffectivePrice(menu, discountMap);
        const key = `${allocation.menuItemId}::${allocation.breakName}`;
        const existing = perChildBucket.get(key);
        if (existing) {
          existing.quantity += allocation.quantity;
        } else {
          perChildBucket.set(key, {
            menuItemId: allocation.menuItemId,
            quantity: allocation.quantity,
            breakName: allocation.breakName,
            name: menu.name,
            category: menu.category,
            unitPrice,
          });
        }
        childTotal += unitPrice * allocation.quantity;
      }

      if (childTotal < MIN_PREORDER_VALUE) {
        blockedReasons.push(
          `${childMeta.name}: minimum pre-order value is Rs${MIN_PREORDER_VALUE}, current selection is Rs${Math.round(childTotal)}.`,
        );
      }

      const control = controlsByChildId.get(childId);
      if (control) {
        const blockedCategories = safeParseJSON(control.blockedCategories);
        const blockedItemIds = safeParseJSON(control.blockedItemIds);
        const selections = Array.from(perChildBucket.values());

        const blockedByCategory = selections
          .filter((item) => blockedCategories.includes(item.category))
          .map((item) => `${item.name} (${item.category})`);
        if (blockedByCategory.length > 0) {
          blockedReasons.push(`${childMeta.name}: blocked category items - ${blockedByCategory.join(", ")}`);
        }

        const blockedByItem = selections
          .filter((item) => blockedItemIds.includes(item.menuItemId))
          .map((item) => item.name);
        if (blockedByItem.length > 0) {
          blockedReasons.push(`${childMeta.name}: blocked items - ${blockedByItem.join(", ")}`);
        }

        if (control.perOrderLimit && childTotal > control.perOrderLimit) {
          blockedReasons.push(
            `${childMeta.name}: per-order limit exceeded (limit Rs${control.perOrderLimit}, selected Rs${Math.round(childTotal)}).`,
          );
        }

        if (control.dailySpendLimit && childTotal > control.dailySpendLimit) {
          blockedReasons.push(
            `${childMeta.name}: daily limit may block this selection (limit Rs${control.dailySpendLimit}, selected Rs${Math.round(childTotal)}).`,
          );
        }
      }

      preparedByChild.set(childId, {
        childName: childMeta.name,
        total: childTotal,
        items: Array.from(perChildBucket.values()).map((row) => ({
          menuItemId: row.menuItemId,
          quantity: row.quantity,
          breakName: row.breakName,
          name: row.name,
          category: row.category,
        })),
      });
    }

    if (blockedReasons.length > 0) {
      return NextResponse.json(
        {
          error: "Selection is blocked by current rules",
          blockedReasons,
          requiresControlUpdate: true,
        },
        { status: 409 },
      );
    }

    const subscriptionUntil = addSchoolDays(effectiveStartDate, periodSchoolDays - 1);

    const createdByChild = await db.transaction(async (tx) => {
      const createdPairs: Array<{ childId: string; preOrderId: string }> = [];

      for (const [childId, prepared] of preparedByChild.entries()) {
        const [created] = await tx
          .insert(preOrder)
          .values({
            childId,
            parentId: session.user.id,
            mode: "SUBSCRIPTION",
            scheduledDate: effectiveStartDate,
            subscriptionUntil,
            status: "PENDING",
          })
          .returning({ id: preOrder.id });

        await tx.insert(preOrderItem).values(
          prepared.items.map((item) => ({
            preOrderId: created.id,
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            breakName: item.breakName,
          })),
        );

        createdPairs.push({ childId, preOrderId: created.id });
      }

      return createdPairs;
    });

    broadcast("orders-updated");

    for (const created of createdByChild) {
      const prepared = preparedByChild.get(created.childId);
      if (!prepared) continue;
      const summary = prepared.items.map((item) => `${item.name} x${item.quantity} (${item.breakName})`).join(", ");
      notifyParentForChild({
        childId: created.childId,
        type: "KIOSK_PREORDER_TAKEN",
        title: "Pre-order created",
        message: `Subscription pre-order (${summary}) is set from ${effectiveStartDate} to ${subscriptionUntil}.`,
        metadata: {
          preOrderId: created.preOrderId,
          scheduledDate: effectiveStartDate,
          subscriptionUntil,
          periodSchoolDays,
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      ids: createdByChild.map((row) => row.preOrderId),
      scheduledDate: effectiveStartDate,
      subscriptionUntil,
    });
  } catch (error) {
    console.error("Create pre-order error:", error);
    return NextResponse.json({ error: "Failed to create pre-order" }, { status: 500 });
  }
}

// PUT /api/pre-orders - edit food and break only for an active subscription pre-order
export async function PUT(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      preOrderId: string;
      items: EditItemInput[];
    };

    if (!body.preOrderId || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "preOrderId and at least one item are required" },
        { status: 400 },
      );
    }

    const [target] = await db
      .select({
        id: preOrder.id,
        childId: preOrder.childId,
        parentId: preOrder.parentId,
        status: preOrder.status,
        mode: preOrder.mode,
      })
      .from(preOrder)
      .where(and(eq(preOrder.id, body.preOrderId), eq(preOrder.parentId, session.user.id)))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "Pre-order not found" }, { status: 404 });
    }
    if (target.mode !== "SUBSCRIPTION") {
      return NextResponse.json({ error: "Only subscription pre-orders can be edited" }, { status: 400 });
    }
    if (target.status !== "PENDING") {
      return NextResponse.json({ error: "Only pending pre-orders can be edited" }, { status: 409 });
    }

    const settings = await getAppSettings();
    const MIN_PREORDER_VALUE = Number(settings.subscription_min_order_value) || 60;
    const configuredBreaks = breakNames(parseBreakSlots(settings.subscription_breaks_json));
    const configuredBreakSet = new Set(configuredBreaks);

    const existingRows = await db
      .select({
        id: preOrderItem.id,
        menuItemId: preOrderItem.menuItemId,
        quantity: preOrderItem.quantity,
        breakName: preOrderItem.breakName,
        lastFulfilledOn: preOrderItem.lastFulfilledOn,
      })
      .from(preOrderItem)
      .where(eq(preOrderItem.preOrderId, target.id));
    const existingBreakSet = new Set(
      existingRows.map((row) => row.breakName ?? "").filter((value) => value.trim().length > 0),
    );

    for (const item of body.items) {
      if (!item.menuItemId || !Number.isFinite(item.quantity) || item.quantity <= 0) {
        return NextResponse.json({ error: "Each item must include menuItemId and quantity > 0" }, { status: 400 });
      }
      const normalizedBreak = normalizeBreakName(item.breakName || "");
      if (!normalizedBreak) {
        return NextResponse.json({ error: "Break is required for each item" }, { status: 400 });
      }
      if (!configuredBreakSet.has(normalizedBreak) && !existingBreakSet.has(normalizedBreak)) {
        return NextResponse.json(
          {
            error: `Break "${normalizedBreak}" is no longer available. Please select an active break.`,
          },
          { status: 409 },
        );
      }
      item.breakName = normalizedBreak;
    }

    const { menuMap, discountMap } = await getMenuAndDiscountMaps();

    let updatedTotal = 0;
    const selectedRows: Array<{ menuItemId: string; quantity: number; breakName: string; name: string; category: string }> = [];

    for (const item of body.items) {
      const menu = menuMap.get(item.menuItemId);
      if (!menu || !menu.available || !menu.subscribable) {
        return NextResponse.json(
          { error: "One or more selected items are invalid, unavailable, or not subscribable" },
          { status: 400 },
        );
      }
      const unitPrice = getEffectivePrice(menu, discountMap);
      updatedTotal += unitPrice * item.quantity;
      selectedRows.push({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        breakName: item.breakName,
        name: menu.name,
        category: menu.category,
      });
    }

    let existingTotal = 0;
    for (const row of existingRows) {
      const menu = menuMap.get(row.menuItemId);
      if (!menu) continue;
      existingTotal += getEffectivePrice(menu, discountMap) * row.quantity;
    }

    const existingFoodSignature = buildFoodSignature(
      existingRows.map((row) => ({ menuItemId: row.menuItemId, quantity: row.quantity })),
    );
    const updatedFoodSignature = buildFoodSignature(
      body.items.map((row) => ({ menuItemId: row.menuItemId, quantity: row.quantity })),
    );
    const foodChanged = existingFoodSignature !== updatedFoodSignature;

    // Graceful min-value rule:
    // - Break-only edits are allowed even when now below the latest minimum.
    // - Any food change must satisfy current minimum value.
    if (updatedTotal < MIN_PREORDER_VALUE && foodChanged) {
      return NextResponse.json(
        {
          error: `Minimum pre-order value is Rs${MIN_PREORDER_VALUE}. Add items or increase quantity before saving food changes.`,
          currentTotal: Math.round(updatedTotal),
          previousTotal: Math.round(existingTotal),
        },
        { status: 409 },
      );
    }

    const [control] = await db
      .select({
        dailySpendLimit: parentControl.dailySpendLimit,
        perOrderLimit: parentControl.perOrderLimit,
        blockedCategories: parentControl.blockedCategories,
        blockedItemIds: parentControl.blockedItemIds,
      })
      .from(parentControl)
      .where(eq(parentControl.childId, target.childId))
      .limit(1);

    if (control) {
      const blockedCategories = safeParseJSON(control.blockedCategories);
      const blockedItemIds = safeParseJSON(control.blockedItemIds);

      const blockedByCategory = selectedRows
        .filter((row) => blockedCategories.includes(row.category))
        .map((row) => `${row.name} (${row.category})`);
      if (blockedByCategory.length > 0) {
        return NextResponse.json(
          { error: `Blocked category items: ${blockedByCategory.join(", ")}` },
          { status: 409 },
        );
      }

      const blockedByItem = selectedRows
        .filter((row) => blockedItemIds.includes(row.menuItemId))
        .map((row) => row.name);
      if (blockedByItem.length > 0) {
        return NextResponse.json(
          { error: `Blocked items: ${blockedByItem.join(", ")}` },
          { status: 409 },
        );
      }

      if (control.perOrderLimit && updatedTotal > control.perOrderLimit) {
        return NextResponse.json(
          {
            error: `Per-order limit exceeded (limit Rs${control.perOrderLimit}, selected Rs${Math.round(updatedTotal)})`,
          },
          { status: 409 },
        );
      }

      if (control.dailySpendLimit && updatedTotal > control.dailySpendLimit) {
        return NextResponse.json(
          {
            error: `Daily spend limit can block this selection (limit Rs${control.dailySpendLimit}, selected Rs${Math.round(updatedTotal)})`,
          },
          { status: 409 },
        );
      }
    }

    await db.transaction(async (tx) => {
      const existingFulfilledMap = new Map(
        existingRows.map((row) => [`${row.menuItemId}::${row.breakName || ""}`, row.lastFulfilledOn] as const),
      );
      await tx.delete(preOrderItem).where(eq(preOrderItem.preOrderId, target.id));
      await tx.insert(preOrderItem).values(
        body.items.map((item) => ({
          preOrderId: target.id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          breakName: item.breakName,
          lastFulfilledOn: existingFulfilledMap.get(`${item.menuItemId}::${item.breakName}`) ?? null,
        })),
      );
    });

    broadcast("orders-updated");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Edit pre-order error:", error);
    return NextResponse.json({ error: "Failed to update pre-order" }, { status: 500 });
  }
}
