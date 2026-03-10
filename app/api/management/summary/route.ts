import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getSummary } from "@/lib/statistics";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== "MANAGEMENT") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = await getSummary();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Management summary error:", error);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
