/**
 * Timetable AI Tool Definitions
 *
 * Tools exposed to the LLM for natural language timetable management.
 * Each tool maps to a database operation or scheduling function.
 */

import { db } from "@/lib/db";
import {
  timetableSlot,
  timetableTeacher,
  timetableSubject,
  timetableClassroom,
  timetableStudentGroup,
  timetable,
  timetableConfig,
} from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { validateTimetable } from "@/lib/ml/timetable-scheduler";
import { predictTeacherFatigue, getOptimizationSuggestions } from "@/lib/ml/timetable-optimizer";
import { recordChange } from "@/lib/ml/timetable-preference-learner";

// ─── Tool Definitions (for Claude/GPT function calling) ──

export const TIMETABLE_TOOL_DEFINITIONS = [
  {
    name: "get_teacher_schedule",
    description: "Get the full weekly schedule for a specific teacher",
    parameters: {
      type: "object" as const,
      properties: {
        teacherName: { type: "string", description: "Teacher name or short code" },
      },
      required: ["teacherName"],
    },
  },
  {
    name: "get_group_schedule",
    description: "Get the full weekly schedule for a student group/class",
    parameters: {
      type: "object" as const,
      properties: {
        groupName: { type: "string", description: "Student group name or short code" },
      },
      required: ["groupName"],
    },
  },
  {
    name: "get_room_schedule",
    description: "Get the full weekly schedule for a classroom",
    parameters: {
      type: "object" as const,
      properties: {
        roomName: { type: "string", description: "Classroom name or short code" },
      },
      required: ["roomName"],
    },
  },
  {
    name: "move_class",
    description: "Move a class from one slot to another. Use this when the admin wants to move a specific class to a different day/period.",
    parameters: {
      type: "object" as const,
      properties: {
        subjectName: { type: "string", description: "Subject name" },
        groupName: { type: "string", description: "Student group name" },
        fromDay: { type: "string", description: "Current day (Mon, Tue, etc.)" },
        fromPeriod: { type: "number", description: "Current period number" },
        toDay: { type: "string", description: "Target day" },
        toPeriod: { type: "number", description: "Target period number" },
      },
      required: ["subjectName", "groupName", "fromDay", "fromPeriod", "toDay", "toPeriod"],
    },
  },
  {
    name: "move_subject_to_time",
    description: "Move all instances of a subject to morning or afternoon slots. Use for commands like 'Move Math to mornings'.",
    parameters: {
      type: "object" as const,
      properties: {
        subjectName: { type: "string", description: "Subject name" },
        timePreference: { type: "string", enum: ["morning", "afternoon"], description: "Preferred time of day" },
        groupName: { type: "string", description: "Optional: specific group. If not provided, applies to all groups." },
      },
      required: ["subjectName", "timePreference"],
    },
  },
  {
    name: "free_teacher_day",
    description: "Remove all classes for a teacher on a specific day. Use for commands like 'Free up Mr. Sharma on Fridays'.",
    parameters: {
      type: "object" as const,
      properties: {
        teacherName: { type: "string", description: "Teacher name" },
        day: { type: "string", description: "Day to free up (Mon, Tue, etc.)" },
      },
      required: ["teacherName", "day"],
    },
  },
  {
    name: "swap_slots",
    description: "Swap two slots in the timetable",
    parameters: {
      type: "object" as const,
      properties: {
        slot1Day: { type: "string" },
        slot1Period: { type: "number" },
        slot1Group: { type: "string" },
        slot2Day: { type: "string" },
        slot2Period: { type: "number" },
        slot2Group: { type: "string" },
      },
      required: ["slot1Day", "slot1Period", "slot1Group", "slot2Day", "slot2Period", "slot2Group"],
    },
  },
  {
    name: "check_conflicts",
    description: "Check the current timetable for conflicts and return details",
    parameters: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_optimization_suggestions",
    description: "Get AI-powered suggestions for improving the timetable",
    parameters: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_teacher_fatigue_report",
    description: "Get fatigue predictions for teachers based on current schedule",
    parameters: {
      type: "object" as const,
      properties: {},
    },
  },
];

