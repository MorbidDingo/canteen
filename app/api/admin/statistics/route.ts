import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getStatistics } from "@/lib/statistics";

// GET — statistics data for admin/management dashboard
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MANAGEMENT")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get("days") || "30";
    const days = Math.min(Math.max(parseInt(daysParam) || 30, 1), 365);

    const data = await getStatistics(days);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Statistics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}
