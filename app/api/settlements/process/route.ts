import { NextRequest, NextResponse } from "next/server";
import { processPendingSettlements } from "@/lib/settlement-processor";

function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processPendingSettlements({ source: "cron" });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Settlement process error:", error);
    return NextResponse.json({ error: "Failed to process settlements" }, { status: 500 });
  }
}
