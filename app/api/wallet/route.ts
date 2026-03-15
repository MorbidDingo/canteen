import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, wallet } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

// GET /api/wallet — list wallet balances for all children of the parent
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await db
    .select({
      childId: child.id,
      childName: child.name,
      rfidCardId: child.rfidCardId,
      balance: wallet.balance,
    })
    .from(child)
    .innerJoin(wallet, eq(wallet.childId, child.id))
    .where(eq(child.parentId, session.user.id));

  return NextResponse.json(
    results.map((r) => ({
      childId: r.childId,
      childName: r.childName,
      parentName: session.user.name,
      rfidCardLast3: r.rfidCardId ? r.rfidCardId.slice(-3) : null,
      balance: r.balance ?? 0,
    }))
  );
}
