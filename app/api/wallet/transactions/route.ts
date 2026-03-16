import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, wallet, walletTransaction } from "@/lib/db/schema";
import { eq, and, desc, inArray, asc } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

// GET /api/wallet/transactions?childId=xxx
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const childId = request.nextUrl.searchParams.get("childId");
  if (!childId) {
    return NextResponse.json({ error: "childId required" }, { status: 400 });
  }

  // Verify the child belongs to this parent
  const children = await db
    .select()
    .from(child)
    .where(and(eq(child.id, childId), eq(child.parentId, session.user.id)))
    .limit(1);

  if (children.length === 0) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  // Resolve the shared family wallet (first wallet under the same parent)
  const siblingChildren = await db
    .select({ id: child.id })
    .from(child)
    .where(eq(child.parentId, session.user.id));

  const siblingIds = siblingChildren.map((c) => c.id);
  if (siblingIds.length === 0) {
    return NextResponse.json([]);
  }

  const wallets = await db
    .select()
    .from(wallet)
    .where(inArray(wallet.childId, siblingIds))
    .orderBy(asc(wallet.createdAt))
    .limit(1);

  if (wallets.length === 0) {
    return NextResponse.json([]);
  }

  const transactions = await db
    .select()
    .from(walletTransaction)
    .where(eq(walletTransaction.walletId, wallets[0].id))
    .orderBy(desc(walletTransaction.createdAt))
    .limit(50);

  return NextResponse.json(transactions);
}
