import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentGroup, contentGroupMember, organizationMembership, user } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// GET — list members of a group
export async function GET(
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

  // Verify group belongs to org
  const [group] = await db
    .select({ id: contentGroup.id })
    .from(contentGroup)
    .where(and(eq(contentGroup.id, id), eq(contentGroup.organizationId, organizationId)))
    .limit(1);

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const members = await db
    .select({
      id: contentGroupMember.id,
      userId: contentGroupMember.userId,
      userName: user.name,
      userEmail: user.email,
      createdAt: contentGroupMember.createdAt,
    })
    .from(contentGroupMember)
    .innerJoin(user, eq(contentGroupMember.userId, user.id))
    .where(eq(contentGroupMember.groupId, id))
    .orderBy(user.name);

  return NextResponse.json({ members });
}

// POST — add members to a group
export async function POST(
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
  const { userIds } = body as { userIds?: string[] };

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: "userIds array is required" }, { status: 400 });
  }

  // Verify group belongs to org
  const [group] = await db
    .select({ id: contentGroup.id })
    .from(contentGroup)
    .where(and(eq(contentGroup.id, id), eq(contentGroup.organizationId, organizationId)))
    .limit(1);

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Verify all users are active org members
  const activeMembers = await db
    .select({ userId: organizationMembership.userId })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.status, "ACTIVE"),
        inArray(organizationMembership.userId, userIds),
      ),
    );

  const activeMemberIds = new Set(activeMembers.map((m) => m.userId));

  // Filter out existing members
  const existingMembers = await db
    .select({ userId: contentGroupMember.userId })
    .from(contentGroupMember)
    .where(
      and(
        eq(contentGroupMember.groupId, id),
        inArray(contentGroupMember.userId, userIds),
      ),
    );

  const existingMemberIds = new Set(existingMembers.map((m) => m.userId));

  const toAdd = userIds.filter(
    (uid) => activeMemberIds.has(uid) && !existingMemberIds.has(uid),
  );

  if (toAdd.length > 0) {
    await db.insert(contentGroupMember).values(
      toAdd.map((userId) => ({ groupId: id, userId })),
    );
  }

  return NextResponse.json({
    added: toAdd.length,
    skipped: userIds.length - toAdd.length,
  }, { status: 201 });
}

// DELETE — remove a member from the group
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
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId query param is required" }, { status: 400 });
  }

  // Verify group belongs to org
  const [group] = await db
    .select({ id: contentGroup.id })
    .from(contentGroup)
    .where(and(eq(contentGroup.id, id), eq(contentGroup.organizationId, organizationId)))
    .limit(1);

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  await db
    .delete(contentGroupMember)
    .where(
      and(
        eq(contentGroupMember.groupId, id),
        eq(contentGroupMember.userId, userId),
      ),
    );

  return NextResponse.json({ success: true });
}
