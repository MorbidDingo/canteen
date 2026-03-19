import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { messagingLog, child, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// GET /api/management/messaging-stats — Get messaging statistics
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const statsOnly = url.searchParams.get("stats") === "true";

  if (statsOnly) {
    return handleStats(request);
  }

  return handleLogs(request);
}

async function handleLogs(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN"],
    });

    if (access.deviceLoginProfile) {
      return NextResponse.json(
        { error: "Messaging logs are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
        { status: 403 },
      );
    }

    const organizationId = access.activeOrganizationId!;

    // Query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const parentId = searchParams.get("parentId");
    const childId = searchParams.get("childId");
    const type = searchParams.get("type"); // WHATSAPP, SMS, FAILED
    const notificationType = searchParams.get("notificationType"); // GATE_ENTRY, KIOSK_ORDER_GIVEN, etc.
    const startDate = searchParams.get("startDate"); // ISO date
    const endDate = searchParams.get("endDate"); // ISO date
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Build where clause
    const where = [];
    where.push(eq(child.organizationId, organizationId));

    if (parentId) {
      where.push(eq(messagingLog.parentId, parentId));
    }

    if (childId) {
      where.push(eq(messagingLog.childId, childId));
    }

    if (type && ["WHATSAPP", "SMS", "FAILED"].includes(type)) {
      where.push(eq(messagingLog.type, type as "WHATSAPP" | "SMS" | "FAILED"));
    }

    if (notificationType) {
      where.push(eq(messagingLog.notificationType, notificationType));
    }

    if (startDate) {
      const start = new Date(startDate);
      where.push(gte(messagingLog.sentAt, start));
    }

    if (endDate) {
      const end = new Date(endDate);
      where.push(lte(messagingLog.sentAt, end));
    }

    const whereCondition = and(...where);

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messagingLog)
      .leftJoin(child, eq(child.id, messagingLog.childId))
      .where(whereCondition);

    const total = Number(countResult?.count || 0);

    // Get logs with pagination
    const logs = await db
      .select({
        id: messagingLog.id,
        parentId: messagingLog.parentId,
        childId: messagingLog.childId,
        parentName: user.name,
        childName: child.name,
        phoneNumber: messagingLog.phoneNumber,
        type: messagingLog.type,
        notificationType: messagingLog.notificationType,
        messageContent: messagingLog.messageContent,
        sentAt: messagingLog.sentAt,
        deliveredAt: messagingLog.deliveredAt,
        failureReason: messagingLog.failureReason,
      })
      .from(messagingLog)
      .leftJoin(user, eq(user.id, messagingLog.parentId))
      .leftJoin(child, eq(child.id, messagingLog.childId))
      .where(whereCondition)
      .orderBy(desc(messagingLog.sentAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      logs,
      pagination: {
        total,
        limit,
        offset,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Failed to get messaging logs:", error);
    return NextResponse.json(
      { error: "Failed to get messaging logs" },
      { status: 500 }
    );
  }
}

// GET /api/management/messaging-stats — Get messaging statistics
async function handleStats(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN"],
    });

    if (access.deviceLoginProfile) {
      return NextResponse.json(
        { error: "Messaging logs are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
        { status: 403 },
      );
    }

    const organizationId = access.activeOrganizationId!;

    const days = parseInt(request.nextUrl.searchParams.get("days") || "7", 10);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get all logs for the period
    const allLogs = await db
      .select({
        type: messagingLog.type,
        notificationType: messagingLog.notificationType,
        sentAt: messagingLog.sentAt,
      })
      .from(messagingLog)
      .leftJoin(child, eq(child.id, messagingLog.childId))
      .where(and(gte(messagingLog.sentAt, startDate), eq(child.organizationId, organizationId)));

    // Calculate stats
    const stats = {
      total: allLogs.length,
      byType: {
        WHATSAPP: 0,
        SMS: 0,
        FAILED: 0,
      },
      byNotificationType: {} as Record<string, number>,
      successRate: 0,
    };

    allLogs.forEach((log) => {
      stats.byType[log.type]++;

      if (!stats.byNotificationType[log.notificationType]) {
        stats.byNotificationType[log.notificationType] = 0;
      }
      stats.byNotificationType[log.notificationType]++;
    });

    const successCount = stats.byType.WHATSAPP + stats.byType.SMS;
    stats.successRate =
      stats.total > 0 ? Math.round((successCount / stats.total) * 100) : 0;

    return NextResponse.json({
      period: `${days} days`,
      stats,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Failed to get messaging stats:", error);
    return NextResponse.json(
      { error: "Failed to get stats" },
      { status: 500 }
    );
  }
}
