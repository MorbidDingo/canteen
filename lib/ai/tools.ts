import { db } from "@/lib/db";
import {
  menuItem,
  wallet,
  walletTransaction,
  order,
  orderItem,
  child,
  parentControl,
  preOrder,
  preOrderItem,
  discount,
  certeSubscription,
  parentNotification,
  appSetting,
} from "@/lib/db/schema";
import { eq, and, gte, desc, ne, inArray, asc } from "drizzle-orm";
import { generateTokenCode, CERTE_PLUS, APP_SETTINGS_DEFAULTS, MAX_ACTIVE_PREORDERS_PER_CHILD } from "@/lib/constants";
import { validateUnits, decrementUnits } from "@/lib/units";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";
import { getRecommendations } from "@/lib/ml/recommendation-engine";
import { getWalletForecast } from "@/lib/ml/predictive-wallet";
import { runBatchAnomalyDetection, type AnomalyAlert } from "@/lib/ml/anomaly-detection";
import { getParentControls, getWalletHistory } from "@/lib/ml/data-collector";
import type Anthropic from "@anthropic-ai/sdk";

// ─── Context passed to every tool handler ────────────────

export interface ToolContext {
  userId: string;
  orgId: string;
  childIds: string[];
}

// ─── Tool Definitions (Claude tool_use format) ──────────

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  // ─── Information Tools ─────────────────────────────────
  {
    name: "get_menu",
    description:
      "Get the current menu for the school canteen. Returns available items with prices, categories, and active discounts. Use this when the user asks about what's available, prices, or food options.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          enum: ["SNACKS", "MEALS", "DRINKS", "PACKED_FOOD"],
          description: "Optional: filter by category",
        },
      },
      required: [],
    },
  },
  {
    name: "get_wallet_balance",
    description:
      "Get the current wallet balance for the family. All children share one wallet. Use when the user asks about balance, how much money they have, or before placing an order.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_order_history",
    description:
      "Get recent order history for a specific child. Use when the user asks about past orders, what was ordered, or spending history.",
    input_schema: {
      type: "object" as const,
      properties: {
        childId: {
          type: "string",
          description: "The child's ID. If not provided, uses the first child.",
        },
        days: {
          type: "number",
          description: "Number of days of history to fetch. Default: 7",
        },
      },
      required: [],
    },
  },
  {
    name: "get_recommendations",
    description:
      "Get personalized food recommendations for a child based on their preferences, time of day, popularity, and peer behavior. Use when user asks 'what should I order?', 'what's good today?', or similar.",
    input_schema: {
      type: "object" as const,
      properties: {
        childId: {
          type: "string",
          description: "The child's ID. If not provided, uses the first child.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of recommendations. Default: 5",
        },
      },
      required: [],
    },
  },
  {
    name: "get_wallet_forecast",
    description:
      "Get a forecast of when the wallet balance will run out, projected daily spending, and recharge recommendations. Use when the user asks about when to recharge or spending projections.",
    input_schema: {
      type: "object" as const,
      properties: {
        childId: {
          type: "string",
          description: "The child's ID. If not provided, uses the first child.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_anomaly_alerts",
    description:
      "Check for anomalies in a child's ordering patterns — spending spikes, skipped meals, restricted item purchases, or unusual timing. Use when the parent asks 'how is my child doing?', 'anything unusual?', or similar.",
    input_schema: {
      type: "object" as const,
      properties: {
        childId: {
          type: "string",
          description: "The child's ID. If not provided, checks all children.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_parent_controls",
    description:
      "Get the current parent control settings for a child — daily spend limits, per-order limits, blocked categories, and blocked items.",
    input_schema: {
      type: "object" as const,
      properties: {
        childId: {
          type: "string",
          description: "The child's ID. If not provided, uses the first child.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_pre_orders",
    description:
      "Get active pre-orders (scheduled/subscription orders) for a child. Use when the user asks about upcoming or recurring orders.",
    input_schema: {
      type: "object" as const,
      properties: {
        childId: {
          type: "string",
          description: "The child's ID. If not provided, uses the first child.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_child_info",
    description:
      "Get information about the user's children — names, classes, wallet balance. Use when needing to identify which child the user is talking about.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },

  // ─── Action Tools ──────────────────────────────────────
  {
    name: "place_order",
    description:
      "Place a canteen order for a child using wallet payment. Validates balance and parent controls before placing. ALWAYS confirm with the user before calling this tool — show them the items and total first.",
    input_schema: {
      type: "object" as const,
      properties: {
        childId: {
          type: "string",
          description: "The child's ID (required)",
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              menuItemId: { type: "string" },
              quantity: { type: "number" },
              instructions: { type: "string" },
            },
            required: ["menuItemId", "quantity"],
          },
          description: "Array of items to order with menuItemId and quantity",
        },
      },
      required: ["childId", "items"],
    },
  },
  {
    name: "schedule_order",
    description:
      "Create a subscription pre-order that repeats daily on school days. Pre-orders require a minimum daily total of ₹60 and run for the remaining school days in the user's Certe+ subscription (minimum 5 school days). Items must be marked as subscribable. Use when the user says 'pre-order X every day' or 'schedule daily lunch'. Do NOT use for one-time orders — use place_order instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        childId: {
          type: "string",
          description: "The child's ID (required)",
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              menuItemId: { type: "string" },
              quantity: { type: "number", minimum: 1 },
              breakName: { type: "string" },
            },
            required: ["menuItemId", "quantity"],
          },
          description: "Array of items to pre-order daily. Daily total must be at least ₹60.",
        },
      },
      required: ["childId", "items"],
    },
  },
  {
    name: "cancel_order",
    description:
      "Cancel a placed order. Only works for orders in PLACED status. Ask for confirmation before cancelling.",
    input_schema: {
      type: "object" as const,
      properties: {
        orderId: {
          type: "string",
          description: "The order ID to cancel",
        },
      },
      required: ["orderId"],
    },
  },
];

// ─── Tool Handlers ───────────────────────────────────────

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  switch (toolName) {
    case "get_menu":
      return handleGetMenu(ctx, toolInput);
    case "get_wallet_balance":
      return handleGetWalletBalance(ctx);
    case "get_order_history":
      return handleGetOrderHistory(ctx, toolInput);
    case "get_recommendations":
      return handleGetRecommendations(ctx, toolInput);
    case "get_wallet_forecast":
      return handleGetWalletForecast(ctx, toolInput);
    case "get_anomaly_alerts":
      return handleGetAnomalyAlerts(ctx, toolInput);
    case "get_parent_controls":
      return handleGetParentControls(ctx, toolInput);
    case "get_pre_orders":
      return handleGetPreOrders(ctx, toolInput);
    case "get_child_info":
      return handleGetChildInfo(ctx);
    case "place_order":
      return handlePlaceOrder(ctx, toolInput);
    case "schedule_order":
      return handleScheduleOrder(ctx, toolInput);
    case "cancel_order":
      return handleCancelOrder(ctx, toolInput);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ─── Information Tool Handlers ───────────────────────────

async function handleGetMenu(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const category = input.category as "SNACKS" | "MEALS" | "DRINKS" | "PACKED_FOOD" | undefined;

  const conditions = [
    eq(menuItem.organizationId, ctx.orgId),
    eq(menuItem.available, true),
  ];
  if (category) {
    conditions.push(eq(menuItem.category, category));
  }

  const items = await db
    .select({
      id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      category: menuItem.category,
      description: menuItem.description,
      availableUnits: menuItem.availableUnits,
    })
    .from(menuItem)
    .where(and(...conditions));

  // Fetch active discounts
  const menuItemIds = items.map((i) => i.id);
  const discounts = menuItemIds.length > 0
    ? await db
        .select()
        .from(discount)
        .where(and(eq(discount.active, true), inArray(discount.menuItemId, menuItemIds)))
    : [];

  const now = new Date();
  const discountMap = new Map(
    discounts
      .filter((d) => (!d.startDate || d.startDate <= now) && (!d.endDate || d.endDate >= now))
      .map((d) => [d.menuItemId, d]),
  );

  const enriched = items
    .filter((i) => i.availableUnits === null || i.availableUnits > 0)
    .map((i) => {
      const d = discountMap.get(i.id);
      let discountedPrice: number | null = null;
      if (d) {
        discountedPrice =
          d.type === "PERCENTAGE"
            ? Math.round(i.price * (1 - d.value / 100) * 100) / 100
            : Math.max(0, Math.round((i.price - d.value) * 100) / 100);
      }
      return {
        id: i.id,
        name: i.name,
        price: i.price,
        discountedPrice,
        category: i.category,
        description: i.description,
        inStock: i.availableUnits === null ? true : i.availableUnits > 0,
        unitsLeft: i.availableUnits,
      };
    });

  return JSON.stringify({ items: enriched, count: enriched.length });
}

async function handleGetWalletBalance(ctx: ToolContext): Promise<string> {
  if (ctx.childIds.length === 0) {
    return JSON.stringify({ balance: 0, message: "No children linked to this account" });
  }

  const wallets = await db
    .select({ balance: wallet.balance })
    .from(wallet)
    .where(inArray(wallet.childId, ctx.childIds))
    .orderBy(asc(wallet.createdAt))
    .limit(1);

  return JSON.stringify({ balance: wallets[0]?.balance ?? 0 });
}

async function handleGetOrderHistory(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const childId = resolveChildId(ctx, input.childId as string | undefined);
  const days = (input.days as number) || 7;

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - days + 1);

  const orders = await db
    .select({
      id: order.id,
      tokenCode: order.tokenCode,
      totalAmount: order.totalAmount,
      status: order.status,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
    })
    .from(order)
    .where(
      and(
        eq(order.userId, ctx.userId),
        eq(order.childId, childId),
        gte(order.createdAt, since),
      ),
    )
    .orderBy(desc(order.createdAt))
    .limit(20);

  // Fetch items for each order
  const orderIds = orders.map((o) => o.id);
  const items =
    orderIds.length > 0
      ? await db
          .select({
            orderId: orderItem.orderId,
            name: menuItem.name,
            quantity: orderItem.quantity,
            unitPrice: orderItem.unitPrice,
          })
          .from(orderItem)
          .innerJoin(menuItem, eq(orderItem.menuItemId, menuItem.id))
          .where(inArray(orderItem.orderId, orderIds))
      : [];

  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    const existing = itemsByOrder.get(item.orderId) ?? [];
    existing.push(item);
    itemsByOrder.set(item.orderId, existing);
  }

  const result = orders.map((o) => ({
    id: o.id,
    tokenCode: o.tokenCode,
    totalAmount: o.totalAmount,
    status: o.status,
    paymentMethod: o.paymentMethod,
    createdAt: o.createdAt,
    items: (itemsByOrder.get(o.id) ?? []).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
  }));

  return JSON.stringify({ orders: result, count: result.length, days });
}

async function handleGetRecommendations(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const childId = resolveChildId(ctx, input.childId as string | undefined);
  const maxResults = (input.maxResults as number) || 5;

  // Get child's className for peer behavior
  const [childRow] = await db
    .select({ className: child.className })
    .from(child)
    .where(eq(child.id, childId))
    .limit(1);

  const recs = await getRecommendations(childId, ctx.orgId, {
    className: childRow?.className,
    maxResults,
  });

  return JSON.stringify({
    recommendations: recs.map((r) => ({
      menuItemId: r.menuItemId,
      name: r.name,
      category: r.category,
      price: r.price,
      score: Math.round(r.score * 100) / 100,
      reasons: r.reasons,
    })),
  });
}

async function handleGetWalletForecast(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const childId = resolveChildId(ctx, input.childId as string | undefined);

  const controls = await getParentControls(childId);
  const forecast = await getWalletForecast(childId, ctx.orgId, controls.dailySpendLimit);

  return JSON.stringify(forecast);
}

async function handleGetAnomalyAlerts(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const targetChildId = input.childId as string | undefined;

  if (targetChildId) {
    // Single child
    const alerts = await runBatchAnomalyDetection(ctx.orgId);
    const childAlerts = alerts.filter((a) => a.childId === targetChildId);
    return JSON.stringify({ alerts: childAlerts, count: childAlerts.length });
  }

  // All children
  const alerts = await runBatchAnomalyDetection(ctx.orgId);
  const relevant = alerts.filter((a) => ctx.childIds.includes(a.childId));
  return JSON.stringify({ alerts: relevant, count: relevant.length });
}

async function handleGetParentControls(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const childId = resolveChildId(ctx, input.childId as string | undefined);
  const controls = await getParentControls(childId);
  return JSON.stringify(controls);
}

async function handleGetPreOrders(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const childId = resolveChildId(ctx, input.childId as string | undefined);

  const preOrders = await db
    .select({
      id: preOrder.id,
      mode: preOrder.mode,
      scheduledDate: preOrder.scheduledDate,
      subscriptionUntil: preOrder.subscriptionUntil,
      status: preOrder.status,
      createdAt: preOrder.createdAt,
    })
    .from(preOrder)
    .where(
      and(
        eq(preOrder.childId, childId),
        eq(preOrder.parentId, ctx.userId),
        eq(preOrder.status, "PENDING"),
      ),
    )
    .orderBy(desc(preOrder.createdAt));

  // Fetch items
  const preOrderIds = preOrders.map((p) => p.id);
  const items =
    preOrderIds.length > 0
      ? await db
          .select({
            preOrderId: preOrderItem.preOrderId,
            name: menuItem.name,
            quantity: preOrderItem.quantity,
            breakName: preOrderItem.breakName,
          })
          .from(preOrderItem)
          .innerJoin(menuItem, eq(preOrderItem.menuItemId, menuItem.id))
          .where(inArray(preOrderItem.preOrderId, preOrderIds))
      : [];

  const itemsByPreOrder = new Map<string, typeof items>();
  for (const item of items) {
    const existing = itemsByPreOrder.get(item.preOrderId) ?? [];
    existing.push(item);
    itemsByPreOrder.set(item.preOrderId, existing);
  }

  const result = preOrders.map((p) => ({
    ...p,
    items: (itemsByPreOrder.get(p.id) ?? []).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      breakName: i.breakName,
    })),
  }));

  return JSON.stringify({ preOrders: result, count: result.length });
}

async function handleGetChildInfo(ctx: ToolContext): Promise<string> {
  if (ctx.childIds.length === 0) {
    return JSON.stringify({ children: [], message: "No children linked" });
  }

  const children = await db
    .select({
      id: child.id,
      name: child.name,
      className: child.className,
      section: child.section,
      grNumber: child.grNumber,
    })
    .from(child)
    .where(inArray(child.id, ctx.childIds));

  const wallets = await db
    .select({ balance: wallet.balance })
    .from(wallet)
    .where(inArray(wallet.childId, ctx.childIds))
    .orderBy(asc(wallet.createdAt))
    .limit(1);

  return JSON.stringify({
    children,
    familyWalletBalance: wallets[0]?.balance ?? 0,
  });
}

// ─── Action Tool Handlers ────────────────────────────────

async function handlePlaceOrder(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const childId = input.childId as string;
  const items = input.items as { menuItemId: string; quantity: number; instructions?: string }[];

  if (!childId || !items?.length) {
    return JSON.stringify({ error: "childId and items are required" });
  }

  // Verify child belongs to user
  if (!ctx.childIds.includes(childId)) {
    return JSON.stringify({ error: "Child not found or doesn't belong to you" });
  }

  // Fetch menu items and validate
  const menuItemIds = items.map((i) => i.menuItemId);
  const menuItems = await db
    .select()
    .from(menuItem)
    .where(and(inArray(menuItem.id, menuItemIds), eq(menuItem.organizationId, ctx.orgId)));

  const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

  for (const item of items) {
    const mi = menuItemMap.get(item.menuItemId);
    if (!mi) return JSON.stringify({ error: `Menu item not found: ${item.menuItemId}` });
    if (!mi.available) return JSON.stringify({ error: `${mi.name} is currently unavailable` });
    if (mi.availableUnits !== null && mi.availableUnits < item.quantity) {
      return JSON.stringify({ error: `${mi.name} only has ${mi.availableUnits} units left` });
    }
  }

  // Check parent controls
  const controls = await getParentControls(childId);
  for (const item of items) {
    const mi = menuItemMap.get(item.menuItemId)!;
    if (controls.blockedCategories.includes(mi.category)) {
      return JSON.stringify({ error: `${mi.name} is in a blocked category (${mi.category})` });
    }
    if (controls.blockedItemIds.includes(mi.id)) {
      return JSON.stringify({ error: `${mi.name} is blocked by parent controls` });
    }
  }

  // Fetch active discounts
  const activeDiscounts = await db
    .select()
    .from(discount)
    .where(and(eq(discount.active, true), inArray(discount.menuItemId, menuItemIds)));

  const now = new Date();
  const discountMap = new Map(
    activeDiscounts
      .filter((d) => (!d.startDate || d.startDate <= now) && (!d.endDate || d.endDate >= now))
      .map((d) => [d.menuItemId, d]),
  );

  // Calculate total with server prices
  const effectivePriceMap = new Map<string, number>();
  for (const mi of menuItems) {
    const d = discountMap.get(mi.id);
    if (d) {
      effectivePriceMap.set(
        mi.id,
        d.type === "PERCENTAGE"
          ? Math.round(mi.price * (1 - d.value / 100) * 100) / 100
          : Math.max(0, Math.round((mi.price - d.value) * 100) / 100),
      );
    } else {
      effectivePriceMap.set(mi.id, mi.price);
    }
  }

  const totalAmount = items.reduce(
    (sum, item) => sum + effectivePriceMap.get(item.menuItemId)! * item.quantity,
    0,
  );

  // Check per-order limit
  if (controls.perOrderLimit !== null && totalAmount > controls.perOrderLimit) {
    return JSON.stringify({
      error: `Order total ₹${totalAmount} exceeds per-order limit of ₹${controls.perOrderLimit}`,
    });
  }

  // Validate stock
  const unitError = await validateUnits(
    items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
    db,
  );
  if (unitError) {
    return JSON.stringify({ error: unitError });
  }

  // Execute order in transaction
  try {
    const newOrder = await db.transaction(async (tx) => {
      // Get family wallet
      const wallets = await tx
        .select()
        .from(wallet)
        .where(inArray(wallet.childId, ctx.childIds))
        .orderBy(asc(wallet.createdAt))
        .limit(1);

      if (wallets.length === 0) {
        throw new Error("No wallet found");
      }

      const walletRow = wallets[0];
      if (walletRow.balance < totalAmount) {
        throw new Error(
          `Insufficient balance. Available: ₹${walletRow.balance.toFixed(2)}, Required: ₹${totalAmount.toFixed(2)}`,
        );
      }

      const tokenCode = generateTokenCode();

      const [createdOrder] = await tx
        .insert(order)
        .values({
          userId: ctx.userId,
          childId,
          totalAmount,
          tokenCode,
          paymentMethod: "WALLET",
          status: "PLACED",
          paymentStatus: "PAID",
        })
        .returning();

      await tx.insert(orderItem).values(
        items.map((item) => ({
          orderId: createdOrder.id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice: effectivePriceMap.get(item.menuItemId)!,
          instructions: item.instructions || null,
        })),
      );

      const newBalance = walletRow.balance - totalAmount;
      await tx
        .update(wallet)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(inArray(wallet.childId, ctx.childIds));

      await tx.insert(walletTransaction).values({
        walletId: walletRow.id,
        type: "DEBIT",
        amount: totalAmount,
        balanceAfter: newBalance,
        description: `Order #${tokenCode} via AI assistant`,
        orderId: createdOrder.id,
      });

      await decrementUnits(
        items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
        tx,
      );

      return { ...createdOrder, newBalance };
    });

    broadcast("orders-updated");
    broadcast("menu-updated");

    // Notify parent
    const itemNames = items
      .map((i) => menuItemMap.get(i.menuItemId)?.name ?? "item")
      .join(", ");

    notifyParentForChild({
      childId,
      type: "KIOSK_ORDER_GIVEN",
      title: "Order placed via AI assistant",
      message: `Order #${newOrder.tokenCode} for ₹${totalAmount} — ${itemNames}`,
      metadata: { orderId: newOrder.id, source: "ai_assistant" },
    }).catch(() => {});

    return JSON.stringify({
      success: true,
      orderId: newOrder.id,
      tokenCode: newOrder.tokenCode,
      totalAmount,
      newBalance: newOrder.newBalance,
      items: items.map((i) => ({
        name: menuItemMap.get(i.menuItemId)?.name,
        quantity: i.quantity,
        price: effectivePriceMap.get(i.menuItemId),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Order failed";
    return JSON.stringify({ error: message });
  }
}

async function handleScheduleOrder(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const childId = input.childId as string;
  const items = input.items as { menuItemId: string; quantity: number; breakName?: string }[];

  if (!childId || !items?.length) {
    return JSON.stringify({ error: "childId and items are required" });
  }

  if (!ctx.childIds.includes(childId)) {
    return JSON.stringify({ error: "Child not found or doesn't belong to you" });
  }

  // ── Check active Certe+ subscription ────────────────────
  const now = new Date();
  const [activeSub] = await db
    .select({ id: certeSubscription.id, endDate: certeSubscription.endDate })
    .from(certeSubscription)
    .where(
      and(
        eq(certeSubscription.parentId, ctx.userId),
        eq(certeSubscription.status, "ACTIVE"),
        gte(certeSubscription.endDate, now),
      ),
    )
    .limit(1);

  if (!activeSub) {
    return JSON.stringify({ error: "Active Certe+ subscription required for pre-orders." });
  }

  // ── Check existing active pre-orders ────────────────────
  const existingPreOrders = await db
    .select({ id: preOrder.id })
    .from(preOrder)
    .where(
      and(
        eq(preOrder.childId, childId),
        eq(preOrder.status, "PENDING"),
      ),
    );

  if (existingPreOrders.length >= MAX_ACTIVE_PREORDERS_PER_CHILD) {
    return JSON.stringify({ error: `This child already has an active pre-order. Cancel the existing one first.` });
  }

  // ── Load settings ───────────────────────────────────────
  const settingRows = await db.select().from(appSetting);
  const settings: Record<string, string> = { ...APP_SETTINGS_DEFAULTS };
  for (const row of settingRows) settings[row.key] = row.value;

  const MIN_PREORDER_VALUE = Number(settings.subscription_min_order_value) || 60;
  const MIN_SUBSCRIPTION_DAYS = Math.max(
    Number(settings.subscription_min_days) || 3,
    CERTE_PLUS.PRE_ORDER_MIN_SCHOOL_DAYS,
  );

  // ── Calculate school days from now to subscription end ──
  const startDate = getNextSchoolDay();
  const endDateStr = activeSub.endDate.toISOString().slice(0, 10);
  const schoolDays = countSchoolDaysInRange(new Date(startDate + "T00:00:00"), new Date(endDateStr + "T00:00:00"));

  if (schoolDays < MIN_SUBSCRIPTION_DAYS) {
    return JSON.stringify({
      error: `Not enough school days left in your subscription (${schoolDays} remaining, minimum ${MIN_SUBSCRIPTION_DAYS} required). Renew your Certe+ plan.`,
    });
  }

  // ── Validate menu items exist and are subscribable ──────
  const menuItemIds = items.map((i) => i.menuItemId);
  const menuItems = await db
    .select({
      id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      category: menuItem.category,
      subscribable: menuItem.subscribable,
    })
    .from(menuItem)
    .where(and(inArray(menuItem.id, menuItemIds), eq(menuItem.organizationId, ctx.orgId)));

  if (menuItems.length !== menuItemIds.length) {
    return JSON.stringify({ error: "One or more menu items not found" });
  }

  const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

  // Check subscribable
  for (const mi of menuItems) {
    if (!mi.subscribable) {
      return JSON.stringify({ error: `${mi.name} is not available for pre-order subscriptions.` });
    }
  }

  // ── Check parent controls ──────────────────────────────
  const controls = await getParentControls(childId);
  for (const item of items) {
    const mi = menuItemMap.get(item.menuItemId);
    if (!mi) continue;
    if (controls.blockedCategories.includes(mi.category)) {
      return JSON.stringify({ error: `${mi.name} is in a blocked category.` });
    }
    if (controls.blockedItemIds.includes(mi.id)) {
      return JSON.stringify({ error: `${mi.name} is blocked by parent controls.` });
    }
  }

  // ── Calculate daily cost and validate minimum ──────────
  const dailyCost = items.reduce((sum, item) => {
    const mi = menuItemMap.get(item.menuItemId)!;
    return sum + mi.price * item.quantity;
  }, 0);

  if (dailyCost < MIN_PREORDER_VALUE) {
    return JSON.stringify({
      error: `Minimum daily pre-order value is ₹${MIN_PREORDER_VALUE}. Current selection totals ₹${Math.round(dailyCost)}. Add more items or increase quantity.`,
    });
  }

  // ── Calculate total with platform fee ──────────────────
  const platformFeeMultiplier = 1 + CERTE_PLUS.PRE_ORDER_PLATFORM_FEE_PERCENT / 100;
  const totalCost = Math.round(dailyCost * schoolDays * platformFeeMultiplier * 100) / 100;

  // ── Check wallet balance ───────────────────────────────
  const [walletRow] = await db
    .select()
    .from(wallet)
    .where(inArray(wallet.childId, ctx.childIds))
    .orderBy(asc(wallet.createdAt))
    .limit(1);

  if (!walletRow || walletRow.balance < totalCost) {
    return JSON.stringify({
      error: `Insufficient balance. Need ₹${totalCost.toFixed(2)} for ${schoolDays} school days (₹${Math.round(dailyCost)}/day + ${CERTE_PLUS.PRE_ORDER_PLATFORM_FEE_PERCENT}% fee), available ₹${(walletRow?.balance ?? 0).toFixed(2)}. Top up your wallet first.`,
    });
  }

  // ── Default break name ─────────────────────────────────
  let defaultBreak = "Lunch Break";
  try {
    const breaksJson = settings.subscription_breaks_json;
    const breaks = JSON.parse(breaksJson) as { name: string }[];
    if (breaks.length > 0) defaultBreak = breaks[0].name;
  } catch { /* use default */ }

  // ── Create subscription pre-order with wallet deduction ─
  const created = await db.transaction(async (tx) => {
    const [latestWallet] = await tx
      .select()
      .from(wallet)
      .where(inArray(wallet.childId, ctx.childIds))
      .orderBy(asc(wallet.createdAt))
      .limit(1);

    if (!latestWallet || latestWallet.balance < totalCost) {
      throw new Error("Insufficient balance");
    }

    const newBalance = latestWallet.balance - totalCost;
    await tx
      .update(wallet)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(inArray(wallet.childId, ctx.childIds));

    await tx.insert(walletTransaction).values({
      walletId: latestWallet.id,
      type: "DEBIT",
      amount: totalCost,
      balanceAfter: newBalance,
      description: `Pre-order subscription (${schoolDays} school days, incl. ${CERTE_PLUS.PRE_ORDER_PLATFORM_FEE_PERCENT}% platform fee) via AI assistant`,
    });

    const [po] = await tx
      .insert(preOrder)
      .values({
        childId,
        parentId: ctx.userId,
        mode: "SUBSCRIPTION",
        scheduledDate: startDate,
        subscriptionUntil: endDateStr,
        status: "PENDING",
      })
      .returning();

    await tx.insert(preOrderItem).values(
      items.map((item) => ({
        preOrderId: po.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        breakName: item.breakName || defaultBreak,
      })),
    );

    return po;
  });

  return JSON.stringify({
    success: true,
    preOrderId: created.id,
    mode: "SUBSCRIPTION",
    startDate,
    endDate: endDateStr,
    schoolDays,
    dailyCost: Math.round(dailyCost),
    totalCost,
    items: items.map((i) => ({
      name: menuItemMap.get(i.menuItemId)?.name,
      quantity: i.quantity,
      breakName: i.breakName || defaultBreak,
    })),
  });
}

// ─── Pre-order Helpers ───────────────────────────────────

function getNextSchoolDay(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1); // start from tomorrow
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

function countSchoolDaysInRange(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

async function handleCancelOrder(
  ctx: ToolContext,
  input: Record<string, unknown>,
): Promise<string> {
  const orderId = input.orderId as string;
  if (!orderId) {
    return JSON.stringify({ error: "orderId is required" });
  }

  // Fetch order and verify ownership
  const [orderRow] = await db
    .select()
    .from(order)
    .where(and(eq(order.id, orderId), eq(order.userId, ctx.userId)))
    .limit(1);

  if (!orderRow) {
    return JSON.stringify({ error: "Order not found" });
  }

  if (orderRow.status !== "PLACED") {
    return JSON.stringify({
      error: `Cannot cancel order in ${orderRow.status} status. Only PLACED orders can be cancelled.`,
    });
  }

  // Cancel and refund if wallet payment
  await db
    .update(order)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(order.id, orderId));

  let refundedBalance: number | null = null;

  if (orderRow.paymentMethod === "WALLET" && orderRow.paymentStatus === "PAID") {
    const childId = orderRow.childId;
    if (childId) {
      const siblingChildRows = await db
        .select({ id: child.id })
        .from(child)
        .where(eq(child.parentId, ctx.userId));
      const siblingChildIds = siblingChildRows.map((c) => c.id);

      const [walletRow] = await db
        .select()
        .from(wallet)
        .where(inArray(wallet.childId, siblingChildIds))
        .orderBy(asc(wallet.createdAt))
        .limit(1);

      if (walletRow) {
        const newBalance = walletRow.balance + orderRow.totalAmount;
        await db
          .update(wallet)
          .set({ balance: newBalance, updatedAt: new Date() })
          .where(eq(wallet.id, walletRow.id));

        await db.insert(walletTransaction).values({
          walletId: walletRow.id,
          type: "REFUND",
          amount: orderRow.totalAmount,
          balanceAfter: newBalance,
          description: `Refund for cancelled order #${orderRow.tokenCode || orderId.slice(0, 6)} via AI assistant`,
          orderId,
        });

        refundedBalance = newBalance;
      }
    }
  }

  broadcast("orders-updated");

  return JSON.stringify({
    success: true,
    orderId,
    status: "CANCELLED",
    refunded: refundedBalance !== null,
    newBalance: refundedBalance,
  });
}

// ─── Helpers ─────────────────────────────────────────────

function resolveChildId(ctx: ToolContext, inputChildId?: string): string {
  if (inputChildId && ctx.childIds.includes(inputChildId)) {
    return inputChildId;
  }
  return ctx.childIds[0] ?? "";
}
