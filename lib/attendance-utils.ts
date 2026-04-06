import { db } from "@/lib/db";
import { child, gateLog, bulkPhotoUpload } from "@/lib/db/schema";
import { eq, desc, and, gte, lt } from "drizzle-orm";

/**
 * Attendance and Photo Upload Utilities
 */

// ─── Attendance Queries ───────────────────────────────

export async function getStudentAttendanceToday(childId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const logs = await db
    .select()
    .from(gateLog)
    .where(
      and(
        eq(gateLog.childId, childId),
        gte(gateLog.tappedAt, today),
        lt(gateLog.tappedAt, tomorrow),
      ),
    )
    .orderBy(gateLog.tappedAt);

  return logs;
}

export async function getStudentTotalTimeInside(childId: string, date?: Date) {
  const targetDate = date || new Date();
  targetDate.setHours(0, 0, 0, 0);
  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);

  const logs = await db
    .select()
    .from(gateLog)
    .where(
      and(
        eq(gateLog.childId, childId),
        gte(gateLog.tappedAt, targetDate),
        lt(gateLog.tappedAt, nextDay),
      ),
    )
    .orderBy(gateLog.tappedAt);

  let totalSeconds = 0;
  let currentEntryTime: Date | null = null;

  logs.forEach((log) => {
    if (log.direction === "ENTRY") {
      currentEntryTime = new Date(log.tappedAt);
    } else if (log.direction === "EXIT" && currentEntryTime) {
      const exitTime = new Date(log.tappedAt);
      totalSeconds += Math.floor(
        (exitTime.getTime() - currentEntryTime.getTime()) / 1000,
      );
      currentEntryTime = null;
    }
  });

  // If still inside, add time from last entry to now
  if (currentEntryTime) {
    const now = new Date();
    const entryTime = new Date(currentEntryTime);
    if (now.toDateString() === targetDate.toDateString()) {
      totalSeconds += Math.floor((now.getTime() - entryTime.getTime()) / 1000);
    }
  }

  return totalSeconds;
}

export async function isStudentCurrentlyInside(childId: string): Promise<boolean> {
  const [student] = await db
    .select({ status: child.presenceStatus })
    .from(child)
    .where(eq(child.id, childId));

  return student?.status === "INSIDE";
}

export async function getStudentsInsideWithDuration() {
  const studentsInside = await db
    .select()
    .from(child)
    .where(eq(child.presenceStatus, "INSIDE"));

  const withDuration = studentsInside.map((student) => {
    let duration = 0;
    if (student.lastGateTapAt) {
      duration = Math.floor(
        (Date.now() - new Date(student.lastGateTapAt).getTime()) / 1000,
      );
    }
    return {
      ...student,
      durationSeconds: duration,
      durationFormatted: formatSeconds(duration),
    };
  });

  return withDuration.sort((a, b) => b.durationSeconds - a.durationSeconds);
}

export async function getEarliestArrivals(limit = 10) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const arrivals = await db
    .select({
      childId: gateLog.childId,
      arrivedAt: gateLog.tappedAt,
    })
    .from(gateLog)
    .where(
      and(
        eq(gateLog.direction, "ENTRY"),
        gte(gateLog.tappedAt, today),
      ),
    )
    .orderBy(gateLog.tappedAt)
    .limit(limit);

  const detailedArrivals = await Promise.all(
    arrivals.map(async (arrival) => {
      const [student] = await db
        .select({
          name: child.name,
          grNumber: child.grNumber,
          className: child.className,
        })
        .from(child)
        .where(eq(child.id, arrival.childId));

      return {
        childId: arrival.childId,
        name: student?.name,
        grNumber: student?.grNumber,
        className: student?.className,
        arrivedAt: arrival.arrivedAt,
      };
    }),
  );

  return detailedArrivals;
}

// ─── Bulk Upload Queries ───────────────────────────────

export async function getBulkUploadHistory(userId: string, limit = 10) {
  const uploads = await db
    .select()
    .from(bulkPhotoUpload)
    .where(eq(bulkPhotoUpload.uploadedBy, userId))
    .orderBy(desc(bulkPhotoUpload.createdAt))
    .limit(limit);

  return uploads.map((upload) => ({
    id: upload.id,
    fileName: upload.fileName,
    totalFiles: upload.totalFiles,
    processedFiles: upload.processedFiles,
    failedFiles: upload.failedFiles,
    status: upload.status,
    progress: Math.floor(
      ((upload.processedFiles + upload.failedFiles) / upload.totalFiles) * 100,
    ),
    createdAt: upload.createdAt,
    completedAt: upload.completedAt,
  }));
}

export async function getFailedPhotoUploads(bulkUploadId: string) {
  // This would require a join with photoUploadBatch
  // Left as a migration point for actual implementation
}

// ─── Helper Functions ───────────────────────────────

export function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}
