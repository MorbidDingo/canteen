import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timetableClassroom } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;

    const classrooms = await db
      .select()
      .from(timetableClassroom)
      .where(eq(timetableClassroom.organizationId, organizationId));

    return NextResponse.json({ classrooms });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch classrooms" }, { status: 500 });
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

    const { name, shortCode, capacity, roomType, hasProjector, hasAC, floor, building } = body;

    if (!name?.trim() || !shortCode?.trim()) {
      return NextResponse.json({ error: "Name and short code are required" }, { status: 400 });
    }

    const [classroom] = await db.insert(timetableClassroom).values({
      organizationId,
      name: name.trim(),
      shortCode: shortCode.trim().toUpperCase(),
      capacity: capacity ?? 40,
      roomType: roomType ?? "REGULAR",
      hasProjector: hasProjector ?? false,
      hasAC: hasAC ?? false,
      floor: floor?.trim() || null,
      building: building?.trim() || null,
    }).returning();

    return NextResponse.json({ classroom }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to create classroom" }, { status: 500 });
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

    if (!id) return NextResponse.json({ error: "Classroom ID is required" }, { status: 400 });
    if (updates.shortCode) updates.shortCode = updates.shortCode.trim().toUpperCase();
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(timetableClassroom)
      .set(updates)
      .where(and(eq(timetableClassroom.id, id), eq(timetableClassroom.organizationId, organizationId)))
      .returning();

    if (!updated) return NextResponse.json({ error: "Classroom not found" }, { status: 404 });
    return NextResponse.json({ classroom: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update classroom" }, { status: 500 });
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

    if (!id) return NextResponse.json({ error: "Classroom ID is required" }, { status: 400 });

    await db.delete(timetableClassroom).where(and(eq(timetableClassroom.id, id), eq(timetableClassroom.organizationId, organizationId)));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to delete classroom" }, { status: 500 });
  }
}
