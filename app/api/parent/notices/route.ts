import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  managementNotice,
  noticeAcknowledgment,
  child,
} from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET(_request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["PARENT", "GENERAL"],
    });
    const organizationId = access.activeOrganizationId!;
    const userId = access.actorUserId;
    const role = access.membershipRole!; // PARENT or GENERAL

    // Fetch all active notices for this org
    const now = new Date();
    const allNotices = await db
      .select()
      .from(managementNotice)
      .where(eq(managementNotice.organizationId, organizationId))
      .orderBy(desc(managementNotice.createdAt));

    // Filter notices that are not yet expired
    const activeNotices = allNotices.filter(
      (n) => !n.expiresAt || new Date(n.expiresAt) > now,
    );

    // Get classes of this user's children (for SPECIFIC_CLASS targeting)
    const childrenRows = await db
      .select({ className: child.className })
      .from(child)
      .where(and(eq(child.parentId, userId), eq(child.organizationId, organizationId)));

    const childClasses = new Set(
      childrenRows.map((c) => c.className).filter((c): c is string => Boolean(c)),
    );

    // Determine which notices are targeted at this user
    const relevantNotices = activeNotices.filter((n) => {
      switch (n.targetType) {
        case "ALL_PARENTS":
          return role === "PARENT";
        case "ALL_GENERAL":
          return role === "GENERAL";
        case "ALL_USERS":
          return role === "PARENT" || role === "GENERAL";
        case "SPECIFIC_CLASS":
          return n.targetClass ? childClasses.has(n.targetClass) : false;
        case "SPECIFIC_USERS": {
          if (!n.targetUserIds) return false;
          try {
            const ids = JSON.parse(n.targetUserIds) as string[];
            return ids.includes(userId);
          } catch {
            return false;
          }
        }
        default:
          return false;
      }
    });

    if (relevantNotices.length === 0) {
      return NextResponse.json({ notices: [] });
    }

    // Fetch acknowledgment status for this user
    const noticeIds = relevantNotices.map((n) => n.id);
    const acks = await db
      .select({ noticeId: noticeAcknowledgment.noticeId })
      .from(noticeAcknowledgment)
      .where(
        and(
          eq(noticeAcknowledgment.userId, userId),
          inArray(noticeAcknowledgment.noticeId, noticeIds),
        ),
      );

    const ackedIds = new Set(acks.map((a) => a.noticeId));

    const result = relevantNotices.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      targetType: n.targetType,
      createdAt: n.createdAt,
      acknowledged: ackedIds.has(n.id),
    }));

    return NextResponse.json({ notices: result });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Get parent notices error:", error);
    return NextResponse.json({ error: "Failed to get notices" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["PARENT", "GENERAL"],
    });
    const organizationId = access.activeOrganizationId!;
    const userId = access.actorUserId;

    const body = await request.json() as unknown;
    const parsed = z.object({ noticeId: z.string().min(1) }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "noticeId is required" }, { status: 400 });
    }
    const { noticeId } = parsed.data;

    // Verify the notice belongs to this org
    const [notice] = await db
      .select({ id: managementNotice.id })
      .from(managementNotice)
      .where(
        and(
          eq(managementNotice.id, noticeId),
          eq(managementNotice.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!notice) {
      return NextResponse.json({ error: "Notice not found" }, { status: 404 });
    }

    // Upsert acknowledgment (ignore if already acknowledged)
    await db
      .insert(noticeAcknowledgment)
      .values({ noticeId, userId })
      .onConflictDoNothing();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Acknowledge notice error:", error);
    return NextResponse.json({ error: "Failed to acknowledge notice" }, { status: 500 });
  }
}
