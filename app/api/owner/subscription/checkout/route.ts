import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationMembership } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";
import { OWNER_ORG_PLANS, type OwnerOrgPlan } from "@/lib/constants";
import { getRazorpay } from "@/lib/razorpay";

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

    const body = (await request.json().catch(() => ({}))) as { tier?: OwnerOrgPlan };
    const tier = body.tier;

    if (!tier || !(tier in OWNER_ORG_PLANS)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const selectedPlan = OWNER_ORG_PLANS[tier];
    const amountInPaise = Math.round(selectedPlan.price * 100);

    const razorpay = getRazorpay();
    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `owner_plan_${ownerUserId.slice(0, 8)}_${Date.now()}`,
      notes: {
        ownerUserId,
        type: "owner_org_plan",
        tier,
      },
    });

    return NextResponse.json({
      razorpayOrderId: razorpayOrder.id,
      amount: selectedPlan.price,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
      tier,
      orgLimit: selectedPlan.orgLimit,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }

    console.error("Owner plan checkout error:", error);
    return NextResponse.json({ error: "Failed to start checkout" }, { status: 500 });
  }
}
