import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentGroup } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// PATCH — update group name/description
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
  const { name, description } = body as { name?: string; description?: string | null };

  const [existing] = await db
    .select({ id: contentGroup.id })
    .from(contentGroup)
    .where(and(eq(contentGroup.id, id), eq(contentGroup.organizationId, organizationId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    const [dup] = await db
      .select({ id: contentGroup.id })
      .from(contentGroup)
      .where(
        and(
          eq(contentGroup.organizationId, organizationId),
          eq(contentGroup.name, trimmed),
        ),
      )
      .limit(1);
    if (dup && dup.id !== id) {
      return NextResponse.json({ error: "A group with this name already exists" }, { status: 409 });
    }
    updates.name = trimmed;
  }

  if (description !== undefined) {
    updates.description = description?.trim() || null;
  }

  const [updated] = await db
    .update(contentGroup)
    .set(updates)
    .where(eq(contentGroup.id, id))
    .returning();

  return NextResponse.json({ group: updated });
}

// DELETE — remove group (cascade removes members + audience rows targeting it)
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
    .select({ id: contentGroup.id })
    .from(contentGroup)
    .where(and(eq(contentGroup.id, id), eq(contentGroup.organizationId, organizationId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  await db.delete(contentGroup).where(eq(contentGroup.id, id));

  return NextResponse.json({ success: true });
}
