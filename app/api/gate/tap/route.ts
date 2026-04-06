import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, gateLog, organizationMembership } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { GATE_TAP_COOLDOWN_MS } from "@/lib/constants";
import { broadcast } from "@/lib/sse";
import { isMissingRelationError } from "@/lib/db-errors";
import { sanitizeImageUrl } from "@/lib/image-url";
import { notifyParentForChild } from "@/lib/parent-notifications";
import { resolveChildByRfid } from "@/lib/rfid-access";
import { getSession } from "@/lib/auth-server";
import { resolveOrganizationDeviceFromRequest, touchOrganizationDevice } from "@/lib/device-context";

/**
 * POST /api/gate/tap
 *
 * Public endpoint (no auth) — placed at school gate kiosks.
 * Accepts an RFID card tap and records entry/exit.
 *
 * Body: { rfidCardId: string, gateId?: string }
 *
 * Improved Logic:
 * 1. Look up child by rfidCardId
 * 2. Fetch current presence status
 * 3. Enforce cooldown (3 second)
 * 4. Validate direction based on presence status
 *    - If OUTSIDE → must be ENTRY
 *    - If INSIDE → must be EXIT
 * 5. Detect anomalies (e.g., duplicate attempt without mode change)
 * 6. Update presence status & gate log
 * 7. Return result with warnings if needed
 */
