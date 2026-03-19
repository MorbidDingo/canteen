import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Card assignment controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;

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
      .where(and(eq(child.organizationId, organizationId), eq(child.rfidCardId, rfidCardId)))
      .limit(1);

    if (existing.length > 0 && existing[0].id !== childId) {
      return NextResponse.json(
        { error: `This card is already assigned to ${existing[0].name}` },
        { status: 409 }
      );
    }
  }

  const [targetChild] = await db
    .select({ id: child.id })
    .from(child)
    .where(and(eq(child.id, childId), eq(child.organizationId, organizationId)))
    .limit(1);

  if (!targetChild) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  // Update the child's RFID card
  await db
    .update(child)
    .set({
      rfidCardId: rfidCardId || null,
      updatedAt: new Date(),
    })
    .where(and(eq(child.id, childId), eq(child.organizationId, organizationId)));

  logAudit({
    userId: access.actorUserId,
    userRole: access.membershipRole ?? "UNKNOWN",
    action: rfidCardId ? AUDIT_ACTIONS.CARD_ASSIGNED : AUDIT_ACTIONS.CARD_UNLINKED,
    details: { childId, rfidCardId: rfidCardId || null },
    request,
  });

  return NextResponse.json({ success: true });
}
