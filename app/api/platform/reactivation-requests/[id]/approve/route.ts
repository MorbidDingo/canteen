import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, organizationReactivationRequest } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER", "PLATFORM_SUPPORT"],
    });

    const { id } = await params;
    const now = new Date();

    const result = await db.transaction(async (tx) => {
      const [requestRow] = await tx
        .select({
          id: organizationReactivationRequest.id,
          organizationId: organizationReactivationRequest.organizationId,
          status: organizationReactivationRequest.status,
        })
        .from(organizationReactivationRequest)
        .where(eq(organizationReactivationRequest.id, id))
        .limit(1);

      if (!requestRow) {
        return { code: "NOT_FOUND" as const };
      }

      if (requestRow.status !== "PENDING") {
        return { code: "NOT_PENDING" as const };
      }

      const [updatedOrg] = await tx
        .update(organization)
        .set({
          status: "ACTIVE",
          suspendedAt: null,
          suspensionReason: null,
          updatedAt: now,
        })
        .where(eq(organization.id, requestRow.organizationId))
        .returning({ id: organization.id, name: organization.name, status: organization.status });

      await tx
        .update(organizationReactivationRequest)
        .set({
          status: "APPROVED",
          reviewedByUserId: access.actorUserId,
          reviewedAt: now,
          reviewNotes: "Approved by platform owner",
          updatedAt: now,
        })
        .where(eq(organizationReactivationRequest.id, id));

      return { code: "OK" as const, organization: updatedOrg };
    });

    if (result.code === "NOT_FOUND") {
      return NextResponse.json({ error: "Reactivation request not found" }, { status: 404 });
    }

    if (result.code === "NOT_PENDING") {
      return NextResponse.json({ error: "Reactivation request is not pending" }, { status: 400 });
    }

    return NextResponse.json({ success: true, organization: result.organization });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Approve reactivation request error:", error);
    return NextResponse.json({ error: "Failed to approve reactivation request" }, { status: 500 });
  }
}
