/**
 * Timetable Predictive Analytics & Optimization
 *
 * Provides:
 * - Teacher fatigue prediction
 * - Room utilization analysis
 * - Student attention span modeling
 * - Load balance scoring
 * - Optimization suggestions
 */

import { db } from "@/lib/db";
import {
  timetableSlot,
  timetableTeacher,
  timetableSubject,
  timetableClassroom,
  timetableStudentGroup,
  timetable,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────

export type FatiguePrediction = {
  teacherId: string;
  teacherName: string;
  day: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  score: number;
  reasons: string[];
  suggestion: string;
};

export type RoomUtilization = {
  classroomId: string;
  classroomName: string;
  totalSlots: number;
  usedSlots: number;
  utilizationPercent: number;
  peakDay: string;
  peakUsage: number;
  suggestion: string;
};

export type StudentLoadAnalysis = {
  groupId: string;
  groupName: string;
  day: string;
  totalPeriods: number;
  heavySubjectsInRow: number;
  attentionDropRisk: "LOW" | "MEDIUM" | "HIGH";
  suggestion: string;
};

export type OptimizationSuggestion = {
  type: "ROOM_UTILIZATION" | "TEACHER_BALANCE" | "STUDENT_ATTENTION" | "SCHEDULE_GAP" | "PREFERENCE_ALIGNMENT";
  priority: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  description: string;
  impact: string;
  affectedEntities: string[];
};

// ─── Teacher Fatigue Predictor ───────────────────────────

export async function predictTeacherFatigue(
  timetableId: string,
): Promise<FatiguePrediction[]> {
  const [slots, teachers] = await Promise.all([
    db.select().from(timetableSlot).where(eq(timetableSlot.timetableId, timetableId)),
    db.select().from(timetableTeacher),
  ]);

  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const predictions: FatiguePrediction[] = [];

  // Group slots by teacher and day
  const teacherDaySlots = new Map<string, typeof slots>();
  for (const slot of slots) {
    if (!slot.teacherId) continue;
    const key = `${slot.teacherId}:${slot.day}`;
    const existing = teacherDaySlots.get(key) ?? [];
    existing.push(slot);
    teacherDaySlots.set(key, existing);
  }

  for (const [key, daySlots] of teacherDaySlots) {
    const [teacherId, day] = key.split(":");
    const teacher = teacherMap.get(teacherId);
    if (!teacher) continue;

    const sortedPeriods = daySlots.map((s) => s.period).sort((a, b) => a - b);
    const totalPeriods = sortedPeriods.length;
    const maxPerDay = teacher.maxPeriodsPerDay ?? 6;
    const consecutiveLimit = teacher.consecutivePeriodLimit ?? 3;

    let score = 0;
    const reasons: string[] = [];

    // Load factor
    const loadRatio = totalPeriods / maxPerDay;
    if (loadRatio > 0.9) {
      score += 40;
      reasons.push(`${totalPeriods}/${maxPerDay} periods — near maximum capacity`);
    } else if (loadRatio > 0.75) {
      score += 20;
      reasons.push(`${totalPeriods}/${maxPerDay} periods — heavy load`);
    }

    // Consecutive periods
    let maxConsecutive = 1;
    let currentRun = 1;
    for (let i = 1; i < sortedPeriods.length; i++) {
      if (sortedPeriods[i] === sortedPeriods[i - 1] + 1) {
        currentRun++;
        maxConsecutive = Math.max(maxConsecutive, currentRun);
      } else {
        currentRun = 1;
      }
    }
    if (maxConsecutive > consecutiveLimit) {
      score += 30;
      reasons.push(`${maxConsecutive} consecutive periods (limit: ${consecutiveLimit})`);
    } else if (maxConsecutive === consecutiveLimit) {
      score += 15;
      reasons.push(`At consecutive period limit (${maxConsecutive})`);
    }

    // No breaks between classes
    const hasGap = sortedPeriods.some(
      (p, i) => i > 0 && p - sortedPeriods[i - 1] > 1,
    );
    if (!hasGap && totalPeriods > 3) {
      score += 15;
      reasons.push("No free periods between classes");
    }

    // Late day fatigue (periods 6+)
    const latePeriods = sortedPeriods.filter((p) => p >= 6).length;
    if (latePeriods >= 2) {
      score += 10;
      reasons.push(`${latePeriods} late-day periods (6th+)`);
    }

    if (reasons.length === 0) continue;

    let riskLevel: FatiguePrediction["riskLevel"];
    if (score >= 60) riskLevel = "CRITICAL";
    else if (score >= 40) riskLevel = "HIGH";
    else if (score >= 20) riskLevel = "MEDIUM";
    else riskLevel = "LOW";

    let suggestion = "";
    if (riskLevel === "CRITICAL") {
      suggestion = `Consider redistributing ${teacher.name}'s ${day} load. Move some classes to lighter days.`;
    } else if (riskLevel === "HIGH") {
      suggestion = `Add a free period gap for ${teacher.name} on ${day} to reduce fatigue.`;
    } else {
      suggestion = `${teacher.name}'s ${day} load is manageable but could be improved.`;
    }

    predictions.push({
      teacherId,
      teacherName: teacher.name,
      day,
      riskLevel,
      score,
      reasons,
      suggestion,
    });
  }

  return predictions.sort((a, b) => b.score - a.score);
}

// ─── Room Utilization Analyzer ───────────────────────────

export async function analyzeRoomUtilization(
  timetableId: string,
  organizationId: string,
): Promise<RoomUtilization[]> {
  const [slots, classrooms, config] = await Promise.all([
    db.select().from(timetableSlot).where(eq(timetableSlot.timetableId, timetableId)),
    db.select().from(timetableClassroom).where(eq(timetableClassroom.organizationId, organizationId)),
    db.query.timetable.findFirst({
      where: eq(timetable.id, timetableId),
      with: { config: true },
    }),
  ]);

  if (!config?.config) return [];

  const activeDays = (config.config.activeDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) as string[];
  const periodsPerDay = config.config.periodsPerDay;
  const totalSlotsPerRoom = activeDays.length * periodsPerDay;

  return classrooms.map((room) => {
    const roomSlots = slots.filter((s) => s.classroomId === room.id);
    const usedSlots = roomSlots.length;
    const utilizationPercent = Math.round((usedSlots / totalSlotsPerRoom) * 100);

    // Find peak day
    const dayUsage = new Map<string, number>();
    for (const slot of roomSlots) {
      dayUsage.set(slot.day, (dayUsage.get(slot.day) ?? 0) + 1);
    }
    let peakDay = activeDays[0];
    let peakUsage = 0;
    for (const [day, count] of dayUsage) {
      if (count > peakUsage) {
        peakDay = day;
        peakUsage = count;
      }
    }

    let suggestion = "";
    if (utilizationPercent < 20) {
      suggestion = `${room.name} is significantly underutilized. Consider consolidating room assignments.`;
    } else if (utilizationPercent > 85) {
      suggestion = `${room.name} is near full capacity. Ensure maintenance windows are available.`;
    } else {
      suggestion = `${room.name} utilization is healthy at ${utilizationPercent}%.`;
    }

    return {
      classroomId: room.id,
      classroomName: room.name,
      totalSlots: totalSlotsPerRoom,
      usedSlots,
      utilizationPercent,
      peakDay,
      peakUsage,
      suggestion,
    };
  });
}

// ─── Student Load & Attention Analysis ───────────────────

export async function analyzeStudentLoad(
  timetableId: string,
): Promise<StudentLoadAnalysis[]> {
  const [slots, groups, subjects] = await Promise.all([
    db.select().from(timetableSlot).where(eq(timetableSlot.timetableId, timetableId)),
    db.select().from(timetableStudentGroup),
    db.select().from(timetableSubject),
  ]);

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const analyses: StudentLoadAnalysis[] = [];

  // Heavy subjects (those that require lab or have more periods)
  const heavySubjectIds = new Set(
    subjects
      .filter((s) => s.requiresLab || s.periodsPerWeek >= 6)
      .map((s) => s.id),
  );

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (const group of groups) {
    for (const day of days) {
      const daySlots = slots
        .filter((s) => s.studentGroupId === group.id && s.day === day)
        .sort((a, b) => a.period - b.period);

      if (daySlots.length === 0) continue;

      // Count consecutive heavy subjects
      let maxHeavyInRow = 0;
      let currentHeavyRun = 0;
      for (let i = 0; i < daySlots.length; i++) {
        const isHeavy = daySlots[i].subjectId ? heavySubjectIds.has(daySlots[i].subjectId!) : false;
        if (isHeavy) {
          currentHeavyRun++;
          maxHeavyInRow = Math.max(maxHeavyInRow, currentHeavyRun);
        } else {
          currentHeavyRun = 0;
        }
      }

      let attentionDropRisk: StudentLoadAnalysis["attentionDropRisk"] = "LOW";
      let suggestion = "";

      if (daySlots.length >= 7 && maxHeavyInRow >= 3) {
        attentionDropRisk = "HIGH";
        suggestion = `${group.name} has ${maxHeavyInRow} consecutive heavy subjects on ${day}. Intersperse lighter subjects.`;
      } else if (daySlots.length >= 6 && maxHeavyInRow >= 2) {
        attentionDropRisk = "MEDIUM";
        suggestion = `${group.name} could benefit from a lighter subject between heavy ones on ${day}.`;
      } else {
        suggestion = `${group.name}'s ${day} schedule is well-balanced.`;
      }

      if (attentionDropRisk !== "LOW") {
        analyses.push({
          groupId: group.id,
          groupName: group.name,
          day,
          totalPeriods: daySlots.length,
          heavySubjectsInRow: maxHeavyInRow,
          attentionDropRisk,
          suggestion,
        });
      }
    }
  }

  return analyses.sort((a, b) => {
    const riskOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return riskOrder[b.attentionDropRisk] - riskOrder[a.attentionDropRisk];
  });
}

// ─── Optimization Suggestions ────────────────────────────

export async function getOptimizationSuggestions(
  timetableId: string,
  organizationId: string,
): Promise<OptimizationSuggestion[]> {
  const [fatigue, utilization, studentLoad] = await Promise.all([
    predictTeacherFatigue(timetableId),
    analyzeRoomUtilization(timetableId, organizationId),
    analyzeStudentLoad(timetableId),
  ]);

  const suggestions: OptimizationSuggestion[] = [];

  // Teacher fatigue suggestions
  const criticalFatigue = fatigue.filter((f) => f.riskLevel === "CRITICAL" || f.riskLevel === "HIGH");
  if (criticalFatigue.length > 0) {
    suggestions.push({
      type: "TEACHER_BALANCE",
      priority: "HIGH",
      title: "Teacher Fatigue Risk Detected",
      description: `${criticalFatigue.length} teacher(s) have high fatigue risk on certain days. ${criticalFatigue[0].suggestion}`,
      impact: "Reduces burnout, improves teaching quality",
      affectedEntities: criticalFatigue.map((f) => f.teacherId),
    });
  }

  // Room utilization suggestions
  const underutilized = utilization.filter((r) => r.utilizationPercent < 25);
  const overutilized = utilization.filter((r) => r.utilizationPercent > 80);

  if (underutilized.length > 0 && overutilized.length > 0) {
    suggestions.push({
      type: "ROOM_UTILIZATION",
      priority: "MEDIUM",
      title: "Room Utilization Imbalance",
      description: `${underutilized.length} room(s) are underutilized while ${overutilized.length} are near capacity. Consider redistribution.`,
      impact: "Better room usage, reduced wear on popular rooms",
      affectedEntities: [...underutilized.map((r) => r.classroomId), ...overutilized.map((r) => r.classroomId)],
    });
  }

  // Student attention suggestions
  const highRiskGroups = studentLoad.filter((s) => s.attentionDropRisk === "HIGH");
  if (highRiskGroups.length > 0) {
    suggestions.push({
      type: "STUDENT_ATTENTION",
      priority: "HIGH",
      title: "Student Attention Drop Risk",
      description: `${highRiskGroups.length} group-day combinations have high attention drop risk due to consecutive heavy subjects.`,
      impact: "Improved student engagement and learning outcomes",
      affectedEntities: highRiskGroups.map((s) => s.groupId),
    });
  }

  // Teacher load balance
  const slots = await db.select().from(timetableSlot).where(eq(timetableSlot.timetableId, timetableId));
  const teacherWeeklyLoads = new Map<string, number>();
  for (const slot of slots) {
    if (!slot.teacherId) continue;
    teacherWeeklyLoads.set(slot.teacherId, (teacherWeeklyLoads.get(slot.teacherId) ?? 0) + 1);
  }
  const loads = Array.from(teacherWeeklyLoads.values());
  if (loads.length > 1) {
    const avg = loads.reduce((a, b) => a + b, 0) / loads.length;
    const maxDeviation = Math.max(...loads.map((l) => Math.abs(l - avg)));
    if (maxDeviation > avg * 0.5) {
      suggestions.push({
        type: "TEACHER_BALANCE",
        priority: "MEDIUM",
        title: "Uneven Teacher Workload Distribution",
        description: `Teacher workloads vary significantly (deviation: ${Math.round(maxDeviation)} periods from average of ${Math.round(avg)}). Consider redistributing.`,
        impact: "Fairer workload distribution, higher staff satisfaction",
        affectedEntities: Array.from(teacherWeeklyLoads.keys()),
      });
    }
  }

  return suggestions.sort((a, b) => {
    const p = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return p[b.priority] - p[a.priority];
  });
}
