import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  child,
  wallet,
  walletTransaction,
  parentControl,
  menuItem,
  order,
  orderItem,
  discount,
  preOrder,
  preOrderItem,
  certeSubscription,
} from "@/lib/db/schema";
import { eq, and, gte, sql, asc, inArray } from "drizzle-orm";
import { generateTokenCode, CERTE_PLUS } from "@/lib/constants";
import { broadcast } from "@/lib/sse";
import { validateUnits, decrementUnits } from "@/lib/units";
import { notifyParentForChild } from "@/lib/parent-notifications";

type IncomingItem = { menuItemId: string; quantity: number };

type PlaceOrderResult = {
  success: boolean;
  reason?: string;
  tokenCode?: string;
  childName?: string;
  items?: { name: string; quantity: number; subtotal: number }[];
  total?: number;
  balanceAfter?: number;
};

function safeParseJSON(val: string | null): string[] {
  if (!val) return [];
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatItemSummary(items: { name: string; quantity: number }[]) {
  return items.map((item) => `${item.name} x${item.quantity}`).join(", ");
}

async function placeOrderFromItems(
  rfidCardId: string,
  items: IncomingItem[],
  sourceLabel: string,
): Promise<PlaceOrderResult> {
  if (!rfidCardId || !items || !Array.isArray(items) || items.length === 0) {
    return { success: false, reason: "Invalid request" };
  }

  const children = await db
    .select()
    .from(child)
    .where(eq(child.rfidCardId, rfidCardId))
    .limit(1);

  if (children.length === 0) {
    return {
      success: false,
      reason: "Unknown card. Please ask the school office to register your card.",
    };
  }

  const studentChild = children[0];

  async function notifyBlockedAttempt(reason: string) {
    await notifyParentForChild({
      childId: studentChild.id,
      type: "BLOCKED_FOOD_ATTEMPT",
      title: `${studentChild.name} had a blocked food attempt`,
      message: reason,
      metadata: {
        rfidCardId,
        attemptedItems: items,
        source: sourceLabel,
      },
    });
  }

  const siblingRows = await db
    .select({ id: child.id })
    .from(child)
    .where(eq(child.parentId, studentChild.parentId));
  const siblingIds = siblingRows.map((s) => s.id);

  const wallets = await db
    .select()
    .from(wallet)
    .where(inArray(wallet.childId, siblingIds))
    .orderBy(asc(wallet.createdAt))
    .limit(1);

  if (wallets.length === 0) {
    return {
      success: false,
      reason: "No wallet found for this card. Please contact the school office.",
    };
  }

  const studentWallet = wallets[0];

  const controls = await db
    .select()
    .from(parentControl)
    .where(eq(parentControl.childId, studentChild.id))
    .limit(1);

  const control = controls[0] || null;

  const menuItemIds = items.map((i) => i.menuItemId);
  const menuItems = await db
    .select()
    .from(menuItem)
    .where(
      sql`${menuItem.id} IN (${sql.join(
        menuItemIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    );

  if (menuItems.length !== menuItemIds.length) {
    return { success: false, reason: "One or more items are no longer available." };
  }

  const unavailable = menuItems.filter((m) => !m.available);
  if (unavailable.length > 0) {
    return {
      success: false,
      reason: `"${unavailable[0].name}" is currently unavailable.`,
    };
  }

  if (control) {
    const blockedCategories = safeParseJSON(control.blockedCategories);
    if (blockedCategories.length > 0) {
      for (const m of menuItems) {
        if (blockedCategories.includes(m.category)) {
          const reason = `Blocked food attempt: ${m.name} (${m.category}) is blocked by parent controls.`;
          await notifyBlockedAttempt(reason);
          return {
            success: false,
            reason,
          };
        }
      }
    }

    const blockedItemIds = safeParseJSON(control.blockedItemIds);
    if (blockedItemIds.length > 0) {
      for (const m of menuItems) {
        if (blockedItemIds.includes(m.id)) {
          const reason = `Blocked food attempt: ${m.name} is blocked by parent controls.`;
          await notifyBlockedAttempt(reason);
          return {
            success: false,
            reason,
          };
        }
      }
    }
  }

  const activeDiscounts = await db.select().from(discount).where(eq(discount.active, true));

  const now = new Date();
  const discountMap = new Map(
    activeDiscounts
      .filter((d) => (!d.startDate || d.startDate <= now) && (!d.endDate || d.endDate >= now))
      .map((d) => [d.menuItemId, d])
  );

  let total = 0;
  const orderItemsData: {
    menuItemId: string;
    quantity: number;
    unitPrice: number;
    name: string;
  }[] = [];

  for (const cartItem of items) {
    const m = menuItems.find((mi) => mi.id === cartItem.menuItemId);
    if (!m) continue;
    const d = discountMap.get(m.id);
    let effectivePrice = m.price;
    if (d) {
      effectivePrice =
        d.type === "PERCENTAGE"
          ? Math.round(m.price * (1 - d.value / 100) * 100) / 100
          : Math.max(0, Math.round((m.price - d.value) * 100) / 100);
    }
    const subtotal = effectivePrice * cartItem.quantity;
    total += subtotal;
    orderItemsData.push({
      menuItemId: m.id,
      quantity: cartItem.quantity,
      unitPrice: effectivePrice,
      name: m.name,
    });
  }

  const unitError = await validateUnits(
    orderItemsData.map((oi) => ({ menuItemId: oi.menuItemId, quantity: oi.quantity })),
    db,
  );
  if (unitError) {
    return { success: false, reason: unitError };
  }

  if (control?.perOrderLimit && total > control.perOrderLimit) {
    const reason = `Blocked food attempt: per-order limit exceeded (limit Rs${control.perOrderLimit}, attempted Rs${total.toFixed(0)}).`;
    await notifyBlockedAttempt(reason);
    return {
      success: false,
      reason,
    };
  }

  if (control?.dailySpendLimit) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todaySpending = await db
      .select({ total: sql<number>`COALESCE(SUM(${walletTransaction.amount}), 0)` })
      .from(walletTransaction)
      .where(
        and(
          eq(walletTransaction.walletId, studentWallet.id),
          eq(walletTransaction.type, "DEBIT"),
          gte(walletTransaction.createdAt, todayStart)
        )
      );

    const spentToday = todaySpending[0]?.total || 0;
    if (spentToday + total > control.dailySpendLimit) {
      const reason = `Blocked food attempt: daily limit reached (spent Rs${spentToday.toFixed(0)} of Rs${control.dailySpendLimit}, attempted Rs${total.toFixed(0)}).`;
      await notifyBlockedAttempt(reason);
      return {
        success: false,
        reason,
      };
    }
  }

  // Check for Certe+ overdraft eligibility
  let overdraftAllowance = 0;
  if (studentWallet.balance < total) {
    const now = new Date();
    const [activeSub] = await db
      .select({ id: certeSubscription.id, walletOverdraftUsed: certeSubscription.walletOverdraftUsed })
      .from(certeSubscription)
      .where(
        and(
          eq(certeSubscription.parentId, studentChild.parentId),
          eq(certeSubscription.status, "ACTIVE"),
          gte(certeSubscription.endDate, now),
        ),
      )
      .limit(1);

    if (activeSub) {
      overdraftAllowance = Math.max(0, CERTE_PLUS.WALLET_OVERDRAFT_LIMIT - activeSub.walletOverdraftUsed);
    }
  }

  if (studentWallet.balance + overdraftAllowance < total) {
    return {
      success: false,
      reason: `Insufficient balance. You have Rs${studentWallet.balance.toFixed(0)}${overdraftAllowance > 0 ? ` (+Rs${overdraftAllowance.toFixed(0)} overdraft)` : ""} but need Rs${total.toFixed(0)}.`,
    };
  }

  const tokenCode = generateTokenCode();
  const newBalance = studentWallet.balance - total;

  // Track overdraft usage if balance went negative
  if (newBalance < 0) {
    const overdraftUsed = Math.abs(newBalance);
    const now = new Date();
    await db
      .update(certeSubscription)
      .set({
        walletOverdraftUsed: sql`${certeSubscription.walletOverdraftUsed} + ${overdraftUsed}`,
      })
      .where(
        and(
          eq(certeSubscription.parentId, studentChild.parentId),
          eq(certeSubscription.status, "ACTIVE"),
          gte(certeSubscription.endDate, now),
        ),
      );
  }

  const [newOrder] = await db
    .insert(order)
    .values({
      userId: studentChild.parentId,
      childId: studentChild.id,
      tokenCode,
      status: "PLACED",
      totalAmount: total,
      paymentMethod: "WALLET",
      paymentStatus: "PAID",
    })
    .returning();

  await db.insert(orderItem).values(
    orderItemsData.map((oi) => ({
      orderId: newOrder.id,
      menuItemId: oi.menuItemId,
      quantity: oi.quantity,
      unitPrice: oi.unitPrice,
    }))
  );

  await db
    .update(wallet)
    .set({ balance: newBalance, updatedAt: new Date() })
    .where(inArray(wallet.childId, siblingIds));

  await db.insert(walletTransaction).values({
    walletId: studentWallet.id,
    type: "DEBIT",
    amount: total,
    balanceAfter: newBalance,
    description: `${sourceLabel} - Token ${tokenCode}`,
    orderId: newOrder.id,
  });

  await decrementUnits(
    orderItemsData.map((oi) => ({ menuItemId: oi.menuItemId, quantity: oi.quantity })),
    db as unknown as Parameters<Parameters<typeof db.transaction>[0]>[0],
  );

  broadcast("orders-updated");
  broadcast("menu-updated");

  const compactItems = orderItemsData.map((oi) => ({
    menuItemId: oi.menuItemId,
    name: oi.name,
    quantity: oi.quantity,
  }));
  const isPreOrderSource = sourceLabel !== "Kiosk order";
  await notifyParentForChild({
    childId: studentChild.id,
    type: isPreOrderSource ? "KIOSK_PREORDER_TAKEN" : "KIOSK_ORDER_GIVEN",
    title: isPreOrderSource
      ? `${studentChild.name} took pre-ordered food`
      : `${studentChild.name} ordered from kiosk`,
    message: isPreOrderSource
      ? `Taken from kiosk: ${formatItemSummary(compactItems)}.`
      : `Ordered at kiosk: ${formatItemSummary(compactItems)}.`,
    metadata: {
      tokenCode,
      total,
      source: sourceLabel,
      items: compactItems,
      balanceAfter: newBalance,
    },
  });

  return {
    success: true,
    tokenCode,
    childName: studentChild.name,
    items: orderItemsData.map((oi) => ({
      name: oi.name,
      quantity: oi.quantity,
      subtotal: oi.unitPrice * oi.quantity,
    })),
    total,
    balanceAfter: newBalance,
  };
}

async function resolvePreOrderItemsForToday(childId: string) {
  const today = todayISODate();
  const rows = await db
    .select()
    .from(preOrder)
    .where(and(eq(preOrder.childId, childId), eq(preOrder.status, "PENDING")))
    .orderBy(asc(preOrder.createdAt));

  const candidate = rows.find((po) => {
    if (po.mode === "ONE_DAY") {
      return po.scheduledDate === today;
    }

    const inRange = po.scheduledDate <= today && (!po.subscriptionUntil || po.subscriptionUntil >= today);
    const notUsedToday = po.lastFulfilledDate !== today;
    return inRange && notUsedToday;
  });

  if (!candidate) return null;

  const poItems = await db
    .select({ menuItemId: preOrderItem.menuItemId, quantity: preOrderItem.quantity })
    .from(preOrderItem)
    .where(eq(preOrderItem.preOrderId, candidate.id));

  if (poItems.length === 0) return null;

  return { preOrder: candidate, items: poItems };
}

// POST /api/kiosk/order — no auth session; RFID card is the auth
// Supports manual cart order and AUTO_PREORDER on card tap
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rfidCardId, items, mode } = body as {
      rfidCardId: string;
      items?: IncomingItem[];
      mode?: "MANUAL" | "AUTO_PREORDER";
    };

    if (!rfidCardId) {
      return NextResponse.json({ success: false, reason: "Invalid request" }, { status: 400 });
    }

    const children = await db
      .select()
      .from(child)
      .where(eq(child.rfidCardId, rfidCardId))
      .limit(1);

    if (children.length === 0) {
      return NextResponse.json(
        { success: false, reason: "Unknown card. Please ask the school office to register your card." },
        { status: 200 }
      );
    }

    const studentChild = children[0];

    if (mode === "AUTO_PREORDER") {
      const resolved = await resolvePreOrderItemsForToday(studentChild.id);
      if (!resolved) {
        return NextResponse.json({
          success: true,
          autoPreOrder: false,
          childName: studentChild.name,
        });
      }

      const placed = await placeOrderFromItems(
        rfidCardId,
        resolved.items,
        resolved.preOrder.mode === "SUBSCRIPTION" ? "Subscription pre-order" : "Pre-order"
      );

      if (!placed.success) {
        return NextResponse.json({
          success: false,
          autoPreOrder: true,
          reason: placed.reason,
        });
      }

      const today = todayISODate();
      if (resolved.preOrder.mode === "ONE_DAY") {
        await db
          .update(preOrder)
          .set({ status: "FULFILLED", lastFulfilledDate: today })
          .where(eq(preOrder.id, resolved.preOrder.id));
      } else {
        const shouldComplete =
          !!resolved.preOrder.subscriptionUntil && resolved.preOrder.subscriptionUntil <= today;
        await db
          .update(preOrder)
          .set({
            lastFulfilledDate: today,
            status: shouldComplete ? "FULFILLED" : "PENDING",
          })
          .where(eq(preOrder.id, resolved.preOrder.id));
      }

      return NextResponse.json({
        ...placed,
        autoPreOrder: true,
        preOrderMode: resolved.preOrder.mode,
      });
    }

    const placed = await placeOrderFromItems(rfidCardId, items || [], "Kiosk order");
    return NextResponse.json(placed, { status: 200 });
  } catch (error) {
    console.error("Kiosk order error:", error);
    return NextResponse.json(
      { success: false, reason: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
