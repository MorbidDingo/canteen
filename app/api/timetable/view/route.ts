import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  timetable,
  timetableSlot,
  timetableTeacher,
  timetableSubject,
  timetableClassroom,
  timetableStudentGroup,
  organization,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

/**
 * Public timetable view API — available to GENERAL (teacher) accounts.
 * Returns the active timetable with optional filtering.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "GENERAL", "PARENT"],
    });
    const organizationId = access.activeOrganizationId!;
    const { searchParams } = new URL(request.url);
    const filterType = searchParams.get("filterType");
    const filterId = searchParams.get("filterId");

    // Find active timetable
    const activeTT = await db.query.timetable.findFirst({
      where: and(
        eq(timetable.organizationId, organizationId),
        eq(timetable.status, "ACTIVE"),
      ),
      with: { config: true },
    });

    if (!activeTT) {
      return NextResponse.json({ error: "No active timetable published yet" }, { status: 404 });
    }

    const [slots, teachers, subjects, classrooms, groups] = await Promise.all([
      db.select().from(timetableSlot).where(eq(timetableSlot.timetableId, activeTT.id)),
      db.select().from(timetableTeacher).where(eq(timetableTeacher.organizationId, organizationId)),
      db.select().from(timetableSubject).where(eq(timetableSubject.organizationId, organizationId)),
      db.select().from(timetableClassroom).where(eq(timetableClassroom.organizationId, organizationId)),
      db.select().from(timetableStudentGroup).where(eq(timetableStudentGroup.organizationId, organizationId)),
    ]);

    // Apply filters
    let filteredSlots = slots;
    if (filterType && filterId) {
      switch (filterType) {
        case "teacher":
          filteredSlots = slots.filter((s) => s.teacherId === filterId);
          break;
        case "group":
          filteredSlots = slots.filter((s) => s.studentGroupId === filterId);
          break;
        case "room":
          filteredSlots = slots.filter((s) => s.classroomId === filterId);
          break;
      }
    }

    // For GENERAL accounts linked to a teacher, auto-filter
    if (access.membershipRole === "GENERAL") {
      const linkedTeacher = teachers.find((t) => t.userId === access.actorUserId);
      if (linkedTeacher && !filterType) {
        filteredSlots = slots.filter((s) => s.teacherId === linkedTeacher.id);
      }
    }

    const teacherMap = Object.fromEntries(teachers.map((t) => [t.id, t]));
    const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s]));
    const classroomMap = Object.fromEntries(classrooms.map((c) => [c.id, c]));
    const groupMap = Object.fromEntries(groups.map((g) => [g.id, g]));

    const hydratedSlots = filteredSlots.map((slot) => ({
      id: slot.id,
      day: slot.day,
      period: slot.period,
      teacher: slot.teacherId ? { name: teacherMap[slot.teacherId]?.name, shortCode: teacherMap[slot.teacherId]?.shortCode } : null,
      subject: slot.subjectId ? { name: subjectMap[slot.subjectId]?.name, shortCode: subjectMap[slot.subjectId]?.shortCode, color: subjectMap[slot.subjectId]?.color } : null,
      classroom: slot.classroomId ? { name: classroomMap[slot.classroomId]?.name, shortCode: classroomMap[slot.classroomId]?.shortCode } : null,
      studentGroup: slot.studentGroupId ? { name: groupMap[slot.studentGroupId]?.name, shortCode: groupMap[slot.studentGroupId]?.shortCode } : null,
    }));

    const config = activeTT.config;
    const activeDays = (config?.activeDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) as string[];
    const periodsPerDay = config?.periodsPerDay ?? 8;

    return NextResponse.json({
      timetable: { name: activeTT.name, publishedAt: activeTT.publishedAt },
      config: { activeDays, periodsPerDay, startTime: config?.startTime, periodDurationMinutes: config?.periodDurationMinutes },
      slots: hydratedSlots,
      filters: {
        teachers: teachers.map((t) => ({ id: t.id, name: t.name, shortCode: t.shortCode })),
        groups: groups.map((g) => ({ id: g.id, name: g.name, shortCode: g.shortCode })),
        classrooms: classrooms.map((c) => ({ id: c.id, name: c.name, shortCode: c.shortCode })),
      },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch timetable" }, { status: 500 });
  }
}