// ─── Tool Executor ───────────────────────────────────────

type ToolContext = {
  timetableId: string;
  organizationId: string;
  userId: string;
};

export async function executeTimetableTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (toolName) {
    case "get_teacher_schedule":
      return getTeacherSchedule(ctx, input.teacherName as string);
    case "get_group_schedule":
      return getGroupSchedule(ctx, input.groupName as string);
    case "get_room_schedule":
      return getRoomSchedule(ctx, input.roomName as string);
    case "move_class":
      return moveClass(ctx, input as {
        subjectName: string;
        groupName: string;
        fromDay: string;
        fromPeriod: number;
        toDay: string;
        toPeriod: number;
      });
    case "move_subject_to_time":
      return moveSubjectToTime(ctx, input as {
        subjectName: string;
        timePreference: "morning" | "afternoon";
        groupName?: string;
      });
    case "free_teacher_day":
      return freeTeacherDay(ctx, input as { teacherName: string; day: string });
    case "swap_slots":
      return swapSlots(ctx, input as {
        slot1Day: string;
        slot1Period: number;
        slot1Group: string;
        slot2Day: string;
        slot2Period: number;
        slot2Group: string;
      });
    case "check_conflicts":
      return checkConflicts(ctx);
    case "get_optimization_suggestions":
      return getOptimizations(ctx);
    case "get_teacher_fatigue_report":
      return getTeacherFatigueReport(ctx);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Tool Implementations ────────────────────────────────

async function findTeacher(orgId: string, nameOrCode: string) {
  const teachers = await db
    .select()
    .from(timetableTeacher)
    .where(eq(timetableTeacher.organizationId, orgId));

  const lower = nameOrCode.toLowerCase();
  return teachers.find(
    (t) =>
      t.name.toLowerCase().includes(lower) ||
      t.shortCode.toLowerCase() === lower,
  );
}

async function findSubject(orgId: string, nameOrCode: string) {
  const subjects = await db
    .select()
    .from(timetableSubject)
    .where(eq(timetableSubject.organizationId, orgId));

  const lower = nameOrCode.toLowerCase();
  return subjects.find(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      s.shortCode.toLowerCase() === lower,
  );
}

async function findGroup(orgId: string, nameOrCode: string) {
  const groups = await db
    .select()
    .from(timetableStudentGroup)
    .where(eq(timetableStudentGroup.organizationId, orgId));

  const lower = nameOrCode.toLowerCase();
  return groups.find(
    (g) =>
      g.name.toLowerCase().includes(lower) ||
      g.shortCode.toLowerCase() === lower,
  );
}

async function findRoom(orgId: string, nameOrCode: string) {
  const rooms = await db
    .select()
    .from(timetableClassroom)
    .where(eq(timetableClassroom.organizationId, orgId));

  const lower = nameOrCode.toLowerCase();
  return rooms.find(
    (r) =>
      r.name.toLowerCase().includes(lower) ||
      r.shortCode.toLowerCase() === lower,
  );
}

async function getTeacherSchedule(ctx: ToolContext, teacherName: string) {
  const teacher = await findTeacher(ctx.organizationId, teacherName);
  if (!teacher) return { error: `Teacher "${teacherName}" not found` };

  const slots = await db
    .select()
    .from(timetableSlot)
    .where(
      and(
        eq(timetableSlot.timetableId, ctx.timetableId),
        eq(timetableSlot.teacherId, teacher.id),
      ),
    );

  const [subjects, groups, rooms] = await Promise.all([
    db.select().from(timetableSubject).where(eq(timetableSubject.organizationId, ctx.organizationId)),
    db.select().from(timetableStudentGroup).where(eq(timetableStudentGroup.organizationId, ctx.organizationId)),
    db.select().from(timetableClassroom).where(eq(timetableClassroom.organizationId, ctx.organizationId)),
  ]);

  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
  const groupMap = new Map(groups.map((g) => [g.id, g.name]));
  const roomMap = new Map(rooms.map((r) => [r.id, r.name]));

  return {
    teacher: teacher.name,
    totalPeriods: slots.length,
    schedule: slots
      .sort((a, b) => {
        const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const dayDiff = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
        return dayDiff !== 0 ? dayDiff : a.period - b.period;
      })
      .map((s) => ({
        day: s.day,
        period: s.period,
        subject: s.subjectId ? subjectMap.get(s.subjectId) : "—",
        group: s.studentGroupId ? groupMap.get(s.studentGroupId) : "—",
        room: s.classroomId ? roomMap.get(s.classroomId) : "—",
      })),
  };
}

async function getGroupSchedule(ctx: ToolContext, groupName: string) {
  const group = await findGroup(ctx.organizationId, groupName);
  if (!group) return { error: `Student group "${groupName}" not found` };

  const slots = await db
    .select()
    .from(timetableSlot)
    .where(
      and(
        eq(timetableSlot.timetableId, ctx.timetableId),
        eq(timetableSlot.studentGroupId, group.id),
      ),
    );

  const [subjects, teachers, rooms] = await Promise.all([
    db.select().from(timetableSubject).where(eq(timetableSubject.organizationId, ctx.organizationId)),
    db.select().from(timetableTeacher).where(eq(timetableTeacher.organizationId, ctx.organizationId)),
    db.select().from(timetableClassroom).where(eq(timetableClassroom.organizationId, ctx.organizationId)),
  ]);

  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
  const teacherMap = new Map(teachers.map((t) => [t.id, t.name]));
  const roomMap = new Map(rooms.map((r) => [r.id, r.name]));

  return {
    group: group.name,
    totalPeriods: slots.length,
    schedule: slots
      .sort((a, b) => {
        const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) || a.period - b.period;
      })
      .map((s) => ({
        day: s.day,
        period: s.period,
        subject: s.subjectId ? subjectMap.get(s.subjectId) : "—",
        teacher: s.teacherId ? teacherMap.get(s.teacherId) : "—",
        room: s.classroomId ? roomMap.get(s.classroomId) : "—",
      })),
  };
}

