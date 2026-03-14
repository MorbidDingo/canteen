import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, gateLog } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { isMissingRelationError } from "@/lib/db-errors";
import { sanitizeImageUrl } from "@/lib/image-url";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user || !["MANAGEMENT", "ATTENDANCE"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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

    return NextResponse.json({
      success: true,
      records: logs.map((log) => ({
        id: log.id,
        childId: log.childId,
        name: log.name,
        grNumber: log.grNumber,
        direction: log.direction,
        tappedAt: log.tappedAt,
        image: sanitizeImageUrl(log.image),
        presenceStatus: log.presenceStatus,
        isValid: log.isValid,
        anomalyReason: log.anomalyReason,
      })),
    });
  } catch (error) {
    console.error("Recent attendance fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
