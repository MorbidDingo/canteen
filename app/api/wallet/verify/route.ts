import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wallet, walletTransaction, child } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils";

// POST /api/wallet/verify — verify Razorpay payment and credit the wallet
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      walletId,
      amount,
    } = body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !walletId ||
      !amount
    ) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Verify ownership — wallet belongs to a child of this parent
    const walletRow = await db
      .select({
        id: wallet.id,
        childId: wallet.childId,
        balance: wallet.balance,
      })
      .from(wallet)
      .innerJoin(child, eq(child.id, wallet.childId))
      .where(and(eq(wallet.id, walletId), eq(child.parentId, session.user.id)))
      .limit(1);

    if (walletRow.length === 0) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    // Verify signature
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "Payment verification not configured" },
        { status: 500 }
      );
    }

    const isValid = validatePaymentVerification(
      {
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id,
      },
      razorpay_signature,
      secret
    );

    if (!isValid) {
      return NextResponse.json(
        { error: "Payment verification failed" },
        { status: 400 }
      );
    }

    // Credit the wallet
    const w = walletRow[0];
    const topupAmount = amount / 100; // paise to rupees
    const newBalance = w.balance + topupAmount;

    await db
      .update(wallet)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(wallet.id, w.id));

    await db.insert(walletTransaction).values({
      walletId: w.id,
      type: "TOP_UP",
      amount: topupAmount,
      balanceAfter: newBalance,
      description: "Online top-up via Razorpay",
      razorpayPaymentId: razorpay_payment_id,
    });

    return NextResponse.json({ newBalance });
  } catch (error) {
    console.error("Wallet verify error:", error);
    return NextResponse.json(
      { error: "Failed to verify payment" },
      { status: 500 }
    );
  }
}
