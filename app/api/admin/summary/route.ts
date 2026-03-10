import { NextResponse } from "next/server";
import { getSummary } from "@/lib/statistics";

// GET — today's order summary for admin dashboard
export async function GET() {
  try {
    const data = await getSummary();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Admin summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch summary" },
      { status: 500 }
    );
  }
}
