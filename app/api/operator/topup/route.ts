import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, wallet, walletTransaction } from "@/lib/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "OPERATOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { childId, amount } = body;

  if (!childId || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Invalid childId or amount" }, { status: 400 });
  }

  if (amount > 5000) {
    return NextResponse.json({ error: "Maximum top-up is ₹5,000" }, { status: 400 });
  }

  const [childRow] = await db
    .select({ parentId: child.parentId })
    .from(child)
    .where(eq(child.id, childId))
    .limit(1);

  if (!childRow?.parentId) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  const siblingRows = await db
    .select({ id: child.id })
    .from(child)
    .where(eq(child.parentId, childRow.parentId));
  const siblingIds = siblingRows.map((s) => s.id);

  // Find the family's primary wallet
  const wallets = await db
    .select()
    .from(wallet)
    .where(inArray(wallet.childId, siblingIds))
    .orderBy(asc(wallet.createdAt))
    .limit(1);

  if (wallets.length === 0) {
    return NextResponse.json({ error: "Wallet not found for this child" }, { status: 404 });
  }

  const w = wallets[0];
  const newBalance = w.balance + amount;

  // Update shared balance for all sibling wallets + create transaction
  await db
    .update(wallet)
    .set({ balance: newBalance, updatedAt: new Date() })
    .where(inArray(wallet.childId, siblingIds));

  await db.insert(walletTransaction).values({
    walletId: w.id,
    type: "TOP_UP",
    amount,
    balanceAfter: newBalance,
    description: `Cash top-up by operator`,
    operatorId: session.user.id,
  });

  return NextResponse.json({ newBalance });
}
