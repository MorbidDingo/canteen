import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { childId, rfidCardId } = body;

  if (!childId) {
    return NextResponse.json({ error: "childId is required" }, { status: 400 });
  }

  // If assigning a card, check it's not already in use
  if (rfidCardId) {
    const existing = await db
      .select({ id: child.id, name: child.name })
      .from(child)
      .where(eq(child.rfidCardId, rfidCardId))
      .limit(1);

    if (existing.length > 0 && existing[0].id !== childId) {
      return NextResponse.json(
        { error: `This card is already assigned to ${existing[0].name}` },
        { status: 409 }
      );
    }
  }

  // Update the child's RFID card
  await db
    .update(child)
    .set({
      rfidCardId: rfidCardId || null,
      updatedAt: new Date(),
    })
    .where(eq(child.id, childId));

  return NextResponse.json({ success: true });
}