async function getRoomSchedule(ctx: ToolContext, roomName: string) {
  const room = await findRoom(ctx.organizationId, roomName);
  if (!room) return { error: `Room "${roomName}" not found` };

  const slots = await db
    .select()
    .from(timetableSlot)
    .where(
      and(
        eq(timetableSlot.timetableId, ctx.timetableId),
        eq(timetableSlot.classroomId, room.id),
      ),
    );

  const [subjects, teachers, groups] = await Promise.all([
    db.select().from(timetableSubject).where(eq(timetableSubject.organizationId, ctx.organizationId)),
    db.select().from(timetableTeacher).where(eq(timetableTeacher.organizationId, ctx.organizationId)),
    db.select().from(timetableStudentGroup).where(eq(timetableStudentGroup.organizationId, ctx.organizationId)),
  ]);

  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
  const teacherMap = new Map(teachers.map((t) => [t.id, t.name]));
  const groupMap = new Map(groups.map((g) => [g.id, g.name]));

  return {
    room: room.name,
    capacity: room.capacity,
    roomType: room.roomType,
    totalPeriods: slots.length,
    schedule: slots
      .sort((a, b) => {
        const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) || a.period - b.period;
      })
      .map((s) => ({
        day: s.day,
        period: s.period,
        subject: s.subjectId ? subjectMap.get(s.subjectId) : "—",
        teacher: s.teacherId ? teacherMap.get(s.teacherId) : "—",
        group: s.studentGroupId ? groupMap.get(s.studentGroupId) : "—",
      })),
  };
}

