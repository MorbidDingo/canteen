import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organization, child, anomalyAlert } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  runBatchAnomalyDetection,
  notifyParentOfAnomalies,
  type AnomalyAlert as AnomalyAlertType,
} from "@/lib/ml/anomaly-detection";
import { broadcast } from "@/lib/sse";

// ─── Cron Secret Verification ────────────────────────────
// Vercel cron sends CRON_SECRET in Authorization header.
// Block unauthorized manual invocations in production.

function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // Allow in dev without secret

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── POST /api/ml/batch — Batch anomaly detection cron ───

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  let totalAlerts = 0;
  let orgsProcessed = 0;
  const errors: string[] = [];

  try {
    // Get all active organizations
    const activeOrgs = await db
      .select({ id: organization.id, name: organization.name })
      .from(organization)
      .where(eq(organization.status, "ACTIVE"));

    for (const org of activeOrgs) {
      try {
        // Run batch anomaly detection for this org
        const alerts = await runBatchAnomalyDetection(org.id);

        if (alerts.length > 0) {
          // Insert anomaly alerts into database
          await db.insert(anomalyAlert).values(
            alerts.map((alert) => ({
              childId: alert.childId,
              organizationId: alert.orgId,
              type: alert.type,
              severity: alert.severity,
              message: alert.message,
              data: JSON.stringify(alert.data),
            })),
          );

          // Group alerts by parent for notification
          const alertsByParent = await groupAlertsByParent(alerts);

          for (const [parentId, parentAlerts] of alertsByParent) {
            await notifyParentOfAnomalies(parentAlerts, parentId);

            // Broadcast SSE for HIGH severity alerts
            const highSeverity = parentAlerts.filter((a) => a.severity === "HIGH");
            if (highSeverity.length > 0) {
              broadcast("parent-notification", {
                type: "anomaly-alert",
                parentId,
                count: highSeverity.length,
              });
            }
          }

          totalAlerts += alerts.length;
        }

        orgsProcessed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Org ${org.name}: ${msg}`);
      }
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      orgsProcessed,
      totalAlerts,
      errors: errors.length > 0 ? errors : undefined,
      durationMs: duration,
    });
  } catch (err) {
    console.error("Batch anomaly detection failed:", err);
    return NextResponse.json(
      { error: "Batch job failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────

async function groupAlertsByParent(
  alerts: AnomalyAlertType[],
): Promise<Map<string, AnomalyAlertType[]>> {
  const childIds = [...new Set(alerts.map((a) => a.childId))];

  const childParentMap = new Map<string, string>();
  for (const cId of childIds) {
    const [row] = await db
      .select({ parentId: child.parentId })
      .from(child)
      .where(eq(child.id, cId))
      .limit(1);
    if (row) {
      childParentMap.set(cId, row.parentId);
    }
  }

  const byParent = new Map<string, AnomalyAlertType[]>();
  for (const alert of alerts) {
    const parentId = childParentMap.get(alert.childId);
    if (!parentId) continue;

    const existing = byParent.get(parentId) ?? [];
    existing.push(alert);
    byParent.set(parentId, existing);
  }

  return byParent;
}
