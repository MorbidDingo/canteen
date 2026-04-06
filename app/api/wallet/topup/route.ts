import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, wallet } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { getRazorpayForOrganization, getRazorpayPublicKeyForOrganization } from "@/lib/razorpay";

// POST /api/wallet/topup — create a Razorpay order for wallet top-up
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
    const { childId, amount } = body;

    if (!childId || typeof amount !== "number" || amount < 10 || amount > 5000) {
      return NextResponse.json(
        { error: "Invalid amount. Must be between 10 and 5000 credits" },
        { status: 400 }
      );
    }

    // Verify child belongs to parent
    const children = await db
      .select()
      .from(child)
      .where(and(eq(child.id, childId), eq(child.parentId, session.user.id)))
      .limit(1);

    if (children.length === 0) {
      return NextResponse.json({ error: "Child not found" }, { status: 404 });
    }

    // Verify wallet exists
    const wallets = await db
      .select()
      .from(wallet)
      .where(eq(wallet.childId, childId))
      .limit(1);

    if (wallets.length === 0) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    const amountInPaise = Math.round(amount * 100);
    const organizationId = children[0].organizationId ?? access.activeOrganizationId;
    const razorpay = await getRazorpayForOrganization(organizationId);
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `wt_${Date.now()}`,
      notes: {
        type: "wallet_topup",
        walletId: wallets[0].id,
        childId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      razorpayOrderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: "INR",
      keyId: await getRazorpayPublicKeyForOrganization(organizationId),
      walletId: wallets[0].id,
    });
  } catch (error) {
    console.error("Wallet top-up order creation error:", error);
    return NextResponse.json(
      { error: "Failed to create top-up order" },
      { status: 500 }
    );
  }
}