async function moveClass(
  ctx: ToolContext,
  input: { subjectName: string; groupName: string; fromDay: string; fromPeriod: number; toDay: string; toPeriod: number },
) {
  const subject = await findSubject(ctx.organizationId, input.subjectName);
  if (!subject) return { error: `Subject "${input.subjectName}" not found` };

  const group = await findGroup(ctx.organizationId, input.groupName);
  if (!group) return { error: `Group "${input.groupName}" not found` };

  // Find the source slot
  const [sourceSlot] = await db
    .select()
    .from(timetableSlot)
    .where(
      and(
        eq(timetableSlot.timetableId, ctx.timetableId),
        eq(timetableSlot.day, input.fromDay),
        eq(timetableSlot.period, input.fromPeriod),
        eq(timetableSlot.studentGroupId, group.id),
        eq(timetableSlot.subjectId, subject.id),
      ),
    )
    .limit(1);

  if (!sourceSlot) {
    return { error: `No ${subject.name} class found for ${group.name} at ${input.fromDay} period ${input.fromPeriod}` };
  }

  // Check target slot for conflicts
  const targetConflicts = await db
    .select()
    .from(timetableSlot)
    .where(
      and(
        eq(timetableSlot.timetableId, ctx.timetableId),
        eq(timetableSlot.day, input.toDay),
        eq(timetableSlot.period, input.toPeriod),
        eq(timetableSlot.studentGroupId, group.id),
      ),
    );

  if (targetConflicts.length > 0) {
    return { error: `${group.name} already has a class at ${input.toDay} period ${input.toPeriod}. Try swapping instead.` };
  }

  // Check teacher conflict at target
  if (sourceSlot.teacherId) {
    const teacherConflict = await db
      .select()
      .from(timetableSlot)
      .where(
        and(
          eq(timetableSlot.timetableId, ctx.timetableId),
          eq(timetableSlot.day, input.toDay),
          eq(timetableSlot.period, input.toPeriod),
          eq(timetableSlot.teacherId, sourceSlot.teacherId),
        ),
      );

    if (teacherConflict.length > 0) {
      return { error: `Teacher is already occupied at ${input.toDay} period ${input.toPeriod}. Cannot move without creating a conflict.` };
    }
  }

  // Move the slot
  await db
    .update(timetableSlot)
    .set({
      day: input.toDay,
      period: input.toPeriod,
      isManualOverride: true,
      updatedAt: new Date(),
    })
    .where(eq(timetableSlot.id, sourceSlot.id));

  await recordChange(
    ctx.timetableId,
    ctx.userId,
    "SLOT_MOVE",
    `Moved ${subject.name} for ${group.name} from ${input.fromDay} P${input.fromPeriod} to ${input.toDay} P${input.toPeriod}`,
    { day: input.fromDay, period: input.fromPeriod, subjectId: subject.id, teacherId: sourceSlot.teacherId },
    { day: input.toDay, period: input.toPeriod, subjectId: subject.id, teacherId: sourceSlot.teacherId },
  );

  return {
    success: true,
    message: `Moved ${subject.name} for ${group.name} from ${input.fromDay} period ${input.fromPeriod} to ${input.toDay} period ${input.toPeriod}`,
  };
}

