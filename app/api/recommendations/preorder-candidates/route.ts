import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, certeSubscription } from "@/lib/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { predictConsumption } from "@/lib/ml/predictive-wallet";

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
    .select({ id: child.id, name: child.name, className: child.className })
    .from(child)
    .where(eq(child.parentId, userId));

  if (children.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  // Predict consumption for tomorrow for each child
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Skip weekends
  const day = tomorrow.getDay();
  if (day === 0) tomorrow.setDate(tomorrow.getDate() + 1); // Sunday → Monday
  if (day === 6) tomorrow.setDate(tomorrow.getDate() + 2); // Saturday → Monday

  const allCandidates = await Promise.all(
    children.map(async (c) => {
      const predictions = await predictConsumption(c.id, orgId, tomorrow, {
        className: c.className,
      });
      return predictions.map((p) => ({
        ...p,
        childId: c.id,
        childName: c.name,
      }));
    }),
  );

  // Flatten and sort by probability
  const candidates = allCandidates
    .flat()
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 10);

  return NextResponse.json({
    candidates,
    targetDate: tomorrow.toISOString().slice(0, 10),
  });
}
