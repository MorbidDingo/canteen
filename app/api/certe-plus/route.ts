import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { certeSubscription, wallet, walletTransaction, child } from "@/lib/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { CERTE_PLUS } from "@/lib/constants";
import { getRazorpay } from "@/lib/razorpay";
import crypto from "crypto";

// GET — check current Certe+ subscription status
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const [active] = await db
      .select()
      .from(certeSubscription)
      .where(
        and(
          eq(certeSubscription.parentId, session.user.id),
          eq(certeSubscription.status, "ACTIVE"),
          gte(certeSubscription.endDate, now),
        ),
      )
      .orderBy(desc(certeSubscription.endDate))
      .limit(1);

    if (!active) {
      return NextResponse.json({
        active: false,
        subscription: null,
        benefits: {
          walletOverdraftLimit: 0,
          libraryPenaltyAllowance: 0,
          libraryPenaltiesUsed: 0,
          walletOverdraftUsed: 0,
        },
      });
    }

    return NextResponse.json({
      active: true,
      subscription: {
        id: active.id,
        startDate: active.startDate,
        endDate: active.endDate,
        status: active.status,
        walletOverdraftUsed: active.walletOverdraftUsed,
        libraryPenaltiesUsed: active.libraryPenaltiesUsed,
      },
      benefits: {
        walletOverdraftLimit: CERTE_PLUS.WALLET_OVERDRAFT_LIMIT,
        libraryPenaltyAllowance: CERTE_PLUS.LIBRARY_PENALTY_ALLOWANCE,
        libraryPenaltiesUsed: active.libraryPenaltiesUsed,
        walletOverdraftUsed: active.walletOverdraftUsed,
      },
    });
  } catch (error) {
    console.error("Certe+ status error:", error);
    return NextResponse.json({ error: "Failed to check subscription" }, { status: 500 });
  }
}

// POST — subscribe to Certe+ (via wallet or create Razorpay order)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { paymentMethod, childId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = body;

    // Check if already has active subscription
    const now = new Date();
    const [existing] = await db
      .select()
      .from(certeSubscription)
      .where(
        and(
          eq(certeSubscription.parentId, session.user.id),
          eq(certeSubscription.status, "ACTIVE"),
          gte(certeSubscription.endDate, now),
        ),
      )
      .limit(1);

    if (existing) {
      return NextResponse.json({ error: "You already have an active Certe+ subscription" }, { status: 409 });
    }

    const amount = CERTE_PLUS.MONTHLY_PRICE;
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    if (paymentMethod === "RAZORPAY") {
      // If no payment details, create a Razorpay order
      if (!razorpay_payment_id) {
        const razorpay = getRazorpay();
        const order = await razorpay.orders.create({
          amount: amount * 100, // paise
          currency: "INR",
          receipt: `certe_plus_${session.user.id.slice(0, 8)}`,
          notes: { parentId: session.user.id, type: "certe_plus" },
        });

        return NextResponse.json({
          requiresPayment: true,
          razorpayOrderId: order.id,
          amount,
          currency: "INR",
          keyId: process.env.RAZORPAY_KEY_ID,
        });
      }

      // Verify Razorpay payment
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
      }

      const [subscription] = await db
        .insert(certeSubscription)
        .values({
          parentId: session.user.id,
          status: "ACTIVE",
          startDate: now,
          endDate,
          amount,
          paymentMethod: "RAZORPAY",
          razorpayPaymentId: razorpay_payment_id,
        })
        .returning();

      return NextResponse.json({ success: true, subscription });
    }

    if (paymentMethod === "WALLET") {
      if (!childId) {
        return NextResponse.json({ error: "childId required for wallet payment" }, { status: 400 });
      }

      // Verify child belongs to parent
      const [childRow] = await db
        .select()
        .from(child)
        .where(and(eq(child.id, childId), eq(child.parentId, session.user.id)));

      if (!childRow) {
        return NextResponse.json({ error: "Child not found" }, { status: 404 });
      }

      const [walletRow] = await db
        .select()
        .from(wallet)
        .where(eq(wallet.childId, childId));

      if (!walletRow || walletRow.balance < amount) {
        return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 });
      }

      const newBalance = walletRow.balance - amount;
      await db
        .update(wallet)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(wallet.id, walletRow.id));

      await db.insert(walletTransaction).values({
        walletId: walletRow.id,
        type: "DEBIT",
        amount: -amount,
        balanceAfter: newBalance,
        description: "Certe+ Monthly Subscription",
      });

      const [subscription] = await db
        .insert(certeSubscription)
        .values({
          parentId: session.user.id,
          status: "ACTIVE",
          startDate: now,
          endDate,
          amount,
          paymentMethod: "WALLET",
        })
        .returning();

      return NextResponse.json({ success: true, subscription });
    }

    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  } catch (error) {
    console.error("Certe+ subscribe error:", error);
    return NextResponse.json({ error: "Failed to process subscription" }, { status: 500 });
  }
}
