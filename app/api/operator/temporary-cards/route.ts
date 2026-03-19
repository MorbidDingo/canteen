import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { child, temporaryRfidAccess, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { sendMessage } from "@/lib/messaging-service";

const MIN_STUDENT_HOURS = 1;
const MAX_STUDENT_HOURS = 48;

export async function GET() {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "OPERATOR"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Temporary card controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;

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
    .where(eq(temporaryRfidAccess.organizationId, organizationId))
    .orderBy(temporaryRfidAccess.createdAt);

  return NextResponse.json({
    cards: rows.map((row) => ({
      ...row,
      isActive: !row.revokedAt && row.validFrom <= now && row.validUntil >= now,
    })),
  });
}

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "OPERATOR"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Temporary card controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;

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
    .where(and(eq(child.id, childId), eq(child.organizationId, organizationId)))
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
        eq(temporaryRfidAccess.organizationId, organizationId),
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
        eq(temporaryRfidAccess.organizationId, organizationId),
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
      organizationId,
      childId,
      temporaryRfidCardId: trimmedTempCard,
      accessType,
      validFrom: now,
      validUntil,
      notes: notes?.trim() || null,
      createdByOperatorId: access.actorUserId,
    })
    .returning({
      id: temporaryRfidAccess.id,
      childId: temporaryRfidAccess.childId,
      temporaryRfidCardId: temporaryRfidAccess.temporaryRfidCardId,
      accessType: temporaryRfidAccess.accessType,
      validFrom: temporaryRfidAccess.validFrom,
      validUntil: temporaryRfidAccess.validUntil,
    });

  // ─── Send SMS/WhatsApp Notification ────────────────────
  try {
    const childData = await db.select({ parentId: child.parentId, name: child.name }).from(child).where(eq(child.id, childId)).limit(1);
    if (childData.length > 0) {
      const parentData = await db.select({ phone: user.phone }).from(user).where(eq(user.id, childData[0].parentId)).limit(1);
      if (parentData.length > 0 && parentData[0].phone) {
        const durationText = durationHours === 1 ? "1 hour" : `${durationHours} hours`;
        sendMessage({
          parentId: childData[0].parentId,
          childId,
          phoneNumber: parentData[0].phone,
          notificationType: "TEMPORARY_CARD_ISSUED",
          title: "Temporary Card Issued",
          message: `Temporary card ${trimmedTempCard} has been issued to ${childData[0].name}. Valid for ${durationText}.`,
          metadata: {
            childName: childData[0].name,
            cardId: trimmedTempCard,
            duration: durationText,
          },
        }).catch((error) => {
          console.error("[Messaging] Failed to send temporary card notification:", error);
        });
      }
    }
  } catch (error) {
    console.error("[Messaging] Error sending temporary card notification:", error);
  }

  return NextResponse.json({ card: created });
}

export async function DELETE(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "OPERATOR"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Temporary card controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;

  const cardId = request.nextUrl.searchParams.get("id")?.trim();
  if (!cardId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const now = new Date();
  const [updated] = await db
    .update(temporaryRfidAccess)
    .set({ revokedAt: now })
    .where(
      and(
        eq(temporaryRfidAccess.id, cardId),
        eq(temporaryRfidAccess.organizationId, organizationId),
        isNull(temporaryRfidAccess.revokedAt),
      ),
    )
    .returning({ id: temporaryRfidAccess.id });

  if (!updated) {
    return NextResponse.json({ error: "Temporary card not found or already revoked" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
