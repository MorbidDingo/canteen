import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentGroup, contentGroupMember, user, child, organizationMembership } from "@/lib/db/schema";
import { eq, and, count, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

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

// POST — create a new group, optionally pre-populating from classes or other groups
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
  const { name, description, addFromClasses, addFromGroupIds } = body as {
    name?: string;
    description?: string;
    addFromClasses?: string[];
    addFromGroupIds?: string[];
  };

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

  // Collect user IDs to add as members
  const userIdsToAdd = new Set<string>();

  // Add parents from specific classes
  if (addFromClasses && addFromClasses.length > 0) {
    const classParents = await db
      .select({ parentId: child.parentId })
      .from(child)
      .where(
        and(
          eq(child.organizationId, organizationId),
          inArray(child.className, addFromClasses),
        ),
      );
    for (const classParent of classParents) {
      if (classParent.parentId) userIdsToAdd.add(classParent.parentId);
    }
  }

  // Add members from other groups
  if (addFromGroupIds && addFromGroupIds.length > 0) {
    const groupMembers = await db
      .select({ userId: contentGroupMember.userId })
      .from(contentGroupMember)
      .where(inArray(contentGroupMember.groupId, addFromGroupIds));
    for (const groupMember of groupMembers) {
      userIdsToAdd.add(groupMember.userId);
    }
  }

  // Insert members
  if (userIdsToAdd.size > 0) {
    const memberValues = Array.from(userIdsToAdd).map((userId) => ({
      groupId: created.id,
      userId,
    }));
    // Insert in batches to avoid parameter limits
    const batchSize = 100;
    for (let i = 0; i < memberValues.length; i += batchSize) {
      const batch = memberValues.slice(i, i + batchSize);
      await db.insert(contentGroupMember).values(batch).onConflictDoNothing();
    }
  }

  logAudit({
    organizationId,
    userId: access.actorUserId,
    userRole: access.membershipRole ?? "MANAGEMENT",
    action: AUDIT_ACTIONS.CONTENT_GROUP_CREATED,
    details: { groupId: created.id, name: created.name, membersAdded: userIdsToAdd.size },
    request,
  });

  return NextResponse.json({ group: created, membersAdded: userIdsToAdd.size }, { status: 201 });
}
