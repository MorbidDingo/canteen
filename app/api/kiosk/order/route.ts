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
} from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { generateTokenCode } from "@/lib/constants";
import { broadcast } from "@/lib/sse";
import { validateUnits, decrementUnits } from "@/lib/units";

// POST /api/kiosk/order — no auth session; RFID card is the auth
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rfidCardId, items } = body as {
      rfidCardId: string;
      items: { menuItemId: string; quantity: number }[];
    };

    // ── Basic validation ──────────────────────────────
    if (!rfidCardId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, reason: "Invalid request" },
        { status: 400 }
      );
    }

    // ── 1. Look up child by RFID card ─────────────────
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

    // ── 2. Get wallet ─────────────────────────────────
    const wallets = await db
      .select()
      .from(wallet)
      .where(eq(wallet.childId, studentChild.id))
      .limit(1);

    if (wallets.length === 0) {
      return NextResponse.json(
        { success: false, reason: "No wallet found for this card. Please contact the school office." },
        { status: 200 }
      );
    }

    const studentWallet = wallets[0];

    // ── 3. Get parent controls ────────────────────────
    const controls = await db
      .select()
      .from(parentControl)
      .where(eq(parentControl.childId, studentChild.id))
      .limit(1);

    const control = controls[0] || null;

    // ── 4. Validate menu items ────────────────────────
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
      return NextResponse.json(
        { success: false, reason: "One or more items are no longer available." },
        { status: 200 }
      );
    }

    // Check availability
    const unavailable = menuItems.filter((m) => !m.available);
    if (unavailable.length > 0) {
      return NextResponse.json(
        {
          success: false,
          reason: `"${unavailable[0].name}" is currently unavailable.`,
        },
        { status: 200 }
      );
    }

    // ── 5. Check blocked categories ───────────────────
    if (control) {
      const blockedCategories: string[] = JSON.parse(
        control.blockedCategories || "[]"
      );
      if (blockedCategories.length > 0) {
        for (const m of menuItems) {
          if (blockedCategories.includes(m.category)) {
            return NextResponse.json(
              {
                success: false,
                reason: `"${m.category}" category is blocked by your parent.`,
              },
              { status: 200 }
            );
          }
        }
      }

      // ── 5b. Check blocked item IDs ──────────────────
      const blockedItemIds: string[] = JSON.parse(
        control.blockedItemIds || "[]"
      );
      if (blockedItemIds.length > 0) {
        for (const m of menuItems) {
          if (blockedItemIds.includes(m.id)) {
            return NextResponse.json(
              {
                success: false,
                reason: `"${m.name}" is blocked by your parent.`,
              },
              { status: 200 }
            );
          }
        }
      }
    }

    // ── 6. Calculate total ────────────────────────────
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
      const subtotal = m.price * cartItem.quantity;
      total += subtotal;
      orderItemsData.push({
        menuItemId: m.id,
        quantity: cartItem.quantity,
        unitPrice: m.price,
        name: m.name,
      });
    }

    // ── 6b. Check available units ─────────────────────
    const unitError = await validateUnits(
      orderItemsData.map((oi) => ({ menuItemId: oi.menuItemId, quantity: oi.quantity })),
      db,
    );
    if (unitError) {
      return NextResponse.json(
        { success: false, reason: unitError },
        { status: 200 }
      );
    }

    // ── 7. Check per-order limit ──────────────────────
    if (control?.perOrderLimit && total > control.perOrderLimit) {
      return NextResponse.json(
        {
          success: false,
          reason: `Exceeds per-order limit of ₹${control.perOrderLimit}. Your order is ₹${total.toFixed(0)}.`,
        },
        { status: 200 }
      );
    }

    // ── 8. Check daily spend limit ────────────────────
    if (control?.dailySpendLimit) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todaySpending = await db
        .select({
          total: sql<number>`COALESCE(SUM(${walletTransaction.amount}), 0)`,
        })
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
        return NextResponse.json(
          {
            success: false,
            reason: `Daily limit reached. Spent ₹${spentToday.toFixed(0)} of ₹${control.dailySpendLimit} limit today.`,
          },
          { status: 200 }
        );
      }
    }

    // ── 9. Check sufficient balance ───────────────────
    if (studentWallet.balance < total) {
      return NextResponse.json(
        {
          success: false,
          reason: `Insufficient balance. You have ₹${studentWallet.balance.toFixed(0)} but need ₹${total.toFixed(0)}.`,
        },
        { status: 200 }
      );
    }

    // ── 10. Create order (transaction) ────────────────
    const tokenCode = generateTokenCode();
    const newBalance = studentWallet.balance - total;

    // Create the order
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

    // Create order items
    await db.insert(orderItem).values(
      orderItemsData.map((oi) => ({
        orderId: newOrder.id,
        menuItemId: oi.menuItemId,
        quantity: oi.quantity,
        unitPrice: oi.unitPrice,
      }))
    );

    // Debit wallet
    await db
      .update(wallet)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(wallet.id, studentWallet.id));

    // Create wallet transaction
    await db.insert(walletTransaction).values({
      walletId: studentWallet.id,
      type: "DEBIT",
      amount: total,
      balanceAfter: newBalance,
      description: `Kiosk order — Token ${tokenCode}`,
      orderId: newOrder.id,
    });

    // Decrement available units
    await decrementUnits(
      orderItemsData.map((oi) => ({ menuItemId: oi.menuItemId, quantity: oi.quantity })),
      db as unknown as Parameters<Parameters<typeof db.transaction>[0]>[0],
    );

    // ── 11. Emit SSE events ───────────────────────────
    broadcast("orders-updated");
    broadcast("menu-updated");

    // ── 12. Return success ────────────────────────────
    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Kiosk order error:", error);
    return NextResponse.json(
      { success: false, reason: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
