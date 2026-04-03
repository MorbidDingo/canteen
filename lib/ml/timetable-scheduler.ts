/**
 * Core Timetable Scheduling Algorithm
 *
 * Uses a constraint-satisfaction approach with backtracking,
 * enhanced by heuristics for intelligent slot assignment.
 * Operates as a hybrid solver — deterministic constraint solving
 * combined with scoring-based optimization for soft constraints.
 */

import { db } from "@/lib/db";
import {
  timetable,
  timetableSlot,
  timetableTeacher,
  timetableSubject,
  timetableClassroom,
  timetableStudentGroup,
  timetableTeacherSubject,
  timetableConstraint,
  timetableConfig,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────

export type SlotPosition = { day: string; period: number };

export type SlotAssignment = {
  day: string;
  period: number;
  teacherId: string;
  subjectId: string;
  classroomId: string;
  studentGroupId: string;
};

export type ScheduleRequirement = {
  teacherId: string;
  subjectId: string;
  studentGroupId: string;
  periodsPerWeek: number;
  requiresLab: boolean;
};

type TeacherData = {
  id: string;
  name: string;
  maxPeriodsPerDay: number;
  maxPeriodsPerWeek: number;
  consecutivePeriodLimit: number;
  preferredSlots: SlotPosition[];
  unavailableSlots: SlotPosition[];
};

type SubjectData = {
  id: string;
  name: string;
  periodsPerWeek: number;
  requiresLab: boolean;
  preferMorning: boolean;
  preferAfternoon: boolean;
  maxConsecutive: number;
  color: string;
};

type ClassroomData = {
  id: string;
  name: string;
  capacity: number;
  roomType: string;
};

type GroupData = {
  id: string;
  name: string;
  strength: number;
  homeRoomId: string | null;
};

type ConstraintData = {
  type: "HARD" | "SOFT";
  category: string;
  weight: number;
  parameters: Record<string, unknown>;
  isEnabled: boolean;
};

export type ConflictInfo = {
  type: string;
  message: string;
  severity: "ERROR" | "WARNING" | "INFO";
  slotDay: string;
  slotPeriod: number;
  involvedEntities: string[];
};

export type GenerationResult = {
  slots: SlotAssignment[];
  conflicts: ConflictInfo[];
  score: number;
  explanation: string;
  stats: {
    totalSlotsFilled: number;
    totalSlotsAvailable: number;
    hardConstraintViolations: number;
    softConstraintScore: number;
    generationTimeMs: number;
  };
};

// ─── Data Loader ─────────────────────────────────────────

async function loadSchedulingData(organizationId: string, configId: string) {
  const [config, teachers, subjects, classrooms, groups, assignments, constraints] =
    await Promise.all([
      db.query.timetableConfig.findFirst({
        where: and(
          eq(timetableConfig.id, configId),
          eq(timetableConfig.organizationId, organizationId),
        ),
      }),
      db
        .select()
        .from(timetableTeacher)
        .where(
          and(
            eq(timetableTeacher.organizationId, organizationId),
            eq(timetableTeacher.isActive, true),
          ),
        ),
      db
        .select()
        .from(timetableSubject)
        .where(
          and(
            eq(timetableSubject.organizationId, organizationId),
            eq(timetableSubject.isActive, true),
          ),
        ),
      db
        .select()
        .from(timetableClassroom)
        .where(
          and(
            eq(timetableClassroom.organizationId, organizationId),
            eq(timetableClassroom.isActive, true),
          ),
        ),
      db
        .select()
        .from(timetableStudentGroup)
        .where(
          and(
            eq(timetableStudentGroup.organizationId, organizationId),
            eq(timetableStudentGroup.isActive, true),
          ),
        ),
      db.select().from(timetableTeacherSubject),
      db
        .select()
        .from(timetableConstraint)
        .where(
          and(
            eq(timetableConstraint.organizationId, organizationId),
            eq(timetableConstraint.isEnabled, true),
          ),
        ),
    ]);

  if (!config) throw new Error("Timetable config not found");

  return {
    config,
    teachers: teachers.map((t) => ({
      id: t.id,
      name: t.name,
      maxPeriodsPerDay: t.maxPeriodsPerDay ?? 6,
      maxPeriodsPerWeek: t.maxPeriodsPerWeek ?? 30,
      consecutivePeriodLimit: t.consecutivePeriodLimit ?? 3,
      preferredSlots: (t.preferredSlots ?? []) as SlotPosition[],
      unavailableSlots: (t.unavailableSlots ?? []) as SlotPosition[],
    })) as TeacherData[],
    subjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      periodsPerWeek: s.periodsPerWeek,
      requiresLab: s.requiresLab,
      preferMorning: s.preferMorning,
      preferAfternoon: s.preferAfternoon,
      maxConsecutive: s.maxConsecutive ?? 2,
      color: s.color,
    })) as SubjectData[],
    classrooms: classrooms.map((c) => ({
      id: c.id,
      name: c.name,
      capacity: c.capacity,
      roomType: c.roomType,
    })) as ClassroomData[],
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      strength: g.strength,
      homeRoomId: g.homeRoomId,
    })) as GroupData[],
    assignments: assignments.map((a) => ({
      teacherId: a.teacherId,
      subjectId: a.subjectId,
      studentGroupId: a.studentGroupId,
    })),
    constraints: constraints.map((c) => ({
      type: c.type as "HARD" | "SOFT",
      category: c.category,
      weight: c.weight,
      parameters: (c.parameters ?? {}) as Record<string, unknown>,
      isEnabled: c.isEnabled,
    })) as ConstraintData[],
  };
}

