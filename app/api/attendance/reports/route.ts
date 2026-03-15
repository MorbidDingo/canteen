import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { child, gateLog } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";
import { isMissingRelationError } from "@/lib/db-errors";
import { sanitizeImageUrl } from "@/lib/image-url";
import { formatSeconds } from "@/lib/attendance-utils";

type StudentLog = {
  childId: string;
  direction: "ENTRY" | "EXIT";
  tappedAt: Date;
  isValid: boolean;
};

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user || !["MANAGEMENT", "ATTENDANCE"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim().toLowerCase() || "";
    const limitRaw = Number(searchParams.get("limit") || "50");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;

    const allStudents = await db
      .select({
        id: child.id,
        name: child.name,
        grNumber: child.grNumber,
        className: child.className,
        section: child.section,
        image: child.image,
        presenceStatus: child.presenceStatus,
        lastGateTapAt: child.lastGateTapAt,
      })
      .from(child)
      .orderBy(child.name);

    const filteredStudents = q
      ? allStudents.filter((s) => {
          const name = (s.name || "").toLowerCase();
          const gr = (s.grNumber || "").toLowerCase();
          const className = (s.className || "").toLowerCase();
          const section = (s.section || "").toLowerCase();
          return name.includes(q) || gr.includes(q) || className.includes(q) || section.includes(q);
        })
      : allStudents;

    const selectedStudents = filteredStudents.slice(0, limit);
    const selectedIds = selectedStudents.map((s) => s.id);

    const now = Date.now();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const overstayThreshold = new Date(now - 2 * 60 * 60 * 1000);

    let logsLast24h: StudentLog[] = [];
    let allLogsForSelected: StudentLog[] = [];

    try {
      logsLast24h = await db
        .select({
          childId: gateLog.childId,
          direction: gateLog.direction,
          tappedAt: gateLog.tappedAt,
          isValid: gateLog.isValid,
        })
        .from(gateLog)
        .where(gte(gateLog.tappedAt, last24h));

      if (selectedIds.length > 0) {
        allLogsForSelected = await db
          .select({
            childId: gateLog.childId,
            direction: gateLog.direction,
            tappedAt: gateLog.tappedAt,
            isValid: gateLog.isValid,
          })
          .from(gateLog)
          .where(inArray(gateLog.childId, selectedIds))
          .orderBy(desc(gateLog.tappedAt));
      }
    } catch (err) {
      if (!isMissingRelationError(err, "gate_log")) {
        throw err;
      }
    }

    const logsByChild = new Map<string, StudentLog[]>();
    for (const log of allLogsForSelected) {
      const existing = logsByChild.get(log.childId) || [];
      existing.push(log);
      logsByChild.set(log.childId, existing);
    }

    const students = selectedStudents.map((s) => {
      const logs = logsByChild.get(s.id) || [];
      const tapsLast24h = logs.filter((l) => new Date(l.tappedAt).getTime() >= last24h.getTime()).length;
      const anomalyCount = logs.filter((l) => l.isValid === false).length;

      let timeInsideSeconds: number | null = null;
      if (s.presenceStatus === "INSIDE" && s.lastGateTapAt) {
        timeInsideSeconds = Math.max(0, Math.floor((now - new Date(s.lastGateTapAt).getTime()) / 1000));
      }

      return {
        childId: s.id,
        name: s.name,
        grNumber: s.grNumber,
        className: s.className,
        section: s.section,
        image: sanitizeImageUrl(s.image),
        hasPhoto: Boolean(s.image),
        presenceStatus: s.presenceStatus,
        lastGateTapAt: s.lastGateTapAt,
        totalTaps: logs.length,
        tapsLast24h,
        anomalyCount,
        timeInsideSeconds,
        timeInsideFormatted: timeInsideSeconds != null ? formatSeconds(timeInsideSeconds) : null,
      };
    });

    const insideCount = allStudents.filter((s) => s.presenceStatus === "INSIDE").length;
    const totalStudents = allStudents.length;

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

    const withPhotoCount = allStudents.filter((s) => Boolean(s.image)).length;
    const entriesLast24h = logsLast24h.filter((l) => l.direction === "ENTRY").length;
    const exitsLast24h = logsLast24h.filter((l) => l.direction === "EXIT").length;

    return NextResponse.json({
      success: true,
      stats: {
        totalStudents,
        insideCount,
        outsideCount: totalStudents - insideCount,
        totalTapEvents: logsLast24h.length,
        tapsLast24h: logsLast24h.length,
        anomalyCount: logsLast24h.filter((l) => l.isValid === false).length,
        overstayCount: overstayRows.length,
        withPhotoCount,
        withoutPhotoCount: totalStudents - withPhotoCount,
        entriesLast24h,
        exitsLast24h,
      },
      students,
      totalMatched: filteredStudents.length,
      query: q,
    });
  } catch (error) {
    console.error("Attendance reports error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
