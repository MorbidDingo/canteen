import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, parentControl } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

// GET /api/controls — get controls for all children
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await db
    .select({
      childId: child.id,
      childName: child.name,
      dailySpendLimit: parentControl.dailySpendLimit,
      perOrderLimit: parentControl.perOrderLimit,
      blockedCategories: parentControl.blockedCategories,
      blockedItemIds: parentControl.blockedItemIds,
    })
    .from(child)
    .leftJoin(parentControl, eq(parentControl.childId, child.id))
    .where(eq(child.parentId, session.user.id));

  return NextResponse.json(
    results.map((r) => ({
      childId: r.childId,
      childName: r.childName,
      dailySpendLimit: r.dailySpendLimit,
      perOrderLimit: r.perOrderLimit,
      blockedCategories: safeParseJSON(r.blockedCategories),
      blockedItemIds: safeParseJSON(r.blockedItemIds),
    }))
  );
}

// PUT /api/controls — update controls for a specific child
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { childId, dailySpendLimit, perOrderLimit, blockedCategories } = body;

  if (!childId) {
    return NextResponse.json({ error: "childId required" }, { status: 400 });
  }

  // Verify ownership
  const children = await db
    .select()
    .from(child)
    .where(eq(child.id, childId))
    .limit(1);

  if (children.length === 0 || children[0].parentId !== session.user.id) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  // Check if parent_control exists
  const existing = await db
    .select()
    .from(parentControl)
    .where(eq(parentControl.childId, childId))
    .limit(1);

  const data = {
    dailySpendLimit: dailySpendLimit ?? null,
    perOrderLimit: perOrderLimit ?? null,
    blockedCategories: JSON.stringify(blockedCategories || []),
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db
      .update(parentControl)
      .set(data)
      .where(eq(parentControl.childId, childId));
  } else {
    await db.insert(parentControl).values({
      childId,
      ...data,
      blockedItemIds: "[]",
    });
  }

  return NextResponse.json({ success: true });
}

function safeParseJSON(val: string | null): string[] {
  if (!val) return [];
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}
