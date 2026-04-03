import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  managementNotice,
  noticeAcknowledgment,
  organizationMembership,
  child,
  user,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { broadcast } from "@/lib/sse";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

const TARGET_TYPES = ["ALL_PARENTS", "ALL_GENERAL", "ALL_USERS", "SPECIFIC_CLASS", "SPECIFIC_USERS"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

const NOTICE_CATEGORIES = ["GENERAL", "EXAM", "EVENT", "HOLIDAY_ANNOUNCEMENT"] as const;
type NoticeCategory = (typeof NOTICE_CATEGORIES)[number];

const createNoticeSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  category: z.enum(NOTICE_CATEGORIES).optional().default("GENERAL"),
  targetType: z.enum(TARGET_TYPES),
  targetClass: z.string().optional(),
  targetUserIds: z.array(z.string()).optional(),
  eventDate: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;

    const body = await request.json();
    const parsed = createNoticeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    if (data.targetType === "SPECIFIC_CLASS" && !data.targetClass) {
      return NextResponse.json(
        { error: "targetClass is required when targetType is SPECIFIC_CLASS" },
        { status: 400 },
      );
    }

    if (data.targetType === "SPECIFIC_USERS" && (!data.targetUserIds || data.targetUserIds.length === 0)) {
      return NextResponse.json(
        { error: "targetUserIds must be a non-empty array when targetType is SPECIFIC_USERS" },
        { status: 400 },
      );
    }

    const [notice] = await db
      .insert(managementNotice)
      .values({
        organizationId,
        createdBy: access.actorUserId,
        title: data.title,
        message: data.message,
        category: data.category ?? "GENERAL",
        targetType: data.targetType,
        targetClass: data.targetClass ?? null,
        targetUserIds: data.targetUserIds ? JSON.stringify(data.targetUserIds) : null,
        eventDate: data.eventDate ? new Date(data.eventDate) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      })
      .returning();

    // Broadcast SSE to all connected clients so parent/general accounts refresh
    broadcast("notice-updated", { noticeId: notice.id, organizationId });

    logAudit({
      organizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole ?? "MANAGEMENT",
      action: AUDIT_ACTIONS.NOTICE_CREATED,
      details: { noticeId: notice.id, title: data.title },
      request,
    });

    return NextResponse.json({ notice });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Create notice error:", error);
    return NextResponse.json({ error: "Failed to create notice" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;

    const { searchParams } = new URL(request.url);
    const categoryFilter = searchParams.get("category") as NoticeCategory | null;

    const whereClause = categoryFilter
      ? and(eq(managementNotice.organizationId, organizationId), eq(managementNotice.category, categoryFilter))
      : eq(managementNotice.organizationId, organizationId);

    const notices = await db
      .select({
        id: managementNotice.id,
        title: managementNotice.title,
        message: managementNotice.message,
        category: managementNotice.category,
        targetType: managementNotice.targetType,
        targetClass: managementNotice.targetClass,
        targetUserIds: managementNotice.targetUserIds,
        eventDate: managementNotice.eventDate,
        expiresAt: managementNotice.expiresAt,
        createdAt: managementNotice.createdAt,
        createdByName: user.name,
        ackCount: sql<number>`(
          SELECT COUNT(*) FROM notice_acknowledgment na WHERE na.notice_id = ${managementNotice.id}
        )`.mapWith(Number),
      })
      .from(managementNotice)
      .leftJoin(user, eq(managementNotice.createdBy, user.id))
      .where(whereClause)
      .orderBy(desc(managementNotice.createdAt));

    // For each notice, compute estimated total target count
    const enriched = await Promise.all(
      notices.map(async (n) => {
        let totalTargetCount = 0;
        try {
          const targetType = n.targetType as TargetType;
          if (targetType === "ALL_PARENTS") {
            const [row] = await db
              .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
              .from(organizationMembership)
              .where(
                and(
                  eq(organizationMembership.organizationId, organizationId),
                  eq(organizationMembership.role, "PARENT"),
                  eq(organizationMembership.status, "ACTIVE"),
                ),
              );
            totalTargetCount = row?.count ?? 0;
          } else if (targetType === "ALL_GENERAL") {
            const [row] = await db
              .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
              .from(organizationMembership)
              .where(
                and(
                  eq(organizationMembership.organizationId, organizationId),
                  eq(organizationMembership.role, "GENERAL"),
                  eq(organizationMembership.status, "ACTIVE"),
                ),
              );
            totalTargetCount = row?.count ?? 0;
          } else if (targetType === "ALL_USERS") {
            const [row] = await db
              .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
              .from(organizationMembership)
              .where(
                and(
                  eq(organizationMembership.organizationId, organizationId),
                  inArray(organizationMembership.role, ["PARENT", "GENERAL"]),
                  eq(organizationMembership.status, "ACTIVE"),
                ),
              );
            totalTargetCount = row?.count ?? 0;
          } else if (targetType === "SPECIFIC_CLASS" && n.targetClass) {
            const [row] = await db
              .select({ count: sql<number>`COUNT(DISTINCT ${child.parentId})`.mapWith(Number) })
              .from(child)
              .where(
                and(
                  eq(child.organizationId, organizationId),
                  eq(child.className, n.targetClass),
                ),
              );
            totalTargetCount = row?.count ?? 0;
          } else if (targetType === "SPECIFIC_USERS" && n.targetUserIds) {
            const ids = JSON.parse(n.targetUserIds) as string[];
            totalTargetCount = ids.length;
          }
        } catch {
          // ignore count errors
        }
        return { ...n, totalTargetCount };
      }),
    );

    return NextResponse.json({ notices: enriched });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("List notices error:", error);
    return NextResponse.json({ error: "Failed to list notices" }, { status: 500 });
  }
}