async function moveSubjectToTime(
  ctx: ToolContext,
  input: { subjectName: string; timePreference: "morning" | "afternoon"; groupName?: string },
) {
  const subject = await findSubject(ctx.organizationId, input.subjectName);
  if (!subject) return { error: `Subject "${input.subjectName}" not found` };

  const config = await db.query.timetable.findFirst({
    where: eq(timetable.id, ctx.timetableId),
    with: { config: true },
  });
  if (!config?.config) return { error: "Timetable config not found" };

  const periodsPerDay = config.config.periodsPerDay;
  const midPoint = Math.floor(periodsPerDay / 2);
  const targetRange = input.timePreference === "morning"
    ? { min: 1, max: midPoint }
    : { min: midPoint + 1, max: periodsPerDay };

  // Find all slots for this subject
  const conditions = [
    eq(timetableSlot.timetableId, ctx.timetableId),
    eq(timetableSlot.subjectId, subject.id),
  ];

  let group;
  if (input.groupName) {
    group = await findGroup(ctx.organizationId, input.groupName);
    if (group) conditions.push(eq(timetableSlot.studentGroupId, group.id));
  }

  const slots = await db
    .select()
    .from(timetableSlot)
    .where(and(...conditions));

  const slotsToMove = slots.filter(
    (s) => s.period < targetRange.min || s.period > targetRange.max,
  );

  if (slotsToMove.length === 0) {
    return { message: `All ${subject.name} classes are already in ${input.timePreference} slots.` };
  }

  let moved = 0;
  const issues: string[] = [];

  for (const slot of slotsToMove) {
    // Try to find an available slot in the target range
    let placed = false;
    for (let p = targetRange.min; p <= targetRange.max; p++) {
      // Check group conflict
      const groupConflict = await db
        .select()
        .from(timetableSlot)
        .where(
          and(
            eq(timetableSlot.timetableId, ctx.timetableId),
            eq(timetableSlot.day, slot.day),
            eq(timetableSlot.period, p),
            eq(timetableSlot.studentGroupId, slot.studentGroupId!),
          ),
        );

      if (groupConflict.length > 0) continue;

      // Check teacher conflict
      if (slot.teacherId) {
        const teacherConflict = await db
          .select()
          .from(timetableSlot)
          .where(
            and(
              eq(timetableSlot.timetableId, ctx.timetableId),
              eq(timetableSlot.day, slot.day),
              eq(timetableSlot.period, p),
              eq(timetableSlot.teacherId, slot.teacherId),
            ),
          );

        if (teacherConflict.length > 0) continue;
      }

      // Move the slot
      await db
        .update(timetableSlot)
        .set({ period: p, isManualOverride: true, updatedAt: new Date() })
        .where(eq(timetableSlot.id, slot.id));
      moved++;
      placed = true;
      break;
    }

    if (!placed) {
      issues.push(`Could not move ${slot.day} P${slot.period} — no available ${input.timePreference} slot`);
    }
  }

  await recordChange(
    ctx.timetableId,
    ctx.userId,
    "BULK_CHANGE",
    `Moved ${moved} ${subject.name} classes to ${input.timePreference} slots`,
    undefined,
    { subjectId: subject.id, timePreference: input.timePreference, moved },
    `Move ${subject.name} to ${input.timePreference}s`,
  );

  return {
    success: true,
    moved,
    total: slotsToMove.length,
    issues: issues.length > 0 ? issues : undefined,
    message: `Moved ${moved}/${slotsToMove.length} ${subject.name} classes to ${input.timePreference} slots.${issues.length > 0 ? ` ${issues.length} could not be moved.` : ""}`,
  };
}

async function freeTeacherDay(
  ctx: ToolContext,
  input: { teacherName: string; day: string },
) {
  const teacher = await findTeacher(ctx.organizationId, input.teacherName);
  if (!teacher) return { error: `Teacher "${input.teacherName}" not found` };

  const slotsToRemove = await db
    .select()
    .from(timetableSlot)
    .where(
      and(
        eq(timetableSlot.timetableId, ctx.timetableId),
        eq(timetableSlot.teacherId, teacher.id),
        eq(timetableSlot.day, input.day),
      ),
    );

  if (slotsToRemove.length === 0) {
    return { message: `${teacher.name} has no classes on ${input.day}.` };
  }

  // Remove the slots
  const slotIds = slotsToRemove.map((s) => s.id);
  await db
    .delete(timetableSlot)
    .where(inArray(timetableSlot.id, slotIds));

  await recordChange(
    ctx.timetableId,
    ctx.userId,
    "BULK_CHANGE",
    `Freed ${teacher.name} on ${input.day} — removed ${slotsToRemove.length} classes`,
    { teacherId: teacher.id, day: input.day, removedSlots: slotsToRemove.length },
    undefined,
    `Free up ${teacher.name} on ${input.day}`,
  );

  return {
    success: true,
    removed: slotsToRemove.length,
    message: `Freed ${teacher.name} on ${input.day} by removing ${slotsToRemove.length} classes. Note: these classes need to be reassigned to other days.`,
  };
}

