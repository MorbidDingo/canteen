import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { getRecommendations } from "@/lib/ml/recommendation-engine";

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

  // Get first child (default) for recommendations
  const children = await db
    .select({ id: child.id, className: child.className })
    .from(child)
    .where(eq(child.parentId, userId));

  if (children.length === 0) {
    return NextResponse.json({ recommendations: [] });
  }

  // Determine time slot
  const now = new Date();
  const hour = now.getHours();

  // Fetch recommendations for each child, return combined
  const allRecommendations = await Promise.all(
    children.map((c) =>
      getRecommendations(c.id, orgId, {
        className: c.className,
        maxResults: 8,
        currentHour: hour,
        currentDayOfWeek: now.getDay(),
      }).then((recs) => recs.map((r) => ({ ...r, childId: c.id }))),
    ),
  );

  // Deduplicate by menuItemId, keeping highest score
  const seen = new Map<string, (typeof allRecommendations)[0][0]>();
  for (const recs of allRecommendations) {
    for (const r of recs) {
      const existing = seen.get(r.menuItemId);
      if (!existing || r.score > existing.score) {
        seen.set(r.menuItemId, r);
      }
    }
  }

  return NextResponse.json({
    recommendations: Array.from(seen.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10),
    timeSlot: hour < 11 ? "MORNING" : hour < 14 ? "LUNCH" : "AFTERNOON",
  });
}
