import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, certeSubscription, anomalyAlert } from "@/lib/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { getWalletForecast } from "@/lib/ml/predictive-wallet";

export async function GET() {
  let access;
  try {
    access = await requireLinkedAccount();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const session = access.session;
  const userId = session.user.id;
  const orgId = access.activeOrganizationId!;

  // Certe+ gate
  const [activeSub] = await db
    .select({ id: certeSubscription.id })
    .from(certeSubscription)
    .where(
      and(
        eq(certeSubscription.parentId, userId),
        eq(certeSubscription.status, "ACTIVE"),
        gte(certeSubscription.endDate, new Date()),
      ),
    )
    .limit(1);

  if (!activeSub) {
    return NextResponse.json(
      { error: "Certe+ subscription required", code: "SUBSCRIPTION_REQUIRED" },
      { status: 403 },
    );
  }

  const children = await db
    .select({ id: child.id, name: child.name })
    .from(child)
    .where(eq(child.parentId, userId));

  if (children.length === 0) {
    return NextResponse.json({ forecasts: [], anomalies: [] });
  }

  // Gather wallet forecasts + recent anomalies for all children
  const [forecasts, recentAnomalies] = await Promise.all([
    Promise.all(
      children.map(async (c) => {
        const forecast = await getWalletForecast(c.id, orgId);
        return { childId: c.id, childName: c.name, ...forecast };
      }),
    ),
    db
      .select({
        id: anomalyAlert.id,
        childId: anomalyAlert.childId,
        type: anomalyAlert.type,
        severity: anomalyAlert.severity,
        message: anomalyAlert.message,
        acknowledged: anomalyAlert.acknowledged,
        createdAt: anomalyAlert.createdAt,
      })
      .from(anomalyAlert)
      .where(
        and(
          eq(anomalyAlert.organizationId, orgId),
          gte(anomalyAlert.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        ),
      )
      .orderBy(desc(anomalyAlert.createdAt))
      .limit(20),
  ]);

  return NextResponse.json({ forecasts, anomalies: recentAnomalies });
}
