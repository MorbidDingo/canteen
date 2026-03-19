import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, organizationReactivationRequest, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  try {
    await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER", "PLATFORM_SUPPORT"],
    });

    const q = request.nextUrl.searchParams.get("q")?.trim();
    const status = request.nextUrl.searchParams.get("status")?.trim() || "PENDING";

    const whereClause =
      q && status
        ? and(
            eq(organizationReactivationRequest.status, status as "PENDING" | "APPROVED" | "REJECTED"),
            ilike(organization.name, `%${q}%`),
          )
        : q
          ? ilike(organization.name, `%${q}%`)
          : eq(organizationReactivationRequest.status, status as "PENDING" | "APPROVED" | "REJECTED");

    const requests = await db
      .select({
        id: organizationReactivationRequest.id,
        organizationId: organizationReactivationRequest.organizationId,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        requestedByUserId: organizationReactivationRequest.requestedByUserId,
        requestedByName: user.name,
        requestedByEmail: user.email,
        status: organizationReactivationRequest.status,
        reason: organizationReactivationRequest.reason,
        reviewNotes: organizationReactivationRequest.reviewNotes,
        reviewedByUserId: organizationReactivationRequest.reviewedByUserId,
        reviewedAt: organizationReactivationRequest.reviewedAt,
        createdAt: organizationReactivationRequest.createdAt,
      })
      .from(organizationReactivationRequest)
      .innerJoin(organization, eq(organizationReactivationRequest.organizationId, organization.id))
      .innerJoin(user, eq(organizationReactivationRequest.requestedByUserId, user.id))
      .where(whereClause)
      .orderBy(desc(organizationReactivationRequest.createdAt), asc(organization.name))
      .limit(500);

    return NextResponse.json({ requests });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Platform reactivation requests list error:", error);
    return NextResponse.json({ error: "Failed to fetch reactivation requests" }, { status: 500 });
  }
}
