import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, gateLog } from "@/lib/db/schema";
import { eq, desc, gte, lte, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

/**
 * GET /api/attendance
 *
 * Get attendance and presence data
 * Query params:
 * - childId: filter by specific child
 * - grNumber: filter by GR number
 * - date: filter by specific date (YYYY-MM-DD)
 * - startDate: filter from date
 * - endDate: filter to date
 * - status: filter by presence status (INSIDE/OUTSIDE)
 *
 * Only MANAGEMENT and ATTENDANCE roles can access this
 */
export async function GET(request: Request) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ATTENDANCE"],
    });

    if (access.deviceLoginProfile) {
      return NextResponse.json(
        { error: "Attendance controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
        { status: 403 },
      );
    }

    const organizationId = access.activeOrganizationId!;

    const { searchParams } = new URL(request.url);
    const childId = searchParams.get("childId");
    const grNumber = searchParams.get("grNumber");
    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const presenceStatus = searchParams.get("status");
    const q = searchParams.get("q")?.trim().toLowerCase();

    // Build query conditions
    const conditions: any[] = [];

    conditions.push(eq(child.organizationId, organizationId));

    if (childId) {
      conditions.push(eq(child.id, childId));
    }

    if (grNumber) {
      conditions.push(eq(child.grNumber, grNumber));
    }

    if (presenceStatus === "INSIDE" || presenceStatus === "OUTSIDE") {
      conditions.push(eq(child.presenceStatus, presenceStatus));
    }

    // Get children
    let childQuery: any = db.select().from(child);
    if (conditions.length > 0) {
      childQuery = childQuery.where(and(...conditions));
    }

    let children: any = await childQuery;

    if (q) {
      children = children.filter((c: any) => {
        const name = (c.name || "").toLowerCase();
        const gr = (c.grNumber || "").toLowerCase();
        return name.includes(q) || gr.includes(q);
      });
    }

    // For each child, get gate logs
    const attendanceData = await Promise.all(
      children.map(async (c: any) => {
        // Build gate log query
        let gateLogConditions: any[] = [eq(gateLog.childId, c.id)];

        // Add date filters
        if (date) {
          const startOfDay = new Date(date + "T00:00:00Z");
          const endOfDay = new Date(date + "T23:59:59Z");
          gateLogConditions.push(gte(gateLog.tappedAt, startOfDay));
          gateLogConditions.push(lte(gateLog.tappedAt, endOfDay));
        } else {
          if (startDate) {
            const start = new Date(startDate + "T00:00:00Z");
            gateLogConditions.push(gte(gateLog.tappedAt, start));
          }
          if (endDate) {
            const end = new Date(endDate + "T23:59:59Z");
            gateLogConditions.push(lte(gateLog.tappedAt, end));
          }
        }

        const logs = await db
          .select()
          .from(gateLog)
          .where(and(...gateLogConditions))
          .orderBy(desc(gateLog.tappedAt));

        // Calculate duration if currently INSIDE
        let timeInside: number | null = null;
        if (c.presenceStatus === "INSIDE" && logs.length > 0) {
          const lastEntry = logs.find((l) => l.direction === "ENTRY");
          if (lastEntry) {
            timeInside = Math.floor(
              (Date.now() - new Date(lastEntry.tappedAt).getTime()) / 1000,
            ); // in seconds
          }
        }

        return {
          childId: c.id,
          name: c.name,
          grNumber: c.grNumber,
          className: c.className,
          section: c.section,
          image: c.image,
          presenceStatus: c.presenceStatus,
          lastGateTapAt: c.lastGateTapAt,
          timeInsideSeconds: timeInside,
          timeInsideFormatted: timeInside ? formatDuration(timeInside) : null,
          logs: logs.map((log) => ({
            id: log.id,
            direction: log.direction,
            gateId: log.gateId,
            tappedAt: log.tappedAt,
            isValid: log.isValid,
            anomalyReason: log.anomalyReason,
          })),
        };
      }),
    );

    // Filter by presence status if requested
    let result = attendanceData;
    if (presenceStatus) {
      result = attendanceData.filter((d) => d.presenceStatus === presenceStatus);
    }

    const now = Date.now();
    const twoHoursSeconds = 2 * 60 * 60;
    const totalStudents = result.length;
    const insideCount = result.filter((d) => d.presenceStatus === "INSIDE").length;
    const outsideCount = totalStudents - insideCount;
    const totalTapEvents = result.reduce((sum, d) => sum + d.logs.length, 0);
    const anomalyCount = result.reduce(
      (sum, d) =>
        sum + d.logs.filter((l: { isValid: boolean }) => l.isValid === false).length,
      0,
    );
    const overstayCount = result.filter(
      (d) => d.presenceStatus === "INSIDE" && (d.timeInsideSeconds || 0) >= twoHoursSeconds,
    ).length;

    const tapsLast24h = result.reduce(
      (sum, d) =>
        sum +
        d.logs.filter(
          (l: { tappedAt: Date | string }) =>
            now - new Date(l.tappedAt).getTime() <= 24 * 60 * 60 * 1000,
        ).length,
      0,
    );

    return NextResponse.json({
      success: true,
      count: result.length,
      data: result,
      records: result,
      stats: {
        totalStudents,
        insideCount,
        outsideCount,
        totalTapEvents,
        tapsLast24h,
        anomalyCount,
        overstayCount,
      },
      filters: {
        childId,
        grNumber,
        date,
        startDate,
        endDate,
        presenceStatus,
        q,
      },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Attendance query error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}
