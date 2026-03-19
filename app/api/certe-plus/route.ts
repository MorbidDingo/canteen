import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  certeSubscription,
  certeSubscriptionPenaltyUsage,
  wallet,
  walletTransaction,
  child,
} from "@/lib/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { CERTE_PLUS, CERTE_PLUS_PLANS, type CertePlusPlan } from "@/lib/constants";
import {
  getRazorpayForOrganization,
  getRazorpayPublicKeyForOrganization,
  getRazorpaySecretForOrganization,
} from "@/lib/razorpay";
import crypto from "crypto";

function noStoreJson(body: unknown, init?: Omit<ResponseInit, "headers"> & { headers?: HeadersInit }) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}

// GET — check current Certe+ subscription status
export async function GET() {
  try {
    let access;
    try {
      access = await requireLinkedAccount();
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        return noStoreJson({
          active: false,
          subscription: null,
          benefits: {
            walletOverdraftLimit: 0,
            libraryPenaltyAllowance: 0,
            libraryPenaltiesUsed: 0,
            walletOverdraftUsed: 0,
            libraryPenaltiesUsedByChild: {},
          },
        }, { status: error.status });
      }
      throw error;
    }

    const session = access.session;

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
      return noStoreJson({
        active: false,
        subscription: null,
        benefits: {
          walletOverdraftLimit: 0,
          libraryPenaltyAllowance: 0,
          libraryPenaltiesUsed: 0,
          walletOverdraftUsed: 0,
          libraryPenaltiesUsedByChild: {},
        },
      });
    }

    const usageRows = await db
      .select({
        childId: certeSubscriptionPenaltyUsage.childId,
        penaltiesUsed: certeSubscriptionPenaltyUsage.penaltiesUsed,
      })
      .from(certeSubscriptionPenaltyUsage)
      .where(eq(certeSubscriptionPenaltyUsage.subscriptionId, active.id));

    const libraryPenaltiesUsedByChild = usageRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.childId] = row.penaltiesUsed;
      return acc;
    }, {});

    return noStoreJson({
      active: true,
      subscription: {
        id: active.id,
        plan: active.plan,
        startDate: active.startDate,
        endDate: active.endDate,
        status: active.status,
        walletOverdraftUsed: active.walletOverdraftUsed,
        libraryPenaltiesUsed: active.libraryPenaltiesUsed,
        libraryPenaltiesUsedByChild,
      },
      benefits: {
        walletOverdraftLimit: CERTE_PLUS.WALLET_OVERDRAFT_LIMIT,
        libraryPenaltyAllowance: CERTE_PLUS.LIBRARY_PENALTY_ALLOWANCE,
        libraryPenaltiesUsed: active.libraryPenaltiesUsed,
        walletOverdraftUsed: active.walletOverdraftUsed,
        libraryPenaltiesUsedByChild,
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
    const { paymentMethod, childId, plan: planKey, razorpay_payment_id, razorpay_order_id, razorpay_signature } = body;

    // Validate plan
    const selectedPlan = CERTE_PLUS_PLANS[planKey as CertePlusPlan];
    if (!selectedPlan) {
      return NextResponse.json({ error: "Invalid subscription plan. Choose WEEKLY, MONTHLY, THREE_MONTHS, or SIX_MONTHS." }, { status: 400 });
    }

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

    const amount = selectedPlan.price;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + selectedPlan.days);

    if (paymentMethod === "RAZORPAY") {
      // If no payment details, create a Razorpay order
      if (!razorpay_payment_id) {
        const razorpay = await getRazorpayForOrganization(access.activeOrganizationId);
        const order = await razorpay.orders.create({
          amount: amount * 100, // paise
          currency: "INR",
          receipt: `certe_plus_${session.user.id.slice(0, 8)}`,
          notes: { parentId: session.user.id, type: "certe_plus", plan: selectedPlan.key },
        });

        return NextResponse.json({
          requiresPayment: true,
          razorpayOrderId: order.id,
          amount,
          currency: "INR",
          keyId: await getRazorpayPublicKeyForOrganization(access.activeOrganizationId),
        });
      }

      // Verify Razorpay payment
      const expectedSignature = crypto
        .createHmac("sha256", await getRazorpaySecretForOrganization(access.activeOrganizationId))
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
      }

      const [subscription] = await db
        .insert(certeSubscription)
        .values({
          parentId: session.user.id,
          plan: selectedPlan.key,
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
      // Find child wallet - use provided childId or first child
      let targetChildId = childId;
      if (!targetChildId) {
        const children = await db
          .select({ id: child.id })
          .from(child)
          .where(eq(child.parentId, session.user.id))
          .limit(1);
        if (children.length === 0) {
          return NextResponse.json({ error: "No children found. Please add a child first." }, { status: 400 });
        }
        targetChildId = children[0].id;
      }

      // Verify child belongs to parent
      const [childRow] = await db
        .select()
        .from(child)
        .where(and(eq(child.id, targetChildId), eq(child.parentId, session.user.id)));

      if (!childRow) {
        return NextResponse.json({ error: "Child not found" }, { status: 404 });
      }

      const [walletRow] = await db
        .select()
        .from(wallet)
        .where(eq(wallet.childId, targetChildId));

      if (!walletRow) {
        return NextResponse.json({
          error: "No wallet found for this child. Please top up the wallet first.",
        }, { status: 400 });
      }

      if (walletRow.balance < amount) {
        return NextResponse.json({
          error: `Insufficient wallet balance. Need ${amount} credits, available ${walletRow.balance.toFixed(2)} credits. Please top up your wallet first.`,
        }, { status: 400 });
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
        description: `Certe+ ${selectedPlan.label} Subscription`,
      });

      const [subscription] = await db
        .insert(certeSubscription)
        .values({
          parentId: session.user.id,
          plan: selectedPlan.key,
          status: "ACTIVE",
          startDate: now,
          endDate,
          amount,
          paymentMethod: "WALLET",
        })
        .returning();

      return NextResponse.json({ success: true, subscription });
    }

    return NextResponse.json({ error: "Invalid payment method. Use WALLET or RAZORPAY." }, { status: 400 });
  } catch (error) {
    console.error("Certe+ subscribe error:", error);
    return NextResponse.json({ error: "Failed to process subscription" }, { status: 500 });
  }
}
