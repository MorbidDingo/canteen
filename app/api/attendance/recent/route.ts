import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, gateLog } from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { isMissingRelationError } from "@/lib/db-errors";
import { sanitizeImageUrl } from "@/lib/image-url";
import { getUserAccessibleDeviceIds } from "@/lib/device-context";

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
      return NextResponse.json({ success: true, gates: [], records: [] });
    }

    const { searchParams } = new URL(request.url);
    const parsedLimit = Number(searchParams.get("limit") || "3");
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 10))
      : 3;

    let logs: Array<{
      id: string;
      childId: string;
      direction: "ENTRY" | "EXIT";
      gateId: string | null;
      tappedAt: Date;
      isValid: boolean;
      anomalyReason: string | null;
      name: string;
      grNumber: string | null;
      image: string | null;
      presenceStatus: "INSIDE" | "OUTSIDE";
    }> = [];

    try {
      logs = await db
        .select({
          id: gateLog.id,
          childId: gateLog.childId,
          direction: gateLog.direction,
          gateId: gateLog.gateId,
          tappedAt: gateLog.tappedAt,
          isValid: gateLog.isValid,
          anomalyReason: gateLog.anomalyReason,
          name: child.name,
          grNumber: child.grNumber,
          image: child.image,
          presenceStatus: child.presenceStatus,
        })
        .from(gateLog)
        .innerJoin(child, eq(gateLog.childId, child.id))
        .where(
          and(
            eq(child.organizationId, organizationId),
            scopedGateDeviceIds ? inArray(gateLog.gateId, scopedGateDeviceIds) : undefined,
          ),
        )
        .orderBy(desc(gateLog.tappedAt))
        .limit(limit);
    } catch (err) {
      if (isMissingRelationError(err, "gate_log")) {
        return NextResponse.json({
          success: true,
          records: [],
          warning: "gate_log table missing on this environment. Run DB migrations.",
        });
      }
      throw err;
    }

    const gateRows = await db
      .select({ gateId: gateLog.gateId })
      .from(gateLog)
      .innerJoin(child, eq(gateLog.childId, child.id))
      .where(
        and(
          eq(child.organizationId, organizationId),
          scopedGateDeviceIds ? inArray(gateLog.gateId, scopedGateDeviceIds) : undefined,
        ),
      )
      .orderBy(desc(gateLog.tappedAt))
      .limit(200);

    const gates = Array.from(
      new Set(
        gateRows
          .map((row) => row.gateId)
          .filter((value): value is string => Boolean(value && value.trim())),
      ),
    );

    return NextResponse.json({
      success: true,
      gates,
      records: logs.map((log) => ({
        id: log.id,
        childId: log.childId,
        name: log.name,
        grNumber: log.grNumber,
        direction: log.direction,
        gateId: log.gateId,
        tappedAt: log.tappedAt,
        image: sanitizeImageUrl(log.image),
        presenceStatus: log.presenceStatus,
        isValid: log.isValid,
        anomalyReason: log.anomalyReason,
      })),
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Recent attendance fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
