import { broadcast } from "@/lib/sse";
import type { AppEvent } from "@/lib/sse";
import { NextRequest, NextResponse } from "next/server";

const VALID_EVENTS: AppEvent[] = ["orders-updated", "menu-updated"];

export async function POST(request: NextRequest) {
  try {
    const { event } = await request.json();

    if (!VALID_EVENTS.includes(event)) {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }

    broadcast(event as AppEvent);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
