import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { child, temporaryRfidAccess, user, wallet } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

const MIN_GUEST_HOURS = 1;
const MAX_GUEST_HOURS = 5 * 24;

function sanitizeToken(value: string) {
  return value.trim().replace(/\s+/g, " ");
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
      { error: "Guest card controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;

  const body = await request.json();
  const {
    guestName,
    temporaryRfidCardId,
    durationHours,
    notes,
  } = body as {
    guestName?: string;
    temporaryRfidCardId?: string;
    durationHours?: number;
    notes?: string;
  };

  const name = sanitizeToken(guestName || "");
  const tempCard = sanitizeToken(temporaryRfidCardId || "");

  if (!name || !tempCard || !durationHours) {
    return NextResponse.json({ error: "guestName, temporaryRfidCardId and durationHours are required" }, { status: 400 });
  }

  if (durationHours < MIN_GUEST_HOURS || durationHours > MAX_GUEST_HOURS) {
    return NextResponse.json({ error: "Guest access duration must be between 1 and 120 hours (5 days)" }, { status: 400 });
  }

  const [duplicatePermanent] = await db
    .select({ id: child.id })
    .from(child)
    .where(and(eq(child.organizationId, organizationId), eq(child.rfidCardId, tempCard)))
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
        eq(temporaryRfidAccess.organizationId, organizationId),
        eq(temporaryRfidAccess.temporaryRfidCardId, tempCard),
        isNull(temporaryRfidAccess.revokedAt),
        gt(temporaryRfidAccess.validUntil, now),
      ),
    )
    .limit(1);

  if (duplicateTemporary) {
    return NextResponse.json({ error: "This temporary RFID is already active" }, { status: 409 });
  }

  const guestUserId = crypto.randomUUID();
  const uniqueEmail = `guest.${Date.now()}.${Math.floor(Math.random() * 100000)}@certe.local`;

  const [guestUser] = await db
    .insert(user)
    .values({
      id: guestUserId,
      name,
      email: uniqueEmail,
      emailVerified: false,
      role: "GENERAL",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: user.id, name: user.name });

  const [guestChild] = await db
    .insert(child)
    .values({
      organizationId,
      parentId: guestUser.id,
      name,
      grNumber: null,
      className: "GENERAL",
      section: null,
      rfidCardId: null,
      presenceStatus: "OUTSIDE",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: child.id, name: child.name });

  await db.insert(wallet).values({
    childId: guestChild.id,
    balance: 0,
    createdAt: now,
    updatedAt: now,
  });

  const validUntil = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

  const [temporaryCard] = await db
    .insert(temporaryRfidAccess)
    .values({
      organizationId,
      childId: guestChild.id,
      temporaryRfidCardId: tempCard,
      accessType: "GUEST_TEMP",
      validFrom: now,
      validUntil,
      notes: notes?.trim() || null,
      createdByOperatorId: access.actorUserId,
    })
    .returning({
      id: temporaryRfidAccess.id,
      temporaryRfidCardId: temporaryRfidAccess.temporaryRfidCardId,
      validUntil: temporaryRfidAccess.validUntil,
    });

  return NextResponse.json({
    guest: {
      childId: guestChild.id,
      name: guestChild.name,
      className: "GENERAL",
      role: "GENERAL",
    },
    temporaryCard,
  });
}
