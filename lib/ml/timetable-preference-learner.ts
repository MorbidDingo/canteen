/**
 * Timetable AI Preference Learning
 *
 * Learns from admin edits and corrections to improve future
 * timetable generation. Tracks patterns in:
 * - Teacher time preferences (from manual moves)
 * - Subject distribution patterns (from adjustments)
 * - Room assignment patterns
 * - Admin scheduling habits
 * - Conflict resolution patterns
 */

import { db } from "@/lib/db";
import {
  timetableAiPreference,
  timetableChangeLog,
} from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────

export type LearnedPreference = {
  type: string;
  key: string;
  value: Record<string, unknown>;
  confidence: number;
  count: number;
};

// ─── Learn from Change Logs ──────────────────────────────

export async function learnFromChanges(
  organizationId: string,
  timetableId: string,
): Promise<LearnedPreference[]> {
  const changes = await db
    .select()
    .from(timetableChangeLog)
    .where(eq(timetableChangeLog.timetableId, timetableId))
    .orderBy(desc(timetableChangeLog.createdAt));

  const learned: LearnedPreference[] = [];

  // Analyze teacher time preference patterns
  const teacherMoves = changes.filter((c) => c.changeType === "SLOT_MOVE" || c.changeType === "SLOT_SWAP");
  const teacherTimePatterns = new Map<string, { morningMoves: number; afternoonMoves: number; total: number }>();

  for (const change of teacherMoves) {
    const newState = change.newState as Record<string, unknown> | null;
    if (!newState) continue;

    const teacherId = newState.teacherId as string;
    const period = newState.period as number;
    if (!teacherId || !period) continue;

    const existing = teacherTimePatterns.get(teacherId) ?? { morningMoves: 0, afternoonMoves: 0, total: 0 };
    if (period <= 4) existing.morningMoves++;
    else existing.afternoonMoves++;
    existing.total++;
    teacherTimePatterns.set(teacherId, existing);
  }

  for (const [teacherId, pattern] of teacherTimePatterns) {
    if (pattern.total < 2) continue; // Need at least 2 data points

    const morningPref = pattern.morningMoves / pattern.total;
    const afternoonPref = pattern.afternoonMoves / pattern.total;
    const confidence = Math.min(0.95, 0.3 + (pattern.total * 0.1));

    if (morningPref > 0.65) {
      const pref: LearnedPreference = {
        type: "TEACHER_TIME_PREFERENCE",
        key: `teacher:${teacherId}:morning`,
        value: { teacherId, preference: "MORNING", strength: morningPref },
        confidence,
        count: pattern.total,
      };
      learned.push(pref);
      await upsertPreference(organizationId, pref);
    } else if (afternoonPref > 0.65) {
      const pref: LearnedPreference = {
        type: "TEACHER_TIME_PREFERENCE",
        key: `teacher:${teacherId}:afternoon`,
        value: { teacherId, preference: "AFTERNOON", strength: afternoonPref },
        confidence,
        count: pattern.total,
      };
      learned.push(pref);
      await upsertPreference(organizationId, pref);
    }
  }

  // Analyze subject distribution patterns
  const subjectPatterns = new Map<string, Map<string, number>>();
  for (const change of teacherMoves) {
    const newState = change.newState as Record<string, unknown> | null;
    if (!newState) continue;

    const subjectId = newState.subjectId as string;
    const day = newState.day as string;
    if (!subjectId || !day) continue;

    const dayMap = subjectPatterns.get(subjectId) ?? new Map();
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    subjectPatterns.set(subjectId, dayMap);
  }

  for (const [subjectId, dayMap] of subjectPatterns) {
    const totalMoves = Array.from(dayMap.values()).reduce((a, b) => a + b, 0);
    if (totalMoves < 2) continue;

    const preferredDays = Array.from(dayMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([day]) => day);

    const pref: LearnedPreference = {
      type: "SUBJECT_DISTRIBUTION",
      key: `subject:${subjectId}:days`,
      value: { subjectId, preferredDays, distribution: Object.fromEntries(dayMap) },
      confidence: Math.min(0.9, 0.3 + (totalMoves * 0.08)),
      count: totalMoves,
    };
    learned.push(pref);
    await upsertPreference(organizationId, pref);
  }

  return learned;
}

// ─── Preference Storage ──────────────────────────────────

async function upsertPreference(
  organizationId: string,
  pref: LearnedPreference,
) {
  const existing = await db
    .select()
    .from(timetableAiPreference)
    .where(
      and(
        eq(timetableAiPreference.organizationId, organizationId),
        eq(timetableAiPreference.key, pref.key),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(timetableAiPreference)
      .set({
        value: pref.value,
        confidence: pref.confidence,
        learnedFromCount: pref.count,
        lastUpdated: new Date(),
      })
      .where(eq(timetableAiPreference.id, existing[0].id));
  } else {
    await db.insert(timetableAiPreference).values({
      organizationId,
      preferenceType: pref.type as "TEACHER_TIME_PREFERENCE" | "SUBJECT_DISTRIBUTION" | "ROOM_ASSIGNMENT_PATTERN" | "ADMIN_SCHEDULING_HABIT" | "CONFLICT_RESOLUTION_PATTERN",
      key: pref.key,
      value: pref.value,
      confidence: pref.confidence,
      learnedFromCount: pref.count,
    });
  }
}

// ─── Get Learned Preferences ─────────────────────────────

export async function getLearnedPreferences(
  organizationId: string,
): Promise<LearnedPreference[]> {
  const prefs = await db
    .select()
    .from(timetableAiPreference)
    .where(eq(timetableAiPreference.organizationId, organizationId));

  return prefs.map((p) => ({
    type: p.preferenceType,
    key: p.key,
    value: p.value as Record<string, unknown>,
    confidence: p.confidence,
    count: p.learnedFromCount,
  }));
}

// ─── Record a Change ─────────────────────────────────────

export async function recordChange(
  timetableId: string,
  userId: string,
  changeType: "SLOT_MOVE" | "SLOT_SWAP" | "SLOT_CLEAR" | "SLOT_ASSIGN" | "BULK_CHANGE" | "AI_COMMAND" | "REGENERATE",
  description: string,
  previousState?: Record<string, unknown>,
  newState?: Record<string, unknown>,
  aiCommand?: string,
) {
  await db.insert(timetableChangeLog).values({
    timetableId,
    userId,
    changeType,
    description,
    previousState: previousState ?? null,
    newState: newState ?? null,
    aiCommand: aiCommand ?? null,
  });
}
