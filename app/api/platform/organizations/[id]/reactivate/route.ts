import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization } from "@/lib/db/schema";
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

    const [updated] = await db
      .update(organization)
      .set({
        status: "ACTIVE",
        suspendedAt: null,
        suspensionReason: null,
        updatedAt: new Date(),
      })
      .where(and(eq(organization.id, id), eq(organization.status, "SUSPENDED")))
      .returning({
        id: organization.id,
        name: organization.name,
        status: organization.status,
        suspendedAt: organization.suspendedAt,
      });

    if (!updated) {
      return NextResponse.json({ error: "Organization not found or not suspended" }, { status: 404 });
    }

    return NextResponse.json({ success: true, organization: updated, actorUserId: access.actorUserId });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Reactivate organization error:", error);
    return NextResponse.json({ error: "Failed to reactivate organization" }, { status: 500 });
  }
}
