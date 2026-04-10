import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contentFolder,
  contentFolderAudience,
  contentPost,
  contentPostAttachment,
  contentGroupMember,
  organizationMembership,
  child,
  user,
} from "@/lib/db/schema";
import { eq, and, count, sql, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getContentPermission } from "@/lib/content-permission";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// POST — create a new folder
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

  // Check permission
  const perm = await getContentPermission(organizationId, access.actorUserId);
  if (!perm) {
    return NextResponse.json({ error: "You do not have permission to create folders" }, { status: 403 });
  }

  const body = await request.json();
  const { name, description, audience } = body as {
    name?: string;
    description?: string;
    audience?: Array<{
      audienceType: string;
      className?: string;
      section?: string;
      userId?: string;
      groupId?: string;
    }>;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Folder name is required" }, { status: 400 });
  }

  if (!audience || audience.length === 0) {
    return NextResponse.json({ error: "At least one audience target is required" }, { status: 400 });
  }

  // Validate audience rows
  const validAudienceTypes = ["ALL_ORG", "CLASS", "SECTION", "USER", "GROUP"];
  for (const a of audience) {
    if (!validAudienceTypes.includes(a.audienceType)) {
      return NextResponse.json({ error: `Invalid audienceType: ${a.audienceType}` }, { status: 400 });
    }
  }

  const result = await db.transaction(async (tx) => {
    const [folder] = await tx
      .insert(contentFolder)
      .values({
        organizationId,
        authorUserId: access.actorUserId,
        name: name.trim(),
        description: description?.trim() || null,
      })
      .returning();

    // Insert audience rows
    await tx.insert(contentFolderAudience).values(
      audience.map((a) => ({
        folderId: folder.id,
        audienceType: a.audienceType as "ALL_ORG" | "CLASS" | "SECTION" | "USER" | "GROUP",
        className: a.className || null,
        section: a.section || null,
        userId: a.userId || null,
        groupId: a.groupId || null,
      })),
    );

    return folder;
  });

  return NextResponse.json({ folder: result }, { status: 201 });
}

// GET — list folders for the org (audience-filtered)
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
  const userId = access.actorUserId;

  /** Roles that can see all org folders regardless of audience */
  const MANAGEMENT_ROLES = new Set(["OWNER", "ADMIN", "MANAGEMENT", "OPERATOR"]);

  // Check user role
  const userMemberships = await db
    .select({ role: organizationMembership.role })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.userId, userId),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    );
  const isManagementRole = userMemberships.some((m) => MANAGEMENT_ROLES.has(m.role));

  // All folders in this org
  const allFolders = await db
    .select({
      id: contentFolder.id,
      name: contentFolder.name,
      description: contentFolder.description,
      authorUserId: contentFolder.authorUserId,
      authorName: user.name,
      createdAt: contentFolder.createdAt,
      updatedAt: contentFolder.updatedAt,
      postCount: count(contentPost.id),
    })
    .from(contentFolder)
    .innerJoin(user, eq(contentFolder.authorUserId, user.id))
    .leftJoin(contentPost, eq(contentPost.folderId, contentFolder.id))
    .where(eq(contentFolder.organizationId, organizationId))
    .groupBy(contentFolder.id, user.name)
    .orderBy(sql`${contentFolder.updatedAt} DESC`);

  // Management roles and folder authors see all folders
  if (isManagementRole) {
    return NextResponse.json({ folders: allFolders });
  }

  // For regular users, filter by audience
  // Resolve caller's children → (className, section) pairs
  const children = await db
    .select({ className: child.className, section: child.section })
    .from(child)
    .where(
      and(
        eq(child.parentId, userId),
        eq(child.organizationId, organizationId),
      ),
    );

  // Resolve caller's group memberships
  const groupMemberships = await db
    .select({ groupId: contentGroupMember.groupId })
    .from(contentGroupMember)
    .where(eq(contentGroupMember.userId, userId));
  const groupIds = groupMemberships.map((g) => g.groupId);

  // Get all folder audiences in one query
  const folderIds = allFolders.map((f) => f.id);
  let folderAudiences: Array<{
    folderId: string;
    audienceType: string;
    className: string | null;
    section: string | null;
    userId: string | null;
    groupId: string | null;
  }> = [];

  if (folderIds.length > 0) {
    folderAudiences = await db
      .select({
        folderId: contentFolderAudience.folderId,
        audienceType: contentFolderAudience.audienceType,
        className: contentFolderAudience.className,
        section: contentFolderAudience.section,
        userId: contentFolderAudience.userId,
        groupId: contentFolderAudience.groupId,
      })
      .from(contentFolderAudience)
      .where(inArray(contentFolderAudience.folderId, folderIds));
  }

  // Group audiences by folderId
  const audiencesByFolder = new Map<string, typeof folderAudiences>();
  for (const a of folderAudiences) {
    const arr = audiencesByFolder.get(a.folderId) || [];
    arr.push(a);
    audiencesByFolder.set(a.folderId, arr);
  }

  // Filter: user can see folders they authored OR that match their audience
  const filteredFolders = allFolders.filter((folder) => {
    // Authors always see their own folders
    if (folder.authorUserId === userId) return true;

    const audiences = audiencesByFolder.get(folder.id) || [];
    if (audiences.length === 0) return false;

    for (const a of audiences) {
      if (a.audienceType === "ALL_ORG") return true;
      if (a.audienceType === "USER" && a.userId === userId) return true;
      if (a.audienceType === "CLASS") {
        if (children.some((c) => c.className === a.className)) return true;
      }
      if (a.audienceType === "SECTION") {
        if (children.some((c) => c.className === a.className && c.section === a.section)) return true;
      }
      if (a.audienceType === "GROUP" && a.groupId) {
        if (groupIds.includes(a.groupId)) return true;
      }
    }
    return false;
  });

  return NextResponse.json({ folders: filteredFolders });
}
