import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { preOrder, preOrderItem, child, menuItem, parentControl, discount, appSetting, certeSubscription } from "@/lib/db/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";
import { APP_SETTINGS_DEFAULTS } from "@/lib/constants";

async function getAppSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSetting);
  const settings: Record<string, string> = { ...APP_SETTINGS_DEFAULTS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

async function hasActiveCertePlus(parentId: string): Promise<boolean> {
  const now = new Date();
  const [active] = await db
    .select({ id: certeSubscription.id })
    .from(certeSubscription)
    .where(
      and(
        eq(certeSubscription.parentId, parentId),
        eq(certeSubscription.status, "ACTIVE"),
        gte(certeSubscription.endDate, now),
      ),
    )
    .limit(1);
  return !!active;
}

function safeParseJSON(val: string | null): string[] {
  if (!val) return [];
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}

function dateDiffInDaysInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

// GET /api/pre-orders — list pre-orders for the logged-in parent
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
    .limit(50);

  // Fetch items for each pre-order
  const result = await Promise.all(
    preOrders.map(async (po) => {
      const items = await db
        .select({
          name: menuItem.name,
          quantity: preOrderItem.quantity,
        })
        .from(preOrderItem)
        .innerJoin(menuItem, eq(menuItem.id, preOrderItem.menuItemId))
        .where(eq(preOrderItem.preOrderId, po.id));

      return { ...po, items };
    })
  );

  return NextResponse.json(result);
}

