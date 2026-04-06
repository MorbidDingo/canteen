import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, organizationApprovalRequest, organizationMembership, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER", "PLATFORM_SUPPORT"],
    });

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { organizationType?: "SCHOOL" | "COLLEGE" | "OTHER" };
    const organizationType = body.organizationType ?? "SCHOOL";

    const [approval] = await db
      .select({
        id: organizationApprovalRequest.id,
        applicantUserId: organizationApprovalRequest.applicantUserId,
        requestedName: organizationApprovalRequest.requestedName,
        requestedSlug: organizationApprovalRequest.requestedSlug,
        status: organizationApprovalRequest.status,
      })
      .from(organizationApprovalRequest)
      .where(eq(organizationApprovalRequest.id, id))
      .limit(1);

    if (!approval) {
      return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
    }

    if (approval.status !== "PENDING") {
      return NextResponse.json({ error: "Approval request is not pending" }, { status: 400 });
    }

    const [existingOrganization] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, approval.requestedSlug))
      .limit(1);

    if (existingOrganization) {
      return NextResponse.json({ error: "Organization slug is already in use" }, { status: 409 });
    }

    const now = new Date();
    const organizationId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(organization).values({
        id: organizationId,
        name: approval.requestedName,
        slug: approval.requestedSlug,
        type: organizationType,
        status: "ACTIVE",
        createdByUserId: approval.applicantUserId,
        approvedByUserId: access.actorUserId,
        approvedAt: now,
        defaultTimezone: "Asia/Kolkata",
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(organizationMembership).values({
        id: crypto.randomUUID(),
        organizationId,
        userId: approval.applicantUserId,
        role: "OWNER",
        status: "ACTIVE",
        invitedByUserId: access.actorUserId,
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await tx
        .update(user)
        .set({ role: "OWNER", updatedAt: now })
        .where(eq(user.id, approval.applicantUserId));

      await tx
        .update(organizationApprovalRequest)
        .set({
          status: "APPROVED",
          reviewedByUserId: access.actorUserId,
          reviewedAt: now,
          reviewNotes: "Approved by platform owner",
          updatedAt: now,
        })
        .where(and(eq(organizationApprovalRequest.id, id), eq(organizationApprovalRequest.status, "PENDING")));
    });

    return NextResponse.json({ success: true, organizationId });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Approve organization request error:", error);
    return NextResponse.json({ error: "Failed to approve organization request" }, { status: 500 });
  }
}
