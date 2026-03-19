import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { child, gateLog } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { isMissingRelationError } from "@/lib/db-errors";
import { sanitizeImageUrl } from "@/lib/image-url";
import { formatSeconds } from "@/lib/attendance-utils";
import { getUserAccessibleDeviceIds } from "@/lib/device-context";

type StudentLog = {
  childId: string;
  direction: "ENTRY" | "EXIT";
  gateId: string | null;
  tappedAt: Date;
  isValid: boolean;
};

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
    const scopedGateDeviceIds =
      access.membershipRole === "ATTENDANCE"
        ? await getUserAccessibleDeviceIds({
            organizationId,
            userId: access.actorUserId,
            allowedDeviceTypes: ["GATE"],
          })
        : null;

    if (scopedGateDeviceIds && scopedGateDeviceIds.length === 0) {
      return NextResponse.json({
        success: true,
        stats: {
          totalStudents: 0,
          insideCount: 0,
          outsideCount: 0,
          totalTapEvents: 0,
          tapsLast24h: 0,
          anomalyCount: 0,
          overstayCount: 0,
          withPhotoCount: 0,
          withoutPhotoCount: 0,
          entriesLast24h: 0,
          exitsLast24h: 0,
          gateBreakdown: [],
        },
        students: [],
        totalMatched: 0,
        query: "",
      });
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
      .where(eq(child.organizationId, organizationId))
      .orderBy(child.name);

    const scopedStudents = allStudents;

    const filteredStudents = q
      ? scopedStudents.filter((s) => {
          const name = (s.name || "").toLowerCase();
          const gr = (s.grNumber || "").toLowerCase();
          const className = (s.className || "").toLowerCase();
          const section = (s.section || "").toLowerCase();
          return name.includes(q) || gr.includes(q) || className.includes(q) || section.includes(q);
        })
      : scopedStudents;

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
          gateId: gateLog.gateId,
          tappedAt: gateLog.tappedAt,
          isValid: gateLog.isValid,
        })
        .from(gateLog)
        .where(
          and(
            gte(gateLog.tappedAt, last24h),
            scopedGateDeviceIds ? inArray(gateLog.gateId, scopedGateDeviceIds) : undefined,
          ),
        );

      if (selectedIds.length > 0) {
        allLogsForSelected = await db
          .select({
            childId: gateLog.childId,
            direction: gateLog.direction,
            gateId: gateLog.gateId,
            tappedAt: gateLog.tappedAt,
            isValid: gateLog.isValid,
          })
          .from(gateLog)
          .where(
            and(
              inArray(gateLog.childId, selectedIds),
              scopedGateDeviceIds ? inArray(gateLog.gateId, scopedGateDeviceIds) : undefined,
            ),
          )
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

    const insideCount = scopedStudents.filter((s) => s.presenceStatus === "INSIDE").length;
    const totalStudents = scopedStudents.length;

    const overstayRows = scopedStudents.filter(
      (s) =>
        s.presenceStatus === "INSIDE" &&
        s.lastGateTapAt &&
        new Date(s.lastGateTapAt).getTime() <= overstayThreshold.getTime(),
    );

    const withPhotoCount = scopedStudents.filter((s) => Boolean(s.image)).length;
    const entriesLast24h = logsLast24h.filter((l) => l.direction === "ENTRY").length;
    const exitsLast24h = logsLast24h.filter((l) => l.direction === "EXIT").length;
    const gateBreakdown = Array.from(
      logsLast24h.reduce((acc, row) => {
        const key = row.gateId?.trim() || "UNASSIGNED_GATE";
        const count = acc.get(key) ?? 0;
        acc.set(key, count + 1);
        return acc;
      }, new Map<string, number>()),
    ).map(([gateId, count]) => ({ gateId, count }));

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
        gateBreakdown,
      },
      students,
      totalMatched: filteredStudents.length,
      query: q,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Attendance reports error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
