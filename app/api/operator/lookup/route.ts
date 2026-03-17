import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, wallet } from "@/lib/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { resolveChildByRfid } from "@/lib/rfid-access";

export async function GET(request: NextRequest) {
  const rfid = request.nextUrl.searchParams.get("rfid");
  if (!rfid) {
    return NextResponse.json({ error: "Missing rfid parameter" }, { status: 400 });
  }

  const resolved = await resolveChildByRfid(rfid);
  if (!resolved) {
    return NextResponse.json({ error: "Card not found or not assigned to any student" }, { status: 404 });
  }

  const row = resolved.child;
  const siblingRows = await db
    .select({ id: child.id })
    .from(child)
    .where(eq(child.parentId, row.parentId));
  const siblingIds = siblingRows.map((s) => s.id);
  const [familyWallet] = siblingIds.length
    ? await db
      .select({ balance: wallet.balance })
      .from(wallet)
      .where(inArray(wallet.childId, siblingIds))
      .orderBy(asc(wallet.createdAt))
      .limit(1)
    : [];

  return NextResponse.json({
    id: row.id,
    name: row.name,
    grNumber: row.grNumber,
    className: row.className,
    section: row.section,
    rfidCardId: row.permanentRfidCardId,
    walletBalance: familyWallet?.balance ?? 0,
    cardSource: resolved.source,
    temporaryValidUntil: resolved.temporaryAccess?.validUntil ?? null,
  });
}