export async function POST(request: NextRequest) {
  try {
    let requestOrgId =
      request.headers.get("x-organization-id")?.trim() ||
      request.headers.get("x-org-id")?.trim() ||
      request.cookies.get("activeOrganizationId")?.value?.trim() ||
      null;

    if (!requestOrgId) {
      const session = await getSession();
      if (session?.user?.id) {
        const [firstMembership] = await db
          .select({ organizationId: organizationMembership.organizationId })
          .from(organizationMembership)
          .where(
            and(
              eq(organizationMembership.userId, session.user.id),
              eq(organizationMembership.status, "ACTIVE"),
            ),
          )
          .limit(1);
        requestOrgId = firstMembership?.organizationId ?? null;
      }
    }

    if (!requestOrgId) {
      return NextResponse.json(
        { error: "Organization context is required for gate tap" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { rfidCardId, gateId, deviceCode } = body as {
      rfidCardId?: string;
      gateId?: string;
      deviceCode?: string;
    };

    const resolvedDevice = await resolveOrganizationDeviceFromRequest({
      request,
      organizationId: requestOrgId,
      allowedDeviceTypes: ["GATE"],
      fallbackDeviceCode: deviceCode || gateId || null,
    });

    if (resolvedDevice) {
      await touchOrganizationDevice(resolvedDevice.id, request);
    }

    const persistedGateId = resolvedDevice?.id ?? gateId?.trim() ?? null;

    if (!rfidCardId || typeof rfidCardId !== "string" || !rfidCardId.trim()) {
      return NextResponse.json(
        { error: "rfidCardId is required" },
        { status: 400 },
      );
    }

    const trimmedCardId = rfidCardId.trim();
    const now = new Date();

    // 1. Look up child by permanent/temporary RFID card with presence status
    const resolved = await resolveChildByRfid(trimmedCardId, requestOrgId);
    const student = resolved?.child;

    if (!student) {
      return NextResponse.json(
        { error: "Card not registered to any student" },
        { status: 404 },
      );
    }

    // 2. Check cooldown — prevent rapid re-taps
    if (
      student.lastGateTapAt &&
      Date.now() - new Date(student.lastGateTapAt).getTime() <
        GATE_TAP_COOLDOWN_MS
    ) {
      const elapsed = Date.now() - new Date(student.lastGateTapAt).getTime();
      const waitMs = GATE_TAP_COOLDOWN_MS - elapsed;
      return NextResponse.json(
        {
          error: "Too fast — please wait before tapping again",
          retryAfterMs: Math.ceil(waitMs),
          student: {
            name: student.name,
            image: student.image,
            grNumber: student.grNumber,
            className: student.className,
            section: student.section,
          },
        },
        { status: 429 },
      );
    }

    // 3. Determine expected direction based on presence status
    const expectedDirection: "ENTRY" | "EXIT" =
      student.presenceStatus === "OUTSIDE" ? "ENTRY" : "EXIT";

    // 4. Fetch last log to detect anomalies
    let lastLog:
      | {
          direction: "ENTRY" | "EXIT";
          tappedAt: Date;
          isValid: boolean;
        }
      | undefined;
    let gateLogAvailable = true;

    try {
      const [queriedLastLog] = await db
        .select({
          direction: gateLog.direction,
          tappedAt: gateLog.tappedAt,
          isValid: gateLog.isValid,
        })
        .from(gateLog)
        .where(eq(gateLog.childId, student.id))
        .orderBy(desc(gateLog.tappedAt))
        .limit(1);
      lastLog = queriedLastLog as typeof lastLog;
    } catch (err) {
      if (isMissingRelationError(err, "gate_log")) {
        gateLogAvailable = false;
        console.error("gate_log table missing. Please run DB migrations on this environment.");
      } else {
        throw err;
      }
    }

    // 5. Detect anomalies
    let anomalyReason: string | null = null;

    // Anomaly: If last log was marked invalid, still proceed but flag it
    if (lastLog && !lastLog.isValid) {
      anomalyReason = `Last tap was invalid (${lastLog.direction}), recovering with ${expectedDirection}`;
    }

    // Anomaly: Direction doesn't match presence status
    if (lastLog && lastLog.direction === expectedDirection) {
      // This means student is trying to do the same action twice (e.g., ENTRY twice without EXIT)
      anomalyReason = `Duplicate ${expectedDirection} detected — last tap was ${lastLog.direction} at ${new Date(lastLog.tappedAt).toLocaleTimeString()}`;
    }

    // 6. Insert gate log with anomaly flag
    if (gateLogAvailable) {
      await db.insert(gateLog).values({
        childId: student.id,
        direction: expectedDirection,
        gateId: persistedGateId,
        tappedAt: now,
        isValid: !anomalyReason, // Mark as invalid if anomaly detected
        anomalyReason,
      });
    }

    // 7. Update child's presence status & last tap time
    const newPresenceStatus =
      expectedDirection === "ENTRY" ? "INSIDE" : "OUTSIDE";
    await db
      .update(child)
      .set({
        presenceStatus: newPresenceStatus,
        lastGateTapAt: now,
        updatedAt: now,
      })
      .where(eq(child.id, student.id));

    // 8. Return result
    const response: Record<string, unknown> = {
      student: {
        id: student.id,
        name: student.name,
        grNumber: student.grNumber,
        className: student.className,
        section: student.section,
        image: sanitizeImageUrl(student.image),
      },
      direction: expectedDirection,
      presenceStatus: newPresenceStatus,
      tappedAt: now.toISOString(),
      cardSource: resolved?.source || "PERMANENT",
    };

    // Push live updates to attendance screens without refetching full records.
    broadcast("gate-tap", {
      id: `${student.id}-${now.getTime()}`,
      childId: student.id,
      name: student.name,
      grNumber: student.grNumber,
      direction: expectedDirection,
      presenceStatus: newPresenceStatus,
      tappedAt: now.toISOString(),
      image: sanitizeImageUrl(student.image),
    });

    await notifyParentForChild({
      childId: student.id,
      type: expectedDirection === "ENTRY" ? "GATE_ENTRY" : "GATE_EXIT",
      title:
        expectedDirection === "ENTRY"
          ? `${student.name} entered the gate`
          : `${student.name} exited the gate`,
      message: `${student.name} ${expectedDirection === "ENTRY" ? "entered" : "exited"} campus at ${now.toLocaleTimeString()}.`,
      metadata: {
        direction: expectedDirection,
        gateId: persistedGateId,
        tappedAt: now.toISOString(),
        grNumber: student.grNumber,
      },
    });

    if (!gateLogAvailable) {
      response.warning = "Tap processed, but attendance logs are unavailable. Run DB migrations (gate_log missing).";
      response.statusCode = 202;
    }

    // Include warning if anomaly detected
    if (anomalyReason) {
      response.warning = anomalyReason;
      response.statusCode = 202; // Accepted with caution
    }

    return NextResponse.json(response, {
      status: anomalyReason ? 202 : 200,
    });
  } catch (error) {
    console.error("Gate tap error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
