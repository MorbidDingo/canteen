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

const TARGET_TYPES = ["ALL_PARENTS", "ALL_GENERAL", "ALL_USERS", "SPECIFIC_CLASS", "SPECIFIC_USERS"] as const;
type TargetType = (typeof TARGET_TYPES)[number];

const createNoticeSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  targetType: z.enum(TARGET_TYPES),
  targetClass: z.string().optional(),
  targetUserIds: z.array(z.string()).optional(),
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
        targetType: data.targetType,
        targetClass: data.targetClass ?? null,
        targetUserIds: data.targetUserIds ? JSON.stringify(data.targetUserIds) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      })
      .returning();

    // Broadcast SSE to all connected clients so parent/general accounts refresh
    broadcast("notice-updated", { noticeId: notice.id, organizationId });

    return NextResponse.json({ notice });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Create notice error:", error);
    return NextResponse.json({ error: "Failed to create notice" }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;

    const notices = await db
      .select({
        id: managementNotice.id,
        title: managementNotice.title,
        message: managementNotice.message,
        targetType: managementNotice.targetType,
        targetClass: managementNotice.targetClass,
        targetUserIds: managementNotice.targetUserIds,
        expiresAt: managementNotice.expiresAt,
        createdAt: managementNotice.createdAt,
        createdByName: user.name,
        ackCount: sql<number>`(
          SELECT COUNT(*) FROM notice_acknowledgment na WHERE na.notice_id = ${managementNotice.id}
        )`.mapWith(Number),
      })
      .from(managementNotice)
      .leftJoin(user, eq(managementNotice.createdBy, user.id))
      .where(eq(managementNotice.organizationId, organizationId))
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