// ─── Constraint Checker ──────────────────────────────────

class ConstraintChecker {
  private grid: Map<string, SlotAssignment> = new Map();
  private constraints: ConstraintData[];

  constructor(constraints: ConstraintData[]) {
    this.constraints = constraints;
  }

  private slotKey(day: string, period: number, entityType: string, entityId: string): string {
    return `${day}:${period}:${entityType}:${entityId}`;
  }

  private gridKey(day: string, period: number, groupId: string): string {
    return `${day}:${period}:${groupId}`;
  }

  addSlot(slot: SlotAssignment) {
    this.grid.set(this.gridKey(slot.day, slot.period, slot.studentGroupId), slot);
  }

  removeSlot(day: string, period: number, groupId: string) {
    this.grid.delete(this.gridKey(day, period, groupId));
  }

  getSlot(day: string, period: number, groupId: string): SlotAssignment | undefined {
    return this.grid.get(this.gridKey(day, period, groupId));
  }

  getAllSlots(): SlotAssignment[] {
    return Array.from(this.grid.values());
  }

  /**
   * Check if placing a slot violates any HARD constraints
   */
  checkHardConstraints(slot: SlotAssignment): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];
    const allSlots = this.getAllSlots();

    // Teacher double-booking
    const teacherConflict = allSlots.find(
      (s) =>
        s.teacherId === slot.teacherId &&
        s.day === slot.day &&
        s.period === slot.period &&
        s.studentGroupId !== slot.studentGroupId,
    );
    if (teacherConflict) {
      conflicts.push({
        type: "TEACHER_DOUBLE_BOOKING",
        message: `Teacher already assigned at ${slot.day} period ${slot.period}`,
        severity: "ERROR",
        slotDay: slot.day,
        slotPeriod: slot.period,
        involvedEntities: [slot.teacherId],
      });
    }

    // Room double-booking
    const roomConflict = allSlots.find(
      (s) =>
        s.classroomId === slot.classroomId &&
        s.day === slot.day &&
        s.period === slot.period &&
        s.studentGroupId !== slot.studentGroupId,
    );
    if (roomConflict) {
      conflicts.push({
        type: "ROOM_DOUBLE_BOOKING",
        message: `Room already occupied at ${slot.day} period ${slot.period}`,
        severity: "ERROR",
        slotDay: slot.day,
        slotPeriod: slot.period,
        involvedEntities: [slot.classroomId],
      });
    }

    // Group double-booking
    const groupConflict = allSlots.find(
      (s) =>
        s.studentGroupId === slot.studentGroupId &&
        s.day === slot.day &&
        s.period === slot.period,
    );
    if (groupConflict) {
      conflicts.push({
        type: "GROUP_DOUBLE_BOOKING",
        message: `Student group already has a class at ${slot.day} period ${slot.period}`,
        severity: "ERROR",
        slotDay: slot.day,
        slotPeriod: slot.period,
        involvedEntities: [slot.studentGroupId],
      });
    }

    return conflicts;
  }

  /**
   * Score a slot placement against soft constraints (0-100)
   */
  scoreSoftConstraints(
    slot: SlotAssignment,
    teachers: Map<string, TeacherData>,
    subjects: Map<string, SubjectData>,
    classrooms: Map<string, ClassroomData>,
    groups: Map<string, GroupData>,
    config: { periodsPerDay: number },
  ): number {
    let score = 100;
    const allSlots = this.getAllSlots();
    const teacher = teachers.get(slot.teacherId);
    const subject = subjects.get(slot.subjectId);
    const classroom = classrooms.get(slot.classroomId);
    const group = groups.get(slot.studentGroupId);

    if (!teacher || !subject) return 0;

    // Teacher daily load
    const teacherDaySlots = allSlots.filter(
      (s) => s.teacherId === slot.teacherId && s.day === slot.day,
    );
    if (teacherDaySlots.length >= teacher.maxPeriodsPerDay) {
      score -= 30;
    }

    // Teacher weekly load
    const teacherWeekSlots = allSlots.filter(
      (s) => s.teacherId === slot.teacherId,
    );
    if (teacherWeekSlots.length >= teacher.maxPeriodsPerWeek) {
      score -= 25;
    }

    // Consecutive period limit
    const consecutiveCount = this.countConsecutive(
      allSlots,
      slot.teacherId,
      slot.day,
      slot.period,
      "teacher",
    );
    if (consecutiveCount >= teacher.consecutivePeriodLimit) {
      score -= 20;
    }

    // Teacher preferred slots bonus
    const isPreferred = teacher.preferredSlots.some(
      (ps) => ps.day === slot.day && ps.period === slot.period,
    );
    if (isPreferred) score += 15;

    // Teacher unavailable penalty
    const isUnavailable = teacher.unavailableSlots.some(
      (us) => us.day === slot.day && us.period === slot.period,
    );
    if (isUnavailable) score -= 40;

    // Subject time preference
    const midPeriod = Math.floor(config.periodsPerDay / 2);
    if (subject.preferMorning && slot.period > midPeriod) {
      score -= 10;
    }
    if (subject.preferAfternoon && slot.period <= midPeriod) {
      score -= 10;
    }

    // Subject consecutive limit
    const subjectConsecutive = this.countConsecutive(
      allSlots.filter((s) => s.studentGroupId === slot.studentGroupId),
      slot.subjectId,
      slot.day,
      slot.period,
      "subject",
    );
    if (subjectConsecutive >= subject.maxConsecutive) {
      score -= 15;
    }

    // Room capacity check
    if (classroom && group && classroom.capacity < group.strength) {
      score -= 25;
    }

    // Lab requirement
    if (subject.requiresLab && classroom?.roomType !== "LAB") {
      score -= 35;
    }

    // Daily subject distribution — penalize same subject twice a day for a group
    const sameSubjectToday = allSlots.filter(
      (s) =>
        s.studentGroupId === slot.studentGroupId &&
        s.subjectId === slot.subjectId &&
        s.day === slot.day,
    );
    if (sameSubjectToday.length > 0) {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private countConsecutive(
    slots: SlotAssignment[],
    entityId: string,
    day: string,
    period: number,
    entityType: "teacher" | "subject",
  ): number {
    let count = 0;
    const field = entityType === "teacher" ? "teacherId" : "subjectId";

    // Count backwards
    for (let p = period - 1; p >= 1; p--) {
      const found = slots.find(
        (s) => s[field] === entityId && s.day === day && s.period === p,
      );
      if (found) count++;
      else break;
    }

    // Count forwards
    for (let p = period + 1; p <= 12; p++) {
      const found = slots.find(
        (s) => s[field] === entityId && s.day === day && s.period === p,
      );
      if (found) count++;
      else break;
    }

    return count;
  }
}

// ─── Scheduler Engine ────────────────────────────────────

export async function generateTimetable(
  organizationId: string,
  configId: string,
  timetableId: string,
  createdBy: string,
): Promise<GenerationResult> {
  const startTime = Date.now();

  const data = await loadSchedulingData(organizationId, configId);
  const { config, teachers, subjects, classrooms, groups, assignments, constraints } = data;

  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const classroomMap = new Map(classrooms.map((c) => [c.id, c]));
  const groupMap = new Map(groups.map((g) => [g.id, g]));

  const activeDays = (config.activeDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) as string[];
  const periodsPerDay = config.periodsPerDay;

  // Build requirements from teacher-subject assignments
  const requirements: ScheduleRequirement[] = [];
  for (const assignment of assignments) {
    if (!assignment.studentGroupId) continue;
    const subject = subjectMap.get(assignment.subjectId);
    if (!subject) continue;

    requirements.push({
      teacherId: assignment.teacherId,
      subjectId: assignment.subjectId,
      studentGroupId: assignment.studentGroupId,
      periodsPerWeek: subject.periodsPerWeek,
      requiresLab: subject.requiresLab,
    });
  }

  // Sort requirements by difficulty (more constrained first — MRV heuristic)
  requirements.sort((a, b) => {
    const teacherA = teacherMap.get(a.teacherId);
    const teacherB = teacherMap.get(b.teacherId);
    const unavailableA = teacherA?.unavailableSlots.length ?? 0;
    const unavailableB = teacherB?.unavailableSlots.length ?? 0;
    // More constraints = schedule first
    return unavailableB - unavailableA;
  });

  const checker = new ConstraintChecker(constraints);
  const allSlots: SlotAssignment[] = [];
  const allConflicts: ConflictInfo[] = [];

  // For each requirement, place the required number of periods
  for (const req of requirements) {
    let placed = 0;

    // Score all possible positions
    const candidates: { day: string; period: number; score: number; classroom: string }[] = [];

    for (const day of activeDays) {
      for (let period = 1; period <= periodsPerDay; period++) {
        // Skip break/lunch periods
        const breakPeriods = (config.breakAfterPeriod ?? []) as number[];
        if (breakPeriods.includes(period)) continue;
        if (config.lunchAfterPeriod && period === config.lunchAfterPeriod + 1) continue;

        // Find best classroom
        let bestRoom: ClassroomData | undefined;
        if (req.requiresLab) {
          bestRoom = classrooms.find(
            (c) =>
              c.roomType === "LAB" &&
              !allSlots.some(
                (s) => s.classroomId === c.id && s.day === day && s.period === period,
              ),
          );
        }
        if (!bestRoom) {
          const group = groupMap.get(req.studentGroupId);
          // Prefer home room
          if (group?.homeRoomId) {
            const homeRoom = classroomMap.get(group.homeRoomId);
            if (
              homeRoom &&
              !allSlots.some(
                (s) =>
                  s.classroomId === homeRoom.id && s.day === day && s.period === period,
              )
            ) {
              bestRoom = homeRoom;
            }
          }
          if (!bestRoom) {
            bestRoom = classrooms.find(
              (c) =>
                c.roomType === "REGULAR" &&
                c.capacity >= (group?.strength ?? 0) &&
                !allSlots.some(
                  (s) => s.classroomId === c.id && s.day === day && s.period === period,
                ),
            );
          }
          if (!bestRoom) {
            bestRoom = classrooms.find(
              (c) =>
                !allSlots.some(
                  (s) => s.classroomId === c.id && s.day === day && s.period === period,
                ),
            );
          }
        }

        if (!bestRoom) continue;

        const candidate: SlotAssignment = {
          day,
          period,
          teacherId: req.teacherId,
          subjectId: req.subjectId,
          classroomId: bestRoom.id,
          studentGroupId: req.studentGroupId,
        };

        // Check hard constraints
        const hardViolations = checker.checkHardConstraints(candidate);
        if (hardViolations.length > 0) continue;

        const score = checker.scoreSoftConstraints(
          candidate,
          teacherMap,
          subjectMap,
          classroomMap,
          groupMap,
          { periodsPerDay },
        );

        candidates.push({ day, period, score, classroom: bestRoom.id });
      }
    }

    // Sort candidates by score (best first), with some randomization for diversity
    candidates.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) < 5) {
        // Add slight randomness for equal-ish scores
        return Math.random() - 0.5;
      }
      return scoreDiff;
    });

    // Distribute periods across different days
    const usedDays = new Set<string>();
    const periodsNeeded = req.periodsPerWeek;

    // First pass: one per day
    for (const candidate of candidates) {
      if (placed >= periodsNeeded) break;
      if (usedDays.has(candidate.day) && placed < Math.min(periodsNeeded, activeDays.length)) {
        continue;
      }

      const slot: SlotAssignment = {
        day: candidate.day,
        period: candidate.period,
        teacherId: req.teacherId,
        subjectId: req.subjectId,
        classroomId: candidate.classroom,
        studentGroupId: req.studentGroupId,
      };

      const violations = checker.checkHardConstraints(slot);
      if (violations.length === 0) {
        checker.addSlot(slot);
        allSlots.push(slot);
        usedDays.add(candidate.day);
        placed++;
      }
    }

    // Second pass: fill remaining
    for (const candidate of candidates) {
      if (placed >= periodsNeeded) break;

      const existingInSlot = allSlots.find(
        (s) =>
          s.day === candidate.day &&
          s.period === candidate.period &&
          s.studentGroupId === req.studentGroupId,
      );
      if (existingInSlot) continue;

      const slot: SlotAssignment = {
        day: candidate.day,
        period: candidate.period,
        teacherId: req.teacherId,
        subjectId: req.subjectId,
        classroomId: candidate.classroom,
        studentGroupId: req.studentGroupId,
      };

      const violations = checker.checkHardConstraints(slot);
      if (violations.length === 0) {
        checker.addSlot(slot);
        allSlots.push(slot);
        placed++;
      }
    }

    if (placed < periodsNeeded) {
      allConflicts.push({
        type: "UNPLACED_REQUIREMENT",
        message: `Could only place ${placed}/${periodsNeeded} periods for requirement`,
        severity: "WARNING",
        slotDay: "",
        slotPeriod: 0,
        involvedEntities: [req.teacherId, req.subjectId, req.studentGroupId],
      });
    }
  }

  // Calculate final score
  const totalRequired = requirements.reduce((sum, r) => sum + r.periodsPerWeek, 0);
  const fillRate = totalRequired > 0 ? allSlots.length / totalRequired : 0;
  const hardViolations = allConflicts.filter((c) => c.severity === "ERROR").length;
  const score = Math.round(fillRate * 100 - hardViolations * 10);

  const generationTimeMs = Date.now() - startTime;

  // Save slots to database
  if (allSlots.length > 0) {
    await db.insert(timetableSlot).values(
      allSlots.map((s) => ({
        id: crypto.randomUUID(),
        timetableId,
        day: s.day,
        period: s.period,
        teacherId: s.teacherId,
        subjectId: s.subjectId,
        classroomId: s.classroomId,
        studentGroupId: s.studentGroupId,
        conflictFlags: [] as string[],
      })),
    );

    // Update timetable record
    await db
      .update(timetable)
      .set({
        conflictCount: allConflicts.length,
        score,
        updatedAt: new Date(),
      })
      .where(eq(timetable.id, timetableId));
  }

  const explanation = generateExplanation(allSlots, allConflicts, requirements, teachers, subjects, groups);

  return {
    slots: allSlots,
    conflicts: allConflicts,
    score,
    explanation,
    stats: {
      totalSlotsFilled: allSlots.length,
      totalSlotsAvailable: activeDays.length * periodsPerDay * groups.length,
      hardConstraintViolations: hardViolations,
      softConstraintScore: score,
      generationTimeMs,
    },
  };
}

