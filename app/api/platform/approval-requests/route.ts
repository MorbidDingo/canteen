import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationApprovalRequest, user } from "@/lib/db/schema";
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
            eq(organizationApprovalRequest.status, status as "PENDING" | "APPROVED" | "REJECTED"),
            ilike(organizationApprovalRequest.requestedName, `%${q}%`),
          )
        : q
          ? ilike(organizationApprovalRequest.requestedName, `%${q}%`)
          : eq(organizationApprovalRequest.status, status as "PENDING" | "APPROVED" | "REJECTED");

    const requests = await db
      .select({
        id: organizationApprovalRequest.id,
        applicantUserId: organizationApprovalRequest.applicantUserId,
        applicantName: user.name,
        applicantEmail: user.email,
        requestedName: organizationApprovalRequest.requestedName,
        requestedSlug: organizationApprovalRequest.requestedSlug,
        status: organizationApprovalRequest.status,
        reviewedByUserId: organizationApprovalRequest.reviewedByUserId,
        reviewedAt: organizationApprovalRequest.reviewedAt,
        reviewNotes: organizationApprovalRequest.reviewNotes,
        createdAt: organizationApprovalRequest.createdAt,
      })
      .from(organizationApprovalRequest)
      .innerJoin(user, eq(organizationApprovalRequest.applicantUserId, user.id))
      .where(whereClause)
      .orderBy(desc(organizationApprovalRequest.createdAt), asc(organizationApprovalRequest.requestedName))
      .limit(500);

    return NextResponse.json({ requests });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Platform approval requests list error:", error);
    return NextResponse.json({ error: "Failed to fetch approval requests" }, { status: 500 });
  }
}
