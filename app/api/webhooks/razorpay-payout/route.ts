import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settlementBatch, settlementLedger } from "@/lib/db/schema";

type RazorpayPayoutWebhook = {
  event?: string;
  payload?: {
    payout?: {
      entity?: {
        id?: string;
        status?: string;
        failure_reason?: string;
      };
    };
  };
};

function verifyWebhookSignature(body: string, signature: string | null) {
  const secret = process.env.RAZORPAY_PAYOUT_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  if (!signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let body: RazorpayPayoutWebhook;
  try {
    body = JSON.parse(rawBody) as RazorpayPayoutWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  const event = body.event;
  const payoutId = body.payload?.payout?.entity?.id;
  const failureReason = body.payload?.payout?.entity?.failure_reason || null;

  if (!event || !payoutId) {
    return NextResponse.json({ error: "Missing payout event data" }, { status: 400 });
  }

  try {
    if (event === "payout.processed") {
      await db
        .update(settlementBatch)
        .set({
          status: "SETTLED",
          processedAt: new Date(),
          failureReason: null,
        })
        .where(eq(settlementBatch.razorpayPayoutId, payoutId));

      await db
        .update(settlementLedger)
        .set({
          status: "SETTLED",
          settledAt: new Date(),
          failureReason: null,
        })
        .where(eq(settlementLedger.razorpayPayoutId, payoutId));

      return NextResponse.json({ success: true, event, payoutId });
    }

    if (event === "payout.failed") {
      await db
        .update(settlementBatch)
        .set({
          status: "FAILED",
          processedAt: new Date(),
          failureReason: failureReason || "Razorpay payout failed",
        })
        .where(eq(settlementBatch.razorpayPayoutId, payoutId));

      await db
        .update(settlementLedger)
        .set({
          status: "FAILED",
          failureReason: failureReason || "Razorpay payout failed",
        })
        .where(eq(settlementLedger.razorpayPayoutId, payoutId));

      return NextResponse.json({ success: true, event, payoutId });
    }

    if (event === "payout.reversed") {
      await db
        .update(settlementBatch)
        .set({
          status: "FAILED",
          processedAt: new Date(),
          failureReason: failureReason || "Razorpay payout reversed",
        })
        .where(eq(settlementBatch.razorpayPayoutId, payoutId));

      await db
        .update(settlementLedger)
        .set({
          status: "PENDING",
          razorpayPayoutId: null,
          failureReason: "Requeued after payout reversal",
        })
        .where(eq(settlementLedger.razorpayPayoutId, payoutId));

      return NextResponse.json({ success: true, event, payoutId, requeued: true });
    }

    return NextResponse.json({ success: true, ignored: true, event, payoutId });
  } catch (error) {
    console.error("Razorpay payout webhook processing error:", error);
    return NextResponse.json({ error: "Failed to process payout webhook" }, { status: 500 });
  }
}
