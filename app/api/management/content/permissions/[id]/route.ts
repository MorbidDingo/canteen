import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentPermission } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// PATCH — update permission scope
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    throw error;
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Not available on terminal devices", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;
  const { id } = await params;
  const body = await request.json();
  const { scope } = body as { scope?: string };

  if (!scope || !["ASSIGNMENT", "NOTE", "BOTH"].includes(scope)) {
    return NextResponse.json({ error: "scope must be ASSIGNMENT, NOTE, or BOTH" }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: contentPermission.id })
    .from(contentPermission)
    .where(
      and(
        eq(contentPermission.id, id),
        eq(contentPermission.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Permission not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(contentPermission)
    .set({ scope: scope as "ASSIGNMENT" | "NOTE" | "BOTH", updatedAt: new Date() })
    .where(eq(contentPermission.id, id))
    .returning();

  logAudit({
    organizationId,
    userId: access.actorUserId,
    userRole: access.membershipRole ?? "MANAGEMENT",
    action: AUDIT_ACTIONS.CONTENT_PERMISSION_UPDATED,
    details: { permissionId: id, scope },
    request,
  });

  return NextResponse.json({ permission: updated });
}

// DELETE — revoke permission
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    throw error;
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Not available on terminal devices", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;
  const { id } = await params;

  const [existing] = await db
    .select({ id: contentPermission.id })
    .from(contentPermission)
    .where(
      and(
        eq(contentPermission.id, id),
        eq(contentPermission.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Permission not found" }, { status: 404 });
  }

  await db.delete(contentPermission).where(eq(contentPermission.id, id));

  logAudit({
    organizationId,
    userId: access.actorUserId,
    userRole: access.membershipRole ?? "MANAGEMENT",
    action: AUDIT_ACTIONS.CONTENT_PERMISSION_REVOKED,
    details: { permissionId: id },
    request,
  });

  return NextResponse.json({ success: true });
}
