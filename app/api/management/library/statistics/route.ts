import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getLibraryStatistics } from "@/lib/library-statistics";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") || "30")));

  try {
    const stats = await getLibraryStatistics(days);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Library statistics error:", error);
    return NextResponse.json({ error: "Failed to fetch statistics" }, { status: 500 });
  }
}
