import { db } from "@/lib/db";
import { child, gateLog } from "@/lib/db/schema";
import { eq, desc, and, lte, gte } from "drizzle-orm";

/**
 * Gate utilities for querying presence status and anomalies
 */

export async function getStudentPresence(childId: string) {
  const [student] = await db
    .select({
      id: child.id,
      name: child.name,
      grNumber: child.grNumber,
      className: child.className,
      presenceStatus: child.presenceStatus,
      lastGateTapAt: child.lastGateTapAt,
    })
    .from(child)
    .where(eq(child.id, childId));

  if (!student) return null;

  // Get last few gate logs
  const recentLogs = await db
    .select({
      direction: gateLog.direction,
      tappedAt: gateLog.tappedAt,
      isValid: gateLog.isValid,
      anomalyReason: gateLog.anomalyReason,
    })
    .from(gateLog)
    .where(eq(gateLog.childId, childId))
    .orderBy(desc(gateLog.tappedAt))
    .limit(5);

  return {
    ...student,
    recentActivity: recentLogs,
  };
}

export async function getAllStudentsPresence() {
  const students = await db
    .select({
      id: child.id,
      name: child.name,
      grNumber: child.grNumber,
      className: child.className,
      section: child.section,
      presenceStatus: child.presenceStatus,
      lastGateTapAt: child.lastGateTapAt,
    })
    .from(child)
    .where(eq(child.presenceStatus, "INSIDE"));

  return students;
}

export async function getStudentsInside() {
  return getAllStudentsPresence();
}

export async function getStudentsOutside() {
  const students = await db
    .select({
      id: child.id,
      name: child.name,
      grNumber: child.grNumber,
      className: child.className,
      section: child.section,
      lastGateTapAt: child.lastGateTapAt,
    })
    .from(child)
    .where(eq(child.presenceStatus, "OUTSIDE"));

  return students;
}

export async function getAnomalousGateLogs(since?: Date) {
  const conditions: any[] = [eq(gateLog.isValid, false)];
  
  if (since) {
    conditions.push(gte(gateLog.tappedAt, since));
  }

  return await db
    .select({
      id: gateLog.id,
      childId: gateLog.childId,
      direction: gateLog.direction,
      tappedAt: gateLog.tappedAt,
      anomalyReason: gateLog.anomalyReason,
    })
    .from(gateLog)
    .where(and(...conditions))
    .orderBy(desc(gateLog.tappedAt))
    .limit(since ? 1000 : 100);
}

export async function getDailyPresenceSummary(date: Date) {
  // This requires raw SQL because we need to aggregate by date
  // You could implement this with raw query if needed
  const logs = await db
    .select()
    .from(gateLog)
    .orderBy(desc(gateLog.tappedAt));

  // Group and summarize logs for the given date
  const dateStr = date.toISOString().split("T")[0];

  const summary = new Map<
    string,
    { entries: number; exits: number; lastEntry?: Date; lastExit?: Date }
  >();

  logs.forEach((log) => {
    const logDate = new Date(log.tappedAt).toISOString().split("T")[0];
    if (logDate !== dateStr) return;

    const childId = log.childId;
    if (!summary.has(childId)) {
      summary.set(childId, { entries: 0, exits: 0 });
    }

    const stats = summary.get(childId)!;
    if (log.direction === "ENTRY") {
      stats.entries++;
      stats.lastEntry = new Date(log.tappedAt);
    } else {
      stats.exits++;
      stats.lastExit = new Date(log.tappedAt);
    }
  });

  return summary;
}

export async function validatePresenceConsistency() {
  /**
   * Identifies students with inconsistent state:
   * - presenceStatus = INSIDE but last log is EXIT
   * - presenceStatus = OUTSIDE but last log is ENTRY
   */
  const students = await db.select().from(child);

  const inconsistencies = [];

  for (const student of students) {
    const [lastLog] = await db
      .select({
        direction: gateLog.direction,
      })
      .from(gateLog)
      .where(eq(gateLog.childId, student.id))
      .orderBy(desc(gateLog.tappedAt))
      .limit(1);

    if (!lastLog) continue; // No logs yet

    const isConsistent =
      (student.presenceStatus === "INSIDE" && lastLog.direction === "ENTRY") ||
      (student.presenceStatus === "OUTSIDE" && lastLog.direction === "EXIT");

    if (!isConsistent) {
      inconsistencies.push({
        childId: student.id,
        name: student.name,
        presenceStatus: student.presenceStatus,
        lastLogDirection: lastLog.direction,
      });
    }
  }

  return inconsistencies;
}
