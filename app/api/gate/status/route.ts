import { NextResponse } from "next/server";
import {
  getStudentsInside,
  getStudentsOutside,
  getAnomalousGateLogs,
  validatePresenceConsistency,
} from "@/lib/gate";

/**
 * GET /api/gate/status
 *
 * Returns real-time gate status data
 * Query params:
 * - view: 'inside' | 'outside' | 'overview' (default: 'overview')
 * - includeAnomalies: true | false (check for anomalies)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = (searchParams.get("view") || "overview") as string;
    const includeAnomalies = searchParams.get("includeAnomalies") === "true";

    let data: Record<string, unknown> = {};

    // Get students inside/outside
    const studentsInside = await getStudentsInside();
    const studentsOutside = await getStudentsOutside();

    data = {
      summary: {
        totalInside: studentsInside.length,
        totalOutside: studentsOutside.length,
      },
    };

    if (view === "inside" || view === "overview") {
      data.studentsInside = studentsInside;
    }

    if (view === "outside" || view === "overview") {
      data.studentsOutside = studentsOutside;
    }

    // Check for anomalies if requested
    if (includeAnomalies) {
      const anomalies = await getAnomalousGateLogs();
      const inconsistencies = await validatePresenceConsistency();

      data.anomalies = {
        count: anomalies.length,
        recentFlags: anomalies.slice(0, 10),
        inconsistencies,
      };
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Gate status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
