import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export const AUDIT_ACTIONS = {
  MENU_ITEM_CREATED: "MENU_ITEM_CREATED",
  MENU_ITEM_UPDATED: "MENU_ITEM_UPDATED",
  MENU_ITEM_DELETED: "MENU_ITEM_DELETED",
  ORDER_STATUS_CHANGED: "ORDER_STATUS_CHANGED",
  CARD_ASSIGNED: "CARD_ASSIGNED",
  CARD_UNLINKED: "CARD_UNLINKED",
  STUDENT_CREATED: "STUDENT_CREATED",
  STUDENT_DELETED: "STUDENT_DELETED",
  UNITS_UPDATED: "UNITS_UPDATED",
  UNITS_RESET: "UNITS_RESET",
  PARENT_CREATED: "PARENT_CREATED",
  PARENT_UPDATED: "PARENT_UPDATED",
  PARENT_DELETED: "PARENT_DELETED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  BULK_UPLOAD: "BULK_UPLOAD",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export async function logAudit({
  userId,
  userRole,
  action,
  details,
  request,
}: {
  userId: string;
  userRole: string;
  action: AuditAction;
  details?: Record<string, unknown>;
  request?: Request;
}) {
  try {
    const ipAddress = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request?.headers?.get("x-real-ip")
      || null;
    const userAgent = request?.headers?.get("user-agent") || null;

    await db.insert(auditLog).values({
      userId,
      userRole,
      action,
      details: details ? JSON.stringify(details) : null,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    // Non-critical — don't break the main operation
    console.error("Audit log error:", error);
  }
}
