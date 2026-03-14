import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, gateLog } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { GATE_TAP_COOLDOWN_MS } from "@/lib/constants";

/**
 * POST /api/gate/tap
 *
 * Public endpoint (no auth) — placed at school gate kiosks.
 * Accepts an RFID card tap and records entry/exit.
 *
 * Body: { rfidCardId: string, gateId?: string }
 *
 * Logic:
 * 1. Look up child by rfidCardId
 * 2. Enforce a 3-second cooldown per card
 * 3. Toggle direction (last was ENTRY → now EXIT, else ENTRY)
 * 4. Insert gate_log record
 * 5. Return child photo + name + direction for guard verification
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rfidCardId, gateId } = body as {
      rfidCardId?: string;
      gateId?: string;
    };

    if (!rfidCardId || typeof rfidCardId !== "string" || !rfidCardId.trim()) {
      return NextResponse.json(
        { error: "rfidCardId is required" },
        { status: 400 },
      );
    }

    const trimmedCardId = rfidCardId.trim();

    // 1. Look up child by RFID card
    const [student] = await db
      .select({
        id: child.id,
        name: child.name,
        grNumber: child.grNumber,
        className: child.className,
        section: child.section,
        image: child.image,
      })
      .from(child)
      .where(eq(child.rfidCardId, trimmedCardId))
      .limit(1);

    if (!student) {
      return NextResponse.json(
        { error: "Card not registered to any student" },
        { status: 404 },
      );
    }

    // 2. Check cooldown — fetch last gate log for this child
    const [lastLog] = await db
      .select({
        id: gateLog.id,
        direction: gateLog.direction,
        tappedAt: gateLog.tappedAt,
      })
      .from(gateLog)
      .where(eq(gateLog.childId, student.id))
      .orderBy(desc(gateLog.tappedAt))
      .limit(1);

    if (lastLog) {
      const elapsed = Date.now() - new Date(lastLog.tappedAt).getTime();
      if (elapsed < GATE_TAP_COOLDOWN_MS) {
        const waitMs = GATE_TAP_COOLDOWN_MS - elapsed;
        return NextResponse.json(
          {
            error: "Too fast — please wait before tapping again",
            retryAfterMs: waitMs,
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
    }

    // 3. Determine direction: toggle from last log
    const direction: "ENTRY" | "EXIT" =
      lastLog?.direction === "ENTRY" ? "EXIT" : "ENTRY";

    // 4. Insert gate log
    const now = new Date();
    await db.insert(gateLog).values({
      childId: student.id,
      direction,
      gateId: gateId?.trim() || null,
      tappedAt: now,
    });

    // 5. Return student info + direction for guard
    return NextResponse.json({
      student: {
        id: student.id,
        name: student.name,
        grNumber: student.grNumber,
        className: student.className,
        section: student.section,
        image: student.image,
      },
      direction,
      tappedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Gate tap error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
