import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentTag, user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getContentPermission } from "@/lib/content-permission";

// GET — list tags for the org (accessible to any permitted user)
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

  const tags = await db
    .select({
      id: contentTag.id,
      name: contentTag.name,
      color: contentTag.color,
      createdAt: contentTag.createdAt,
    })
    .from(contentTag)
    .where(eq(contentTag.organizationId, organizationId))
    .orderBy(contentTag.name);

  return NextResponse.json({ tags });
}

// POST — create a tag (permitted users only)
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
  const { name, color } = body as { name?: string; color?: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const trimmedName = name.trim();

  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json({ error: "color must be a valid hex color" }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: contentTag.id })
    .from(contentTag)
    .where(
      and(
        eq(contentTag.organizationId, organizationId),
        eq(contentTag.name, trimmedName),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "A tag with this name already exists" }, { status: 409 });
  }

  const [created] = await db
    .insert(contentTag)
    .values({
      organizationId,
      name: trimmedName,
      color: color || null,
      createdBy: access.actorUserId,
    })
    .returning();

  return NextResponse.json({ tag: created }, { status: 201 });
}