// POST /api/pre-orders — create subscription pre-order
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      childId: string;
      mode?: "ONE_DAY" | "SUBSCRIPTION";
      scheduledDate: string;
      subscriptionUntil?: string | null;
      items: { menuItemId: string; quantity: number }[];
    };

    const mode = "SUBSCRIPTION";
    const items = body.items || [];

    if (!body.childId || !body.scheduledDate || items.length === 0) {
      return NextResponse.json(
        { error: "childId, scheduledDate and at least one item are required" },
        { status: 400 }
      );
    }

    // Check Certe+ subscription requirement
    const isCertePlus = await hasActiveCertePlus(session.user.id);
    if (!isCertePlus) {
      return NextResponse.json(
        { error: "An active Certe+ subscription is required to use pre-orders. Subscribe for Rs99/month from your settings page." },
        { status: 403 }
      );
    }

    if (!body.subscriptionUntil) {
      return NextResponse.json(
        { error: "subscriptionUntil is required for subscription" },
        { status: 400 }
      );
    }

    if (body.subscriptionUntil < body.scheduledDate) {
      return NextResponse.json(
        { error: "Subscription end date cannot be before start date" },
        { status: 400 }
      );
    }

    // Get dynamic settings
    const settings = await getAppSettings();
    const MIN_PREORDER_VALUE = Number(settings.subscription_min_order_value) || 60;
    const MIN_SUBSCRIPTION_DAYS = Number(settings.subscription_min_days) || 3;
    const MAX_SUBSCRIPTION_DAYS = Number(settings.subscription_max_days) || 180;

    const durationDays = dateDiffInDaysInclusive(body.scheduledDate, body.subscriptionUntil);
    if (durationDays < MIN_SUBSCRIPTION_DAYS || durationDays > MAX_SUBSCRIPTION_DAYS) {
      return NextResponse.json(
        {
          error: `Subscription duration must be between ${MIN_SUBSCRIPTION_DAYS} and ${MAX_SUBSCRIPTION_DAYS} days`,
        },
        { status: 400 }
      );
    }

    const childRows = await db
      .select({ id: child.id, parentId: child.parentId })
      .from(child)
      .where(eq(child.id, body.childId))
      .limit(1);

    if (childRows.length === 0) {
      return NextResponse.json({ error: "Child not found" }, { status: 404 });
    }

    if (childRows[0].parentId !== session.user.id) {
      return NextResponse.json({ error: "Child not found" }, { status: 404 });
    }

    const menuRows = await db
      .select({ id: menuItem.id, available: menuItem.available, category: menuItem.category, price: menuItem.price, name: menuItem.name, subscribable: menuItem.subscribable })
      .from(menuItem);

    const now = new Date();
    const activeDiscounts = await db
      .select()
      .from(discount)
      .where(eq(discount.active, true));
    const discountMap = new Map(
      activeDiscounts
        .filter((d) => (!d.startDate || d.startDate <= now) && (!d.endDate || d.endDate >= now))
        .map((d) => [d.menuItemId, d])
    );

    const menuMap = new Map(menuRows.map((m) => [m.id, m]));

    let total = 0;
    const selectedRows: Array<(typeof menuRows)[number] & { quantity: number }> = [];
    for (const item of items) {
      const menu = menuMap.get(item.menuItemId);
      if (!menu || !menu.available || item.quantity <= 0) {
        return NextResponse.json(
          { error: "One or more selected items are invalid or unavailable" },
          { status: 400 }
        );
      }
      if (!menu.subscribable) {
        return NextResponse.json(
          { error: `"${menu.name}" is not available for subscriptions` },
          { status: 400 }
        );
      }
      const d = discountMap.get(menu.id);
      const effectivePrice = d
        ? d.type === "PERCENTAGE"
          ? Math.round(menu.price * (1 - d.value / 100) * 100) / 100
          : Math.max(0, Math.round((menu.price - d.value) * 100) / 100)
        : menu.price;

      total += effectivePrice * item.quantity;
      selectedRows.push({ ...menu, quantity: item.quantity });
    }

    if (total < MIN_PREORDER_VALUE) {
      return NextResponse.json(
        { error: `Minimum pre-order value is Rs${MIN_PREORDER_VALUE}` },
        { status: 400 }
      );
    }

    const controlRows = await db
      .select({
        dailySpendLimit: parentControl.dailySpendLimit,
        perOrderLimit: parentControl.perOrderLimit,
        blockedCategories: parentControl.blockedCategories,
        blockedItemIds: parentControl.blockedItemIds,
      })
      .from(parentControl)
      .where(eq(parentControl.childId, body.childId))
      .limit(1);

    const control = controlRows[0] ?? null;
    const blockedReasons: string[] = [];

    if (control) {
      const blockedCategories = safeParseJSON(control.blockedCategories);
      const blockedItemIds = safeParseJSON(control.blockedItemIds);

      const blockedByCategory = selectedRows
        .filter((row) => blockedCategories.includes(row.category))
        .map((row) => `${row.name} (${row.category})`);
      if (blockedByCategory.length > 0) {
        blockedReasons.push(`Blocked category items: ${blockedByCategory.join(", ")}`);
      }

      const blockedByItem = selectedRows
        .filter((row) => blockedItemIds.includes(row.id))
        .map((row) => row.name);
      if (blockedByItem.length > 0) {
        blockedReasons.push(`Blocked items: ${blockedByItem.join(", ")}`);
      }

      if (control.perOrderLimit && total > control.perOrderLimit) {
        blockedReasons.push(
          `Per-order limit exceeded (limit Rs${control.perOrderLimit}, selected Rs${Math.round(total)})`
        );
      }

      if (control.dailySpendLimit && total > control.dailySpendLimit) {
        blockedReasons.push(
          `Daily limit may block this selection (limit Rs${control.dailySpendLimit}, selected Rs${Math.round(total)})`
        );
      }
    }

    if (blockedReasons.length > 0) {
      return NextResponse.json(
        {
          error: "Selection is blocked by parent controls",
          blockedReasons,
          requiresControlUpdate: true,
        },
        { status: 409 }
      );
    }

    const [created] = await db
      .insert(preOrder)
      .values({
        childId: body.childId,
        parentId: session.user.id,
        mode,
        scheduledDate: body.scheduledDate,
        subscriptionUntil: body.subscriptionUntil,
        status: "PENDING",
      })
      .returning({ id: preOrder.id });

    await db.insert(preOrderItem).values(
      items.map((item) => ({
        preOrderId: created.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
      }))
    );

    broadcast("orders-updated");

    const itemNames = selectedRows.map((r) => r.name).join(", ");
    notifyParentForChild({
      childId: body.childId,
      type: "KIOSK_PREORDER_TAKEN",
      title: "Pre-order created",
      message: `A subscription pre-order (${itemNames}) has been set from ${body.scheduledDate} to ${body.subscriptionUntil}.`,
      metadata: { preOrderId: created.id, scheduledDate: body.scheduledDate, subscriptionUntil: body.subscriptionUntil },
    }).catch(() => {});

    return NextResponse.json({ success: true, id: created.id });
  } catch {
    return NextResponse.json({ error: "Failed to create pre-order" }, { status: 500 });
  }
}
