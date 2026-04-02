import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentGroup, contentGroupMember, user } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// GET — list all groups for the org with member counts
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

  const groups = await db
    .select({
      id: contentGroup.id,
      name: contentGroup.name,
      description: contentGroup.description,
      createdBy: contentGroup.createdBy,
      createdByName: user.name,
      createdAt: contentGroup.createdAt,
      memberCount: count(contentGroupMember.id),
    })
    .from(contentGroup)
    .innerJoin(user, eq(contentGroup.createdBy, user.id))
    .leftJoin(contentGroupMember, eq(contentGroupMember.groupId, contentGroup.id))
    .where(eq(contentGroup.organizationId, organizationId))
    .groupBy(contentGroup.id, user.name)
    .orderBy(contentGroup.name);

  return NextResponse.json({ groups });
}

// POST — create a new group
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
  const { name, description } = body as { name?: string; description?: string };

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const trimmedName = name.trim();

  // Check duplicate name
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
