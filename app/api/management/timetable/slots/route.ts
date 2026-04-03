import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timetableSlot, timetableTeacher, timetableSubject, timetableClassroom, timetableStudentGroup } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { recordChange } from "@/lib/ml/timetable-preference-learner";

export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;
    const { searchParams } = new URL(request.url);
    const timetableId = searchParams.get("timetableId");

    if (!timetableId) {
      return NextResponse.json({ error: "Timetable ID is required" }, { status: 400 });
    }

    const slots = await db
      .select()
      .from(timetableSlot)
      .where(eq(timetableSlot.timetableId, timetableId));

    // Hydrate with names for display
    const [teachers, subjects, classrooms, groups] = await Promise.all([
      db.select().from(timetableTeacher).where(eq(timetableTeacher.organizationId, organizationId)),
      db.select().from(timetableSubject).where(eq(timetableSubject.organizationId, organizationId)),
      db.select().from(timetableClassroom).where(eq(timetableClassroom.organizationId, organizationId)),
      db.select().from(timetableStudentGroup).where(eq(timetableStudentGroup.organizationId, organizationId)),
    ]);

    const teacherMap = Object.fromEntries(teachers.map((t) => [t.id, { name: t.name, shortCode: t.shortCode }]));
    const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, { name: s.name, shortCode: s.shortCode, color: s.color }]));
    const classroomMap = Object.fromEntries(classrooms.map((c) => [c.id, { name: c.name, shortCode: c.shortCode }]));
    const groupMap = Object.fromEntries(groups.map((g) => [g.id, { name: g.name, shortCode: g.shortCode }]));

    const hydratedSlots = slots.map((slot) => ({
      ...slot,
      teacherName: slot.teacherId ? teacherMap[slot.teacherId]?.name : null,
      teacherCode: slot.teacherId ? teacherMap[slot.teacherId]?.shortCode : null,
      subjectName: slot.subjectId ? subjectMap[slot.subjectId]?.name : null,
      subjectCode: slot.subjectId ? subjectMap[slot.subjectId]?.shortCode : null,
      subjectColor: slot.subjectId ? subjectMap[slot.subjectId]?.color : null,
      classroomName: slot.classroomId ? classroomMap[slot.classroomId]?.name : null,
      classroomCode: slot.classroomId ? classroomMap[slot.classroomId]?.shortCode : null,
      groupName: slot.studentGroupId ? groupMap[slot.studentGroupId]?.name : null,
      groupCode: slot.studentGroupId ? groupMap[slot.studentGroupId]?.shortCode : null,
    }));

    return NextResponse.json({ slots: hydratedSlots });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch slots" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const body = await request.json();
    const { id, day, period, teacherId, subjectId, classroomId, studentGroupId, isLocked } = body;

    if (!id) return NextResponse.json({ error: "Slot ID is required" }, { status: 400 });

    // Get previous state for change log
    const [prev] = await db.select().from(timetableSlot).where(eq(timetableSlot.id, id)).limit(1);
    if (!prev) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

    const updates: Record<string, unknown> = { isManualOverride: true, updatedAt: new Date() };
    if (day !== undefined) updates.day = day;
    if (period !== undefined) updates.period = period;
    if (teacherId !== undefined) updates.teacherId = teacherId;
    if (subjectId !== undefined) updates.subjectId = subjectId;
    if (classroomId !== undefined) updates.classroomId = classroomId;
    if (studentGroupId !== undefined) updates.studentGroupId = studentGroupId;
    if (isLocked !== undefined) updates.isLocked = isLocked;

    const [updated] = await db
      .update(timetableSlot)
      .set(updates)
      .where(eq(timetableSlot.id, id))
      .returning();

    // Log change
    await recordChange(
      prev.timetableId,
      access.actorUserId,
      "SLOT_MOVE",
      `Manual edit: slot moved/updated`,
      { day: prev.day, period: prev.period, teacherId: prev.teacherId, subjectId: prev.subjectId },
      { day: updated.day, period: updated.period, teacherId: updated.teacherId, subjectId: updated.subjectId },
    );

    return NextResponse.json({ slot: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update slot" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Slot ID is required" }, { status: 400 });

    const [prev] = await db.select().from(timetableSlot).where(eq(timetableSlot.id, id)).limit(1);
    if (!prev) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

    await db.delete(timetableSlot).where(eq(timetableSlot.id, id));

    await recordChange(
      prev.timetableId,
      access.actorUserId,
      "SLOT_CLEAR",
      `Cleared slot at ${prev.day} period ${prev.period}`,
      { day: prev.day, period: prev.period, teacherId: prev.teacherId, subjectId: prev.subjectId },
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to delete slot" }, { status: 500 });
  }
}
