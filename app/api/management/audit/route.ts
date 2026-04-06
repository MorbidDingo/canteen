import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog, user } from "@/lib/db/schema";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Audit controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;

  const { searchParams } = new URL(request.url);
  const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50"), 1), 100);
  const actionFilter = searchParams.get("action");
  const actionsFilter = searchParams.get("actions");
  const offset = (page - 1) * limit;

  try {
    const conditions = [];
    conditions.push(eq(auditLog.organizationId, organizationId));
    if (actionsFilter) {
      const actionList = actionsFilter.split(",").filter(Boolean);
      if (actionList.length > 0) {
        conditions.push(inArray(auditLog.action, actionList));
      }
    } else if (actionFilter) {
      conditions.push(eq(auditLog.action, actionFilter));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const logs = await db
      .select({
        id: auditLog.id,
        userId: auditLog.userId,
        userName: user.name,
        userEmail: user.email,
        userRole: auditLog.userRole,
        action: auditLog.action,
        details: auditLog.details,
        ipAddress: auditLog.ipAddress,
        userAgent: auditLog.userAgent,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .innerJoin(user, eq(auditLog.userId, user.id))
      .where(whereClause)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset);

    // Count total for pagination
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditLog)
      .where(whereClause);

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limit),
      },
    });
  } catch (error) {
    console.error("Audit log error:", error);
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
  }
}
