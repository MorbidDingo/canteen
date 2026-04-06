import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationMembership, organizationOwnerSubscription } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";
import { OWNER_ORG_PLANS, type OwnerOrgPlan } from "@/lib/constants";
import crypto from "crypto";

async function requireOwnerUserId() {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("UNAUTHENTICATED");
  }

  const [ownerMembership] = await db
    .select({ organizationId: organizationMembership.organizationId })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.userId, session.user.id),
        eq(organizationMembership.role, "OWNER"),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!ownerMembership) {
    throw new Error("FORBIDDEN");
  }

  return session.user.id;
}

export async function POST(request: NextRequest) {
  try {
    const ownerUserId = await requireOwnerUserId();

    const body = (await request.json().catch(() => ({}))) as {
      tier?: OwnerOrgPlan;
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };

    const tier = body.tier;
    if (!tier || !(tier in OWNER_ORG_PLANS)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    if (!body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
      return NextResponse.json({ error: "Missing payment verification fields" }, { status: 400 });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Payment verification not configured" }, { status: 500 });
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== body.razorpay_signature) {
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    const selectedPlan = OWNER_ORG_PLANS[tier];
    const now = new Date();
    const endsAt = new Date(now);
    endsAt.setDate(endsAt.getDate() + selectedPlan.durationDays);

    await db.transaction(async (tx) => {
      await tx
        .update(organizationOwnerSubscription)
        .set({
          status: "EXPIRED",
          updatedAt: now,
        })
        .where(
          and(
            eq(organizationOwnerSubscription.ownerUserId, ownerUserId),
            eq(organizationOwnerSubscription.status, "ACTIVE"),
          ),
        );

      await tx.insert(organizationOwnerSubscription).values({
        id: crypto.randomUUID(),
        ownerUserId,
        tier,
        status: "ACTIVE",
        orgLimit: selectedPlan.orgLimit,
        amount: selectedPlan.price,
        paymentMethod: "RAZORPAY",
        razorpayOrderId: body.razorpay_order_id,
        razorpayPaymentId: body.razorpay_payment_id,
        startsAt: now,
        endsAt,
        createdAt: now,
        updatedAt: now,
      });
    });

    return NextResponse.json({
      success: true,
      tier,
      orgLimit: selectedPlan.orgLimit,
      endsAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }

    console.error("Owner plan verify error:", error);
    return NextResponse.json({ error: "Failed to verify payment" }, { status: 500 });
  }
}
