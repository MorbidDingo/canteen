import { NextResponse } from "next/server";

// Razorpay payout webhook is no longer used.
// Vendor payouts are now handled manually by the platform owner.
export async function POST() {
  return NextResponse.json({ error: "Razorpay payout webhooks are no longer processed" }, { status: 410 });
}
