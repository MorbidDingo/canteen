import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, wallet } from "@/lib/db/schema";
import { asc, eq, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const rfid = request.nextUrl.searchParams.get("rfid");
  if (!rfid) {
    return NextResponse.json({ error: "Missing rfid parameter" }, { status: 400 });
  }

  // Look up child by RFID card ID
  const result = await db
    .select({
      id: child.id,
      name: child.name,
      grNumber: child.grNumber,
      className: child.className,
      section: child.section,
      rfidCardId: child.rfidCardId,
      parentId: child.parentId,
    })
    .from(child)
    .where(eq(child.rfidCardId, rfid))
    .limit(1);

  if (result.length === 0) {
    return NextResponse.json({ error: "Card not found or not assigned to any student" }, { status: 404 });
  }

  const row = result[0];
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
    rfidCardId: row.rfidCardId,
    walletBalance: familyWallet?.balance ?? 0,
  });
}