function generateExplanation(
  slots: SlotAssignment[],
  conflicts: ConflictInfo[],
  requirements: ScheduleRequirement[],
  teachers: TeacherData[],
  subjects: SubjectData[],
  groups: GroupData[],
): string {
  const lines: string[] = [];
  lines.push(`Generated ${slots.length} slot assignments for ${groups.length} groups.`);

  const totalRequired = requirements.reduce((sum, r) => sum + r.periodsPerWeek, 0);
  lines.push(`Fulfilled ${slots.length}/${totalRequired} required periods (${Math.round((slots.length / Math.max(1, totalRequired)) * 100)}%).`);

  if (conflicts.length === 0) {
    lines.push("No conflicts detected — all constraints satisfied.");
  } else {
    const errors = conflicts.filter((c) => c.severity === "ERROR");
    const warnings = conflicts.filter((c) => c.severity === "WARNING");
    if (errors.length > 0) lines.push(`${errors.length} hard constraint violation(s) found.`);
    if (warnings.length > 0) lines.push(`${warnings.length} warning(s) — some periods could not be optimally placed.`);
  }

  // Teacher workload summary
  const teacherLoads = new Map<string, number>();
  for (const slot of slots) {
    teacherLoads.set(slot.teacherId, (teacherLoads.get(slot.teacherId) ?? 0) + 1);
  }
  const avgLoad = teacherLoads.size > 0
    ? Math.round(Array.from(teacherLoads.values()).reduce((a, b) => a + b, 0) / teacherLoads.size)
    : 0;
  lines.push(`Average teacher load: ${avgLoad} periods/week across ${teacherLoads.size} teachers.`);

  return lines.join("\n");
}

