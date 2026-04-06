import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentGroup, contentGroupMember, user } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getContentPermission } from "@/lib/content-permission";

// GET — list groups for the org (accessible to any permitted user)
export async function GET(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "OPERATOR", "LIB_OPERATOR", "ATTENDANCE", "PARENT", "GENERAL"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const organizationId = access.activeOrganizationId!;

  const groups = await db
    .select({
      id: contentGroup.id,
      name: contentGroup.name,
      description: contentGroup.description,
      memberCount: count(contentGroupMember.id),
    })
    .from(contentGroup)
    .leftJoin(contentGroupMember, eq(contentGroupMember.groupId, contentGroup.id))
    .where(eq(contentGroup.organizationId, organizationId))
    .groupBy(contentGroup.id)
    .orderBy(contentGroup.name);

  return NextResponse.json({ groups });
}

// POST — create a group (permitted users only)
export async function POST(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "OPERATOR", "LIB_OPERATOR", "ATTENDANCE", "PARENT", "GENERAL"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const organizationId = access.activeOrganizationId!;

  const perm = await getContentPermission(organizationId, access.actorUserId);
  if (!perm) {
    return NextResponse.json({ error: "No content permission" }, { status: 403 });
  }

  const body = await request.json();
  const { name, description } = body as { name?: string; description?: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const trimmedName = name.trim();

  const [existing] = await db
    .select({ id: contentGroup.id })
    .from(contentGroup)
    .where(
      and(
        eq(contentGroup.organizationId, organizationId),
        eq(contentGroup.name, trimmedName),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "A group with this name already exists" }, { status: 409 });
  }

  const [created] = await db
    .insert(contentGroup)
    .values({
      organizationId,
      name: trimmedName,
      description: description?.trim() || null,
      createdBy: access.actorUserId,
    })
    .returning();

  return NextResponse.json({ group: created }, { status: 201 });
}
