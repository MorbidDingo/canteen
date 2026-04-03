import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  timetable,
  timetableSlot,
  timetableTeacher,
  timetableSubject,
  timetableClassroom,
  timetableStudentGroup,
  timetableConfig,
  organization,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;
    const { searchParams } = new URL(request.url);
    const timetableId = searchParams.get("timetableId");
    const filterType = searchParams.get("filterType"); // teacher, group, room
    const filterId = searchParams.get("filterId");

    if (!timetableId) {
      return NextResponse.json({ error: "Timetable ID is required" }, { status: 400 });
    }

    // Fetch all data
    const [org, tt, slots, teachers, subjects, classrooms, groups] = await Promise.all([
      db.select().from(organization).where(eq(organization.id, organizationId)).then((r) => r[0]),
      db.query.timetable.findFirst({
        where: and(eq(timetable.id, timetableId), eq(timetable.organizationId, organizationId)),
        with: { config: true },
      }),
      db.select().from(timetableSlot).where(eq(timetableSlot.timetableId, timetableId)),
      db.select().from(timetableTeacher).where(eq(timetableTeacher.organizationId, organizationId)),
      db.select().from(timetableSubject).where(eq(timetableSubject.organizationId, organizationId)),
      db.select().from(timetableClassroom).where(eq(timetableClassroom.organizationId, organizationId)),
      db.select().from(timetableStudentGroup).where(eq(timetableStudentGroup.organizationId, organizationId)),
    ]);

    if (!tt) {
      return NextResponse.json({ error: "Timetable not found" }, { status: 404 });
    }

    const config = tt.config;
    const activeDays = (config?.activeDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) as string[];
    const periodsPerDay = config?.periodsPerDay ?? 8;

    // Apply filter
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

    // Hydrate slots
    const teacherMap = Object.fromEntries(teachers.map((t) => [t.id, t]));
    const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s]));
    const classroomMap = Object.fromEntries(classrooms.map((c) => [c.id, c]));
    const groupMap = Object.fromEntries(groups.map((g) => [g.id, g]));

    const hydratedSlots = filteredSlots.map((slot) => ({
      ...slot,
      teacher: slot.teacherId ? { name: teacherMap[slot.teacherId]?.name, shortCode: teacherMap[slot.teacherId]?.shortCode } : null,
      subject: slot.subjectId ? { name: subjectMap[slot.subjectId]?.name, shortCode: subjectMap[slot.subjectId]?.shortCode, color: subjectMap[slot.subjectId]?.color } : null,
      classroom: slot.classroomId ? { name: classroomMap[slot.classroomId]?.name, shortCode: classroomMap[slot.classroomId]?.shortCode } : null,
      studentGroup: slot.studentGroupId ? { name: groupMap[slot.studentGroupId]?.name, shortCode: groupMap[slot.studentGroupId]?.shortCode } : null,
    }));

    // Build grid structure: days × periods
    const grid: Record<string, Record<number, typeof hydratedSlots>> = {};
    for (const day of activeDays) {
      grid[day] = {};
      for (let p = 1; p <= periodsPerDay; p++) {
        grid[day][p] = hydratedSlots.filter((s) => s.day === day && s.period === p);
      }
    }

    return NextResponse.json({
      organization: { name: org?.name },
      timetable: { id: tt.id, name: tt.name, status: tt.status, score: tt.score },
      config: { activeDays, periodsPerDay, startTime: config?.startTime, periodDurationMinutes: config?.periodDurationMinutes },
      grid,
      slots: hydratedSlots,
      teachers: teachers.map((t) => ({ id: t.id, name: t.name, shortCode: t.shortCode })),
      subjects: subjects.map((s) => ({ id: s.id, name: s.name, shortCode: s.shortCode, color: s.color })),
      classrooms: classrooms.map((c) => ({ id: c.id, name: c.name, shortCode: c.shortCode })),
      groups: groups.map((g) => ({ id: g.id, name: g.name, shortCode: g.shortCode })),
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to export timetable" }, { status: 500 });
  }
}
