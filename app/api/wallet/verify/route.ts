import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wallet, walletTransaction, child, user } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils";
import { sendMessage } from "@/lib/messaging-service";
import { getRazorpaySecretForOrganization } from "@/lib/razorpay";

// POST /api/wallet/verify — verify Razorpay payment and credit the wallet
export async function POST(request: NextRequest) {
  try {
    let access;
    try {
      access = await requireLinkedAccount();
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
      throw error;
    }

    const session = access.session;

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
        organizationId: child.organizationId,
      })
      .from(wallet)
      .innerJoin(child, eq(child.id, wallet.childId))
      .where(and(eq(wallet.id, walletId), eq(child.parentId, session.user.id)))
      .limit(1);

    if (walletRow.length === 0) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    // Verify signature
    const secret = await getRazorpaySecretForOrganization(
      walletRow[0].organizationId ?? access.activeOrganizationId,
    );
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
    const topupAmount = amount / 100; // paise to credits (1:1)
    const newBalance = w.balance + topupAmount;

    const siblingChildRows = await db
      .select({ id: child.id })
      .from(child)
      .where(eq(child.parentId, session.user.id));
    const siblingChildIds = siblingChildRows.map((c) => c.id);

    if (siblingChildIds.length > 0) {
      await db
        .update(wallet)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(inArray(wallet.childId, siblingChildIds));
    } else {
      await db
        .update(wallet)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(wallet.id, w.id));
    }

    await db.insert(walletTransaction).values({
      walletId: w.id,
      type: "TOP_UP",
      amount: topupAmount,
      balanceAfter: newBalance,
      description: "Online top-up via Razorpay",
      razorpayPaymentId: razorpay_payment_id,
    });

    // ─── Send SMS/WhatsApp Notification ────────────────────
    try {
      const parentData = await db
        .select({ name: user.name, phone: user.phone })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1);

      if (parentData.length > 0 && parentData[0].phone) {
        const childData = await db
          .select({ name: child.name })
          .from(child)
          .where(eq(child.id, w.childId))
          .limit(1);

        const childName = childData.length > 0 ? childData[0].name : "Child";
        sendMessage({
          parentId: session.user.id,
          childId: w.childId,
          phoneNumber: parentData[0].phone,
          notificationType: "WALLET_TOPUP",
          title: "Wallet Credit Successful",
          message: `${topupAmount.toFixed(2)} credits have been added to ${childName}'s wallet. New balance: ${newBalance.toFixed(2)} credits`,
          metadata: {
            childName,
            amount: topupAmount,
            newBalance,
          },
        }).catch((error) => {
          console.error("[Messaging] Failed to send wallet top-up notification:", error);
        });
      }
    } catch (error) {
      console.error("[Messaging] Error sending wallet top-up notification:", error);
    }

    return NextResponse.json({ newBalance });
  } catch (error) {
    console.error("Wallet verify error:", error);
    return NextResponse.json(
      { error: "Failed to verify payment" },
      { status: 500 }
    );
  }
}
