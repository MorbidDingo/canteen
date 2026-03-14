import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, gateLog } from "@/lib/db/schema";
import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { isMissingRelationError } from "@/lib/db-errors";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || !["MANAGEMENT", "ATTENDANCE"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const totalStudentsRows = await db.select({ id: child.id }).from(child);
    const insideRows = await db
      .select({ id: child.id })
      .from(child)
      .where(eq(child.presenceStatus, "INSIDE"));

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let logsLast24h: Array<{ id: string; isValid: boolean }> = [];
    try {
      logsLast24h = await db
        .select({ id: gateLog.id, isValid: gateLog.isValid })
        .from(gateLog)
        .where(gte(gateLog.tappedAt, last24h));
    } catch (err) {
      if (!isMissingRelationError(err, "gate_log")) {
        throw err;
      }
    }

    const overstayThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const overstayRows = await db
      .select({ id: child.id })
      .from(child)
      .where(
        and(
          eq(child.presenceStatus, "INSIDE"),
          isNotNull(child.lastGateTapAt),
          lte(child.lastGateTapAt, overstayThreshold),
        ),
      );

    return NextResponse.json({
      success: true,
      stats: {
        totalStudents: totalStudentsRows.length,
        insideCount: insideRows.length,
        outsideCount: totalStudentsRows.length - insideRows.length,
        totalTapEvents: logsLast24h.length,
        tapsLast24h: logsLast24h.length,
        anomalyCount: logsLast24h.filter((l) => l.isValid === false).length,
        overstayCount: overstayRows.length,
      },
    });
  } catch (error) {
    console.error("Attendance summary error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