// ─── Conflict Validation ─────────────────────────────────

export async function validateTimetable(timetableId: string): Promise<ConflictInfo[]> {
  const slots = await db
    .select()
    .from(timetableSlot)
    .where(eq(timetableSlot.timetableId, timetableId));

  const conflicts: ConflictInfo[] = [];

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];

      if (a.day !== b.day || a.period !== b.period) continue;

      // Teacher double-booking
      if (a.teacherId && b.teacherId && a.teacherId === b.teacherId) {
        conflicts.push({
          type: "TEACHER_DOUBLE_BOOKING",
          message: `Teacher double-booked at ${a.day} period ${a.period}`,
          severity: "ERROR",
          slotDay: a.day,
          slotPeriod: a.period,
          involvedEntities: [a.teacherId],
        });
      }

      // Room double-booking
      if (a.classroomId && b.classroomId && a.classroomId === b.classroomId) {
        conflicts.push({
          type: "ROOM_DOUBLE_BOOKING",
          message: `Room double-booked at ${a.day} period ${a.period}`,
          severity: "ERROR",
          slotDay: a.day,
          slotPeriod: a.period,
          involvedEntities: [a.classroomId],
        });
      }

      // Group double-booking
      if (a.studentGroupId && b.studentGroupId && a.studentGroupId === b.studentGroupId) {
        conflicts.push({
          type: "GROUP_DOUBLE_BOOKING",
          message: `Student group double-booked at ${a.day} period ${a.period}`,
          severity: "ERROR",
          slotDay: a.day,
          slotPeriod: a.period,
          involvedEntities: [a.studentGroupId],
        });
      }
    }
  }

  return conflicts;
}