async function swapSlots(
  ctx: ToolContext,
  input: {
    slot1Day: string;
    slot1Period: number;
    slot1Group: string;
    slot2Day: string;
    slot2Period: number;
    slot2Group: string;
  },
) {
  const group1 = await findGroup(ctx.organizationId, input.slot1Group);
  const group2 = await findGroup(ctx.organizationId, input.slot2Group);
  if (!group1) return { error: `Group "${input.slot1Group}" not found` };
  if (!group2) return { error: `Group "${input.slot2Group}" not found` };

  const [slot1] = await db
    .select()
    .from(timetableSlot)
    .where(
      and(
        eq(timetableSlot.timetableId, ctx.timetableId),
        eq(timetableSlot.day, input.slot1Day),
        eq(timetableSlot.period, input.slot1Period),
        eq(timetableSlot.studentGroupId, group1.id),
      ),
    )
    .limit(1);

  const [slot2] = await db
    .select()
    .from(timetableSlot)
    .where(
      and(
        eq(timetableSlot.timetableId, ctx.timetableId),
        eq(timetableSlot.day, input.slot2Day),
        eq(timetableSlot.period, input.slot2Period),
        eq(timetableSlot.studentGroupId, group2.id),
      ),
    )
    .limit(1);

  if (!slot1 || !slot2) {
    return { error: "One or both slots not found" };
  }

  // Swap day and period
  await db.update(timetableSlot).set({
    day: input.slot2Day,
    period: input.slot2Period,
    isManualOverride: true,
    updatedAt: new Date(),
  }).where(eq(timetableSlot.id, slot1.id));

  await db.update(timetableSlot).set({
    day: input.slot1Day,
    period: input.slot1Period,
    isManualOverride: true,
    updatedAt: new Date(),
  }).where(eq(timetableSlot.id, slot2.id));

  await recordChange(
    ctx.timetableId,
    ctx.userId,
    "SLOT_SWAP",
    `Swapped ${input.slot1Day} P${input.slot1Period} (${group1.name}) with ${input.slot2Day} P${input.slot2Period} (${group2.name})`,
    { slot1Id: slot1.id, slot2Id: slot2.id },
    { slot1Day: input.slot2Day, slot1Period: input.slot2Period, slot2Day: input.slot1Day, slot2Period: input.slot1Period },
  );

  return { success: true, message: "Slots swapped successfully." };
}

async function checkConflicts(ctx: ToolContext) {
  const conflicts = await validateTimetable(ctx.timetableId);
  if (conflicts.length === 0) {
    return { conflicts: [], message: "No conflicts found — the timetable is clean!" };
  }
  return {
    total: conflicts.length,
    conflicts: conflicts.map((c) => ({
      type: c.type,
      message: c.message,
      severity: c.severity,
      location: `${c.slotDay} period ${c.slotPeriod}`,
    })),
  };
}

async function getOptimizations(ctx: ToolContext) {
  return getOptimizationSuggestions(ctx.timetableId, ctx.organizationId);
}

async function getTeacherFatigueReport(ctx: ToolContext) {
  const predictions = await predictTeacherFatigue(ctx.timetableId);
  if (predictions.length === 0) {
    return { message: "No significant fatigue risks detected." };
  }
  return {
    total: predictions.length,
    critical: predictions.filter((p) => p.riskLevel === "CRITICAL").length,
    high: predictions.filter((p) => p.riskLevel === "HIGH").length,
    predictions: predictions.slice(0, 10).map((p) => ({
      teacher: p.teacherName,
      day: p.day,
      risk: p.riskLevel,
      reasons: p.reasons,
      suggestion: p.suggestion,
    })),
  };
}
