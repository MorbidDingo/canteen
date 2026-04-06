import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timetableTeacher } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;

    const teachers = await db
      .select()
      .from(timetableTeacher)
      .where(eq(timetableTeacher.organizationId, organizationId));

    return NextResponse.json({ teachers });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Fetch timetable teachers error:", error);
    return NextResponse.json({ error: "Failed to fetch teachers" }, { status: 500 });
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

    const { name, shortCode, email, phone, department, maxPeriodsPerDay, maxPeriodsPerWeek, consecutivePeriodLimit, preferredSlots, unavailableSlots, userId } = body;

    if (!name?.trim() || !shortCode?.trim()) {
      return NextResponse.json({ error: "Name and short code are required" }, { status: 400 });
    }

    const [teacher] = await db.insert(timetableTeacher).values({
      organizationId,
      name: name.trim(),
      shortCode: shortCode.trim().toUpperCase(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      department: department?.trim() || null,
      maxPeriodsPerDay: maxPeriodsPerDay ?? 6,
      maxPeriodsPerWeek: maxPeriodsPerWeek ?? 30,
      consecutivePeriodLimit: consecutivePeriodLimit ?? 3,
      preferredSlots: preferredSlots ?? [],
      unavailableSlots: unavailableSlots ?? [],
      userId: userId || null,
    }).returning();

    return NextResponse.json({ teacher }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Create timetable teacher error:", error);
    return NextResponse.json({ error: "Failed to create teacher" }, { status: 500 });
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

    if (!id) {
      return NextResponse.json({ error: "Teacher ID is required" }, { status: 400 });
    }

    if (updates.shortCode) updates.shortCode = updates.shortCode.trim().toUpperCase();
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(timetableTeacher)
      .set(updates)
      .where(and(eq(timetableTeacher.id, id), eq(timetableTeacher.organizationId, organizationId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    }

    return NextResponse.json({ teacher: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Update timetable teacher error:", error);
    return NextResponse.json({ error: "Failed to update teacher" }, { status: 500 });
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

    if (!id) {
      return NextResponse.json({ error: "Teacher ID is required" }, { status: 400 });
    }

    await db
      .delete(timetableTeacher)
      .where(and(eq(timetableTeacher.id, id), eq(timetableTeacher.organizationId, organizationId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Delete timetable teacher error:", error);
    return NextResponse.json({ error: "Failed to delete teacher" }, { status: 500 });
  }
}
