import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getFullAnalytics } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN" && session.user.role !== "MANAGEMENT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(Number(searchParams.get("days")) || 30, 1), 365);

    const analytics = await getFullAnalytics(days);

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
