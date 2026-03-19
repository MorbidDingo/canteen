import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, organizationMembership, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  try {
    await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER", "PLATFORM_SUPPORT"],
    });

    const q = request.nextUrl.searchParams.get("q")?.trim();
    const organizationId = request.nextUrl.searchParams.get("organizationId")?.trim();

    const baseWhere = and(
      inArray(organizationMembership.role, ["OWNER", "ADMIN", "MANAGEMENT"]),
      eq(organizationMembership.status, "ACTIVE"),
    );

    const whereClause =
      q && organizationId
        ? and(
            baseWhere,
            eq(organizationMembership.organizationId, organizationId),
            ilike(user.name, `%${q}%`),
          )
        : q
          ? and(baseWhere, ilike(user.name, `%${q}%`))
          : organizationId
            ? and(baseWhere, eq(organizationMembership.organizationId, organizationId))
            : baseWhere;

    const admins = await db
      .select({
        membershipId: organizationMembership.id,
        organizationId: organizationMembership.organizationId,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userPhone: user.phone,
        joinedAt: organizationMembership.joinedAt,
      })
      .from(organizationMembership)
      .innerJoin(user, eq(organizationMembership.userId, user.id))
      .innerJoin(organization, eq(organizationMembership.organizationId, organization.id))
      .where(whereClause)
      .orderBy(desc(organizationMembership.joinedAt), asc(user.name))
      .limit(1000);

    return NextResponse.json({ admins });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Platform org-admins list error:", error);
    return NextResponse.json({ error: "Failed to fetch organization admins" }, { status: 500 });
  }
}
