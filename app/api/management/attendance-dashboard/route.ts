import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, gateLog } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

/**
 * GET /api/management/attendance-dashboard
 *
 * Dashboard data for management
 * Shows:
 * - Total students inside vs outside
 * - Recent gate activity
 * - Anomalies detected
 * - Daily attendance summary
 *
 * Only MANAGEMENT role can access this
 */
export async function GET(request: Request) {
  try {
    // TODO: Add auth check
    // const session = await auth();
    // if (!session?.user || session.user.role !== 'MANAGEMENT') {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    // }

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    // 1. Get current presence summary
    const studentsInside = await db
      .select()
      .from(child)
      .where(eq(child.presenceStatus, "INSIDE"));

    const studentsOutside = await db
      .select()
      .from(child)
      .where(eq(child.presenceStatus, "OUTSIDE"));

    const allStudents = await db.select().from(child);

    // 2. Get recent gate activity
    const recentLogs = await db
      .select()
      .from(gateLog)
      .orderBy(gateLog.tappedAt)
      .limit(20);

    // 3. Get logs for the day
    const startOfDay = new Date(date + "T00:00:00Z");
    const endOfDay = new Date(date + "T23:59:59Z");

    const todayLogs = await db
      .select()
      .from(gateLog)
      .where(
        and(
          gte(gateLog.tappedAt, startOfDay),
          lte(gateLog.tappedAt, endOfDay),
        ),
      );

    // 4. Detect anomalies
    const anomalies = await db
      .select()
      .from(gateLog)
      .where(eq(gateLog.isValid, false))
      .orderBy(gateLog.tappedAt)
      .limit(10);

    // 5. Calculate daily attendance
    const dailyAttendanceMap = new Map<
      string,
      { entries: number; exits: number; arrived?: Date; left?: Date }
    >();

    todayLogs.forEach((log) => {
      const childId = log.childId;
      if (!dailyAttendanceMap.has(childId)) {
        dailyAttendanceMap.set(childId, { entries: 0, exits: 0 });
      }

      const stats = dailyAttendanceMap.get(childId)!;
      const tapTime = new Date(log.tappedAt);

      if (log.direction === "ENTRY") {
        stats.entries++;
        if (!stats.arrived) stats.arrived = tapTime;
      } else {
        stats.exits++;
        stats.left = tapTime;
      }
    });

    // Get child details for daily attendance
    const dailyAttendance = Array.from(dailyAttendanceMap.entries()).map(
      ([childId, stats]) => {
        const childData = allStudents.find((c) => c.id === childId);
        return {
          childId,
          name: childData?.name || "Unknown",
          grNumber: childData?.grNumber,
          className: childData?.className,
          arrivedAt: stats.arrived?.toISOString() || null,
          leftAt: stats.left?.toISOString() || null,
          entries: stats.entries,
          exits: stats.exits,
          present: stats.entries > 0,
        };
      },
    );

    // 6. Class-wise breakdown
    const classWiseData = new Map<
      string,
      { inside: number; outside: number; total: number }
    >();

    allStudents.forEach((s) => {
      const classKey = s.className || "Unknown";
      if (!classWiseData.has(classKey)) {
        classWiseData.set(classKey, { inside: 0, outside: 0, total: 0 });
      }

      const stats = classWiseData.get(classKey)!;
      stats.total++;
      if (s.presenceStatus === "INSIDE") {
        stats.inside++;
      } else {
        stats.outside++;
      }
    });

    return NextResponse.json({
      success: true,
      date,
      summary: {
        totalStudents: allStudents.length,
        currentlyInside: studentsInside.length,
        currentlyOutside: studentsOutside.length,
        insidePercentage: Math.round(
          (studentsInside.length / allStudents.length) * 100,
        ),
      },
      studentsInside: studentsInside.map((s) => ({
        id: s.id,
        name: s.name,
        grNumber: s.grNumber,
        className: s.className,
        section: s.section,
        lastTapAt: s.lastGateTapAt,
      })),
      recentActivity: recentLogs.slice(-10).map((log) => {
        const childData = allStudents.find((c) => c.id === log.childId);
        return {
          childId: log.childId,
          childName: childData?.name || "Unknown",
          direction: log.direction,
          tappedAt: log.tappedAt,
          isValid: log.isValid,
        };
      }),
      dailyAttendance,
      classWiseBreakdown: Array.from(classWiseData.entries()).map(
        ([className, stats]) => ({
          className,
          ...stats,
          attendancePercentage: Math.round((stats.inside / stats.total) * 100),
        }),
      ),
      anomalies: anomalies.map((log) => {
        const childData = allStudents.find((c) => c.id === log.childId);
        return {
          childId: log.childId,
          childName: childData?.name || "Unknown",
          direction: log.direction,
          tappedAt: log.tappedAt,
          reason: log.anomalyReason,
        };
      }),
    });
  } catch (error) {
    console.error("Attendance dashboard error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
