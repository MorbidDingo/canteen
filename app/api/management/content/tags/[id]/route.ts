import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentTag } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// PATCH — update tag name/color
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
  const { name, color } = body as { name?: string; color?: string | null };

  const [existing] = await db
    .select({ id: contentTag.id })
    .from(contentTag)
    .where(and(eq(contentTag.id, id), eq(contentTag.organizationId, organizationId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    // Check duplicate
    const [dup] = await db
      .select({ id: contentTag.id })
      .from(contentTag)
      .where(
        and(
          eq(contentTag.organizationId, organizationId),
          eq(contentTag.name, trimmed),
        ),
      )
      .limit(1);
    if (dup && dup.id !== id) {
      return NextResponse.json({ error: "A tag with this name already exists" }, { status: 409 });
    }
    updates.name = trimmed;
  }

  if (color !== undefined) {
    if (color !== null && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json({ error: "color must be a valid hex color or null" }, { status: 400 });
    }
    updates.color = color;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(contentTag)
    .set(updates)
    .where(eq(contentTag.id, id))
    .returning();

  return NextResponse.json({ tag: updated });
}

// DELETE — remove tag (cascade removes post-tag links)
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
    .select({ id: contentTag.id })
    .from(contentTag)
    .where(and(eq(contentTag.id, id), eq(contentTag.organizationId, organizationId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Tag not found" }, { status: 404 });
  }

  await db.delete(contentTag).where(eq(contentTag.id, id));

  return NextResponse.json({ success: true });
}
