import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timetableStudentGroup } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;

    const groups = await db
      .select()
      .from(timetableStudentGroup)
      .where(eq(timetableStudentGroup.organizationId, organizationId));

    return NextResponse.json({ groups });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch student groups" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;
    const body = await request.json();

    const { name, shortCode, grade, section, strength, homeRoomId } = body;

    if (!name?.trim() || !shortCode?.trim()) {
      return NextResponse.json({ error: "Name and short code are required" }, { status: 400 });
    }

    const [group] = await db.insert(timetableStudentGroup).values({
      organizationId,
      name: name.trim(),
      shortCode: shortCode.trim().toUpperCase(),
      grade: grade?.trim() || null,
      section: section?.trim() || null,
      strength: strength ?? 30,
      homeRoomId: homeRoomId || null,
    }).returning();

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to create student group" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    if (updates.shortCode) updates.shortCode = updates.shortCode.trim().toUpperCase();
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(timetableStudentGroup)
      .set(updates)
      .where(and(eq(timetableStudentGroup.id, id), eq(timetableStudentGroup.organizationId, organizationId)))
      .returning();

    if (!updated) return NextResponse.json({ error: "Student group not found" }, { status: 404 });
    return NextResponse.json({ group: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update student group" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Group ID is required" }, { status: 400 });

    await db.delete(timetableStudentGroup).where(and(eq(timetableStudentGroup.id, id), eq(timetableStudentGroup.organizationId, organizationId)));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to delete student group" }, { status: 500 });
  }
}
