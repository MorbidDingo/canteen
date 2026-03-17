import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { child, temporaryRfidAccess } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";

const MIN_STUDENT_HOURS = 1;
const MAX_STUDENT_HOURS = 48;

export async function GET() {
  const session = await getSession();
  if (!session?.user || session.user.role !== "OPERATOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const rows = await db
    .select({
      id: temporaryRfidAccess.id,
      childId: temporaryRfidAccess.childId,
      childName: child.name,
      className: child.className,
      section: child.section,
      accessType: temporaryRfidAccess.accessType,
      temporaryRfidCardId: temporaryRfidAccess.temporaryRfidCardId,
      validFrom: temporaryRfidAccess.validFrom,
      validUntil: temporaryRfidAccess.validUntil,
      revokedAt: temporaryRfidAccess.revokedAt,
      createdAt: temporaryRfidAccess.createdAt,
    })
    .from(temporaryRfidAccess)
    .innerJoin(child, eq(child.id, temporaryRfidAccess.childId))
    .orderBy(temporaryRfidAccess.createdAt);

  return NextResponse.json({
    cards: rows.map((row) => ({
      ...row,
      isActive: !row.revokedAt && row.validFrom <= now && row.validUntil >= now,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "OPERATOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const {
    childId,
    temporaryRfidCardId,
    durationHours,
    notes,
    accessType,
  } = body as {
    childId?: string;
    temporaryRfidCardId?: string;
    durationHours?: number;
    notes?: string;
    accessType?: "STUDENT_TEMP" | "GUEST_TEMP";
  };

  if (!childId || !temporaryRfidCardId || !durationHours) {
    return NextResponse.json({ error: "childId, temporaryRfidCardId and durationHours are required" }, { status: 400 });
  }

  if (accessType !== "STUDENT_TEMP" && accessType !== "GUEST_TEMP") {
    return NextResponse.json({ error: "Invalid accessType" }, { status: 400 });
  }

  if (durationHours < MIN_STUDENT_HOURS || durationHours > MAX_STUDENT_HOURS) {
    return NextResponse.json({ error: "Student temporary card duration must be between 1 and 48 hours" }, { status: 400 });
  }

  const trimmedTempCard = temporaryRfidCardId.trim();
  if (!trimmedTempCard) {
    return NextResponse.json({ error: "Temporary RFID card id is required" }, { status: 400 });
  }

  const [targetChild] = await db
    .select({ id: child.id, permanentRfidCardId: child.rfidCardId })
    .from(child)
    .where(eq(child.id, childId))
    .limit(1);

  if (!targetChild) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  if (targetChild.permanentRfidCardId === trimmedTempCard) {
    return NextResponse.json({ error: "Temporary RFID cannot match permanent card id" }, { status: 400 });
  }

  const [duplicatePermanent] = await db
    .select({ id: child.id })
    .from(child)
    .where(eq(child.rfidCardId, trimmedTempCard))
    .limit(1);

  if (duplicatePermanent) {
    return NextResponse.json({ error: "This RFID is already assigned as a permanent card" }, { status: 409 });
  }

  const now = new Date();

  const [duplicateTemporary] = await db
    .select({ id: temporaryRfidAccess.id })
    .from(temporaryRfidAccess)
    .where(
      and(
        eq(temporaryRfidAccess.temporaryRfidCardId, trimmedTempCard),
        isNull(temporaryRfidAccess.revokedAt),
        gt(temporaryRfidAccess.validUntil, now),
      ),
    )
    .limit(1);

  if (duplicateTemporary) {
    return NextResponse.json({ error: "This temporary RFID is already active" }, { status: 409 });
  }

  const [activeForChild] = await db
    .select({ id: temporaryRfidAccess.id })
    .from(temporaryRfidAccess)
    .where(
      and(
        eq(temporaryRfidAccess.childId, childId),
        eq(temporaryRfidAccess.accessType, "STUDENT_TEMP"),
        isNull(temporaryRfidAccess.revokedAt),
        gt(temporaryRfidAccess.validUntil, now),
      ),
    )
    .limit(1);

  if (activeForChild) {
    return NextResponse.json({ error: "Student already has an active temporary card" }, { status: 409 });
  }

  const validUntil = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
  const [created] = await db
    .insert(temporaryRfidAccess)
    .values({
      childId,
      temporaryRfidCardId: trimmedTempCard,
      accessType,
      validFrom: now,
      validUntil,
      notes: notes?.trim() || null,
      createdByOperatorId: session.user.id,
    })
    .returning({
      id: temporaryRfidAccess.id,
      childId: temporaryRfidAccess.childId,
      temporaryRfidCardId: temporaryRfidAccess.temporaryRfidCardId,
      accessType: temporaryRfidAccess.accessType,
      validFrom: temporaryRfidAccess.validFrom,
      validUntil: temporaryRfidAccess.validUntil,
    });

  return NextResponse.json({ card: created });
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "OPERATOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cardId = request.nextUrl.searchParams.get("id")?.trim();
  if (!cardId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const now = new Date();
  const [updated] = await db
    .update(temporaryRfidAccess)
    .set({ revokedAt: now })
    .where(and(eq(temporaryRfidAccess.id, cardId), isNull(temporaryRfidAccess.revokedAt)))
    .returning({ id: temporaryRfidAccess.id });

  if (!updated) {
    return NextResponse.json({ error: "Temporary card not found or already revoked" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
