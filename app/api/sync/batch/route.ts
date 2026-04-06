import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { offlineSyncAction } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type IncomingAction = {
  id: string;
  type: "KIOSK_ORDER" | "LIBRARY_ISSUE" | "LIBRARY_RETURN" | "GATE_TAP";
  payload: Record<string, unknown>;
};

function getEndpoint(type: IncomingAction["type"]) {
  if (type === "KIOSK_ORDER") return "/api/kiosk/order";
  if (type === "LIBRARY_ISSUE") return "/api/library/issue";
  if (type === "GATE_TAP") return "/api/gate/tap";
  return "/api/library/return";
}

async function saveSyncLog(
  actionId: string,
  actionType: IncomingAction["type"],
  status: "SUCCESS" | "FAILED",
  response: Record<string, unknown>,
) {
  try {
    await db
      .insert(offlineSyncAction)
      .values({
        actionId,
        actionType,
        status,
        response: JSON.stringify(response),
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: offlineSyncAction.actionId,
        set: {
          status,
          response: JSON.stringify(response),
          processedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  } catch {
    // Idempotency logging must not block sync execution.
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { actions?: IncomingAction[] };
    const actions = Array.isArray(body.actions) ? body.actions : [];

    if (actions.length === 0) {
      return NextResponse.json({ success: true, processed: [] });
    }

    const origin = request.nextUrl.origin;
    const processed: { id: string; success: boolean; reason?: string }[] = [];
    const seenInBatch = new Set<string>();

    for (const action of actions) {
      if (seenInBatch.has(action.id)) {
        processed.push({ id: action.id, success: true });
        continue;
      }
      seenInBatch.add(action.id);

      try {
        const existing = await db
          .select({ status: offlineSyncAction.status })
          .from(offlineSyncAction)
          .where(eq(offlineSyncAction.actionId, action.id))
          .limit(1);

        if (existing[0]?.status === "SUCCESS") {
          processed.push({ id: action.id, success: true });
          continue;
        }

        const endpoint = getEndpoint(action.type);
        const response = await fetch(`${origin}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-offline-sync": "1",
            "x-offline-action-id": action.id,
          },
          body: JSON.stringify(action.payload),
          cache: "no-store",
        });

        const data = await response.json();
        if (!response.ok || !data?.success) {
          await saveSyncLog(action.id, action.type, "FAILED", data ?? { reason: "Sync failed" });

          processed.push({
            id: action.id,
            success: false,
            reason: data?.reason ?? "Sync failed",
          });
        } else {
          await saveSyncLog(action.id, action.type, "SUCCESS", data ?? { success: true });

          processed.push({ id: action.id, success: true });
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Network failure during sync";
        await saveSyncLog(action.id, action.type, "FAILED", { reason });
        processed.push({ id: action.id, success: false, reason });
      }
    }

    return NextResponse.json({ success: true, processed });
  } catch {
    return NextResponse.json(
      { success: false, reason: "Invalid sync payload" },
      { status: 400 },
    );
  }
}
