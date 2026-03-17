import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, wallet } from "@/lib/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

// GET /api/wallet — return a single family wallet for the parent
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "GENERAL") {
    return NextResponse.json([]);
  }

  const children = await db
    .select({ id: child.id, name: child.name, rfidCardId: child.rfidCardId })
    .from(child)
    .orderBy(asc(child.createdAt))
    .where(eq(child.parentId, session.user.id));

  if (children.length === 0) {
    return NextResponse.json([]);
  }

  const childIds = children.map((c) => c.id);
  const wallets = await db
    .select()
    .from(wallet)
    .where(inArray(wallet.childId, childIds))
    .orderBy(asc(wallet.createdAt));

  const primaryWallet = wallets[0];
  const primaryChild = children[0];

  return NextResponse.json([
    {
      childId: primaryChild.id,
      childName: primaryChild.name,
      parentName: session.user.name,
      rfidCardLast3: primaryChild.rfidCardId ? primaryChild.rfidCardId.slice(-3) : null,
      balance: primaryWallet?.balance ?? 0,
    },
  ]);
}
