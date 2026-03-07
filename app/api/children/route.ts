import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, wallet, parentControl } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

// GET /api/children — list all children for the logged-in parent
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const children = await db
    .select({
      id: child.id,
      name: child.name,
      grNumber: child.grNumber,
      className: child.className,
      section: child.section,
      rfidCardId: child.rfidCardId,
      walletBalance: wallet.balance,
    })
    .from(child)
    .leftJoin(wallet, eq(wallet.childId, child.id))
    .where(eq(child.parentId, session.user.id));

  return NextResponse.json(
    children.map((c) => ({
      ...c,
      walletBalance: c.walletBalance ?? 0,
    }))
  );
}

// POST /api/children — add a new child
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, grNumber, className, section } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [inserted] = await db
    .insert(child)
    .values({
      parentId: session.user.id,
      name: name.trim(),
      grNumber: grNumber?.trim() || null,
      className: className?.trim() || null,
      section: section?.trim() || null,
    })
    .returning({ id: child.id });

  // Create wallet for the child
  await db.insert(wallet).values({
    childId: inserted.id,
    balance: 0,
  });

  // Create default parent controls
  await db.insert(parentControl).values({
    childId: inserted.id,
    blockedCategories: "[]",
    blockedItemIds: "[]",
  });

  return NextResponse.json({ id: inserted.id }, { status: 201 });
}
