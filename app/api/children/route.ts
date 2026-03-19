import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, wallet, parentControl } from "@/lib/db/schema";
import { eq, inArray, asc, count } from "drizzle-orm";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { ensureGeneralSelfProfile } from "@/lib/general-account";
import { MAX_CHILDREN_PER_PARENT } from "@/lib/constants";
import { maskIdentifier, maskName } from "@/lib/privacy";

// GET /api/children — list all children for the logged-in parent
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

  if (session.user.role === "GENERAL") {
    await ensureGeneralSelfProfile(session.user.id, session.user.name);
  }

  const children = await db
    .select({
      id: child.id,
      name: child.name,
      grNumber: child.grNumber,
      className: child.className,
      section: child.section,
      rfidCardId: child.rfidCardId,
    })
    .from(child)
    .where(eq(child.parentId, session.user.id));

  const childIds = children.map((c) => c.id);
  const [familyWallet] = childIds.length
    ? await db
      .select({ balance: wallet.balance })
      .from(wallet)
      .where(inArray(wallet.childId, childIds))
      .orderBy(asc(wallet.createdAt))
      .limit(1)
    : [];

  return NextResponse.json(
    children.map((c) => ({
      ...c,
      walletBalance: familyWallet?.balance ?? 0,
    }))
  );
}

// POST /api/children — add a new child
export async function POST(request: NextRequest) {
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

  if (session.user.role === "GENERAL") {
    return NextResponse.json(
      { error: "General accounts do not support child management" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const { name, grNumber, className, section } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [childrenCount] = await db
    .select({ total: count() })
    .from(child)
    .where(eq(child.parentId, session.user.id));

  if ((childrenCount?.total ?? 0) >= MAX_CHILDREN_PER_PARENT) {
    return NextResponse.json(
      { error: `A parent can have at most ${MAX_CHILDREN_PER_PARENT} children` },
      { status: 409 },
    );
  }

  const [inserted] = await db
    .insert(child)
    .values({
      parentId: session.user.id,
      name: maskName(name),
      grNumber: maskIdentifier(grNumber),
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
