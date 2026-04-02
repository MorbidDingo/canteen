import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentTag, user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// GET — list all tags for the org
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

  const tags = await db
    .select({
      id: contentTag.id,
      name: contentTag.name,
      color: contentTag.color,
      createdBy: contentTag.createdBy,
      createdByName: user.name,
      createdAt: contentTag.createdAt,
    })
    .from(contentTag)
    .innerJoin(user, eq(contentTag.createdBy, user.id))
    .where(eq(contentTag.organizationId, organizationId))
    .orderBy(contentTag.name);

  return NextResponse.json({ tags });
}

// POST — create a new tag
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
  const { name, color } = body as { name?: string; color?: string };

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const trimmedName = name.trim();

  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json({ error: "color must be a valid hex color (e.g. #FF5733)" }, { status: 400 });
  }

  // Check duplicate name
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
