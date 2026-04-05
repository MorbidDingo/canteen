import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  contentFolder,
  contentFolderAudience,
  contentPost,
  contentPostAttachment,
  user,
} from "@/lib/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
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

// GET — list folders for the org (author's own folders)
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

  const folders = await db
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

  return NextResponse.json({ folders });
}
