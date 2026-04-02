import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentPermission, organizationMembership, user } from "@/lib/db/schema";
import { eq, and, ilike, or } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// GET — list all content permissions for the org
export async function GET(request: NextRequest) {
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

  const permissions = await db
    .select({
      id: contentPermission.id,
      userId: contentPermission.userId,
      scope: contentPermission.scope,
      grantedBy: contentPermission.grantedBy,
      grantedAt: contentPermission.grantedAt,
      userName: user.name,
      userEmail: user.email,
    })
    .from(contentPermission)
    .innerJoin(user, eq(contentPermission.userId, user.id))
    .where(eq(contentPermission.organizationId, organizationId))
    .orderBy(contentPermission.grantedAt);

  return NextResponse.json({ permissions });
}

// POST — grant content permission to a user
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
    throw error;
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Not available on terminal devices", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;
  const body = await request.json();
  const { userId, scope } = body as { userId?: string; scope?: string };

  if (!userId || !scope) {
    return NextResponse.json({ error: "userId and scope are required" }, { status: 400 });
  }

  if (!["ASSIGNMENT", "NOTE", "BOTH"].includes(scope)) {
    return NextResponse.json({ error: "scope must be ASSIGNMENT, NOTE, or BOTH" }, { status: 400 });
  }

  // Verify user is an active member of the org
  const [membership] = await db
    .select({ id: organizationMembership.id })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.userId, userId),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "User is not an active member of this organization" }, { status: 404 });
  }

  // Check for existing permission
  const [existing] = await db
    .select({ id: contentPermission.id })
    .from(contentPermission)
    .where(
      and(
        eq(contentPermission.organizationId, organizationId),
        eq(contentPermission.userId, userId),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "User already has a content permission" }, { status: 409 });
  }

  const [created] = await db
    .insert(contentPermission)
    .values({
      organizationId,
      userId,
      scope: scope as "ASSIGNMENT" | "NOTE" | "BOTH",
      grantedBy: access.actorUserId,
    })
    .returning();

  logAudit({
    organizationId,
    userId: access.actorUserId,
    userRole: access.membershipRole ?? "MANAGEMENT",
    action: AUDIT_ACTIONS.CONTENT_PERMISSION_GRANTED,
    details: { permissionId: created.id, grantedTo: created.userId, scope: created.scope },
    request,
  });

  return NextResponse.json({ permission: created }, { status: 201 });
}
