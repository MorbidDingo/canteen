import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, gateLog } from "@/lib/db/schema";
import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { isMissingRelationError } from "@/lib/db-errors";
import { getUserAccessibleDeviceIds } from "@/lib/device-context";

export async function GET() {
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
        },
      });
    }

    let scopedChildIds: string[] | null = null;
    if (scopedGateDeviceIds) {
      try {
        const scopedRows = await db
          .select({ childId: gateLog.childId })
          .from(gateLog)
          .where(inArray(gateLog.gateId, scopedGateDeviceIds));
        scopedChildIds = Array.from(new Set(scopedRows.map((row) => row.childId)));
      } catch (err) {
        if (isMissingRelationError(err, "gate_log")) {
          scopedChildIds = [];
        } else {
          throw err;
        }
      }
    }

    if (scopedChildIds && scopedChildIds.length === 0) {
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
        },
      });
    }

    const totalStudentsRows = await db
      .select({ id: child.id })
      .from(child)
      .where(
        and(
          eq(child.organizationId, organizationId),
          scopedChildIds ? inArray(child.id, scopedChildIds) : undefined,
        ),
      );
    const insideRows = await db
      .select({ id: child.id })
      .from(child)
      .where(
        and(
          eq(child.organizationId, organizationId),
          eq(child.presenceStatus, "INSIDE"),
          scopedChildIds ? inArray(child.id, scopedChildIds) : undefined,
        ),
      );

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let logsLast24h: Array<{ id: string; isValid: boolean }> = [];
    try {
      logsLast24h = await db
        .select({ id: gateLog.id, isValid: gateLog.isValid })
        .from(gateLog)
        .innerJoin(child, eq(gateLog.childId, child.id))
        .where(
          and(
            gte(gateLog.tappedAt, last24h),
            eq(child.organizationId, organizationId),
            scopedGateDeviceIds ? inArray(gateLog.gateId, scopedGateDeviceIds) : undefined,
            scopedChildIds ? inArray(child.id, scopedChildIds) : undefined,
          ),
        );
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
          eq(child.organizationId, organizationId),
          eq(child.presenceStatus, "INSIDE"),
          isNotNull(child.lastGateTapAt),
          lte(child.lastGateTapAt, overstayThreshold),
          scopedChildIds ? inArray(child.id, scopedChildIds) : undefined,
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
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Attendance summary error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
