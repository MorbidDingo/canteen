import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { child, parentNotification, user } from "@/lib/db/schema";
import { broadcast } from "@/lib/sse";
import { sendMessage } from "@/lib/messaging-service";

export type ParentNotificationType =
  | "KIOSK_ORDER_GIVEN"
  | "KIOSK_PREORDER_TAKEN"
  | "KIOSK_ORDER_PREPARING"
  | "KIOSK_ORDER_SERVED"
  | "KIOSK_ORDER_CANCELLED"
  | "GATE_ENTRY"
  | "GATE_EXIT"
  | "LIBRARY_ISSUE"
  | "LIBRARY_RETURN"
  | "LIBRARY_REISSUE"
  | "BLOCKED_FOOD_ATTEMPT"
  | "BLOCKED_BOOK_ATTEMPT"
  | "ANOMALY_SPENDING_SPIKE"
  | "ANOMALY_SKIPPED_MEAL"
  | "ANOMALY_RESTRICTED_ATTEMPT"
  | "ANOMALY_TIMING_ANOMALY"
  | "PAYMENT_EVENT_CREATED"
  | "PAYMENT_EVENT_REMINDER"
  | "PAYMENT_COMPLETED";

export type ParentNotificationMetadata = Record<string, unknown>;

export async function notifyParentForChild(input: {
  childId: string;
  type: ParentNotificationType;
  title: string;
  message: string;
  metadata?: ParentNotificationMetadata;
}) {
  const rows = await db
    .select({
      parentId: child.parentId,
      childName: child.name,
      childGrNumber: child.grNumber,
    })
    .from(child)
    .where(eq(child.id, input.childId))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const parentId = rows[0].parentId;
  const [created] = await db
    .insert(parentNotification)
    .values({
      parentId,
      childId: input.childId,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    })
    .returning();

  const payload = {
    id: created.id,
    parentId,
    childId: created.childId,
    type: created.type,
    title: created.title,
    message: created.message,
    metadata: created.metadata,
    readAt: created.readAt,
    createdAt: created.createdAt,
    childName: rows[0].childName,
    childGrNumber: rows[0].childGrNumber,
  };

  broadcast("parent-notification", payload);

  // ─── Send SMS/WhatsApp Message ──────────────────────
  // Fetch parent's phone number and send message asynchronously
  // This should not block the notification creation
  try {
    const parentUser = await db
      .select({
        phone: user.phone,
      })
      .from(user)
      .where(eq(user.id, parentId))
      .limit(1);

    if (parentUser.length > 0 && parentUser[0].phone) {
      // Send message asynchronously without awaiting
      sendMessage({
        parentId,
        childId: input.childId,
        phoneNumber: parentUser[0].phone,
        notificationType: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata,
      }).catch((error) => {
        console.error(
          `[Messaging] Failed to send ${input.type} notification to parent ${parentId}:`,
          error,
        );
      });
    }
  } catch (error) {
    // Log error but don't fail the notification creation
    console.error(
      `[Messaging] Error sending SMS/WhatsApp for notification ${input.type}:`,
      error,
    );
  }

  return payload;
}

export async function getParentNotifications(parentId: string, limit = 30) {
  const rows = await db
    .select({
      id: parentNotification.id,
      type: parentNotification.type,
      title: parentNotification.title,
      message: parentNotification.message,
      metadata: parentNotification.metadata,
      readAt: parentNotification.readAt,
      createdAt: parentNotification.createdAt,
      childId: child.id,
      childName: child.name,
      childGrNumber: child.grNumber,
    })
    .from(parentNotification)
    .innerJoin(child, eq(child.id, parentNotification.childId))
    .where(eq(parentNotification.parentId, parentId))
    .orderBy(desc(parentNotification.createdAt))
    .limit(limit);

  return rows;
}

export async function markParentNotificationsRead(parentId: string, notificationId?: string) {
  const now = new Date();

  if (notificationId) {
    await db
      .update(parentNotification)
      .set({ readAt: now })
      .where(
        and(
          eq(parentNotification.parentId, parentId),
          eq(parentNotification.id, notificationId),
          isNull(parentNotification.readAt),
        ),
      );
    return;
  }

  await db
    .update(parentNotification)
    .set({ readAt: now })
    .where(and(eq(parentNotification.parentId, parentId), isNull(parentNotification.readAt)));
}
