import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
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
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const reason = body.reason?.trim() || "Suspended by platform owner";

    const [updated] = await db
      .update(organization)
      .set({
        status: "SUSPENDED",
        suspendedAt: new Date(),
        suspensionReason: reason,
        updatedAt: new Date(),
      })
      .where(and(eq(organization.id, id), eq(organization.status, "ACTIVE")))
      .returning({
        id: organization.id,
        name: organization.name,
        status: organization.status,
        suspendedAt: organization.suspendedAt,
        suspensionReason: organization.suspensionReason,
      });

    if (!updated) {
      return NextResponse.json({ error: "Organization not found or not active" }, { status: 404 });
    }

    return NextResponse.json({ success: true, organization: updated, actorUserId: access.actorUserId });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Suspend organization error:", error);
    return NextResponse.json({ error: "Failed to suspend organization" }, { status: 500 });
  }
}
