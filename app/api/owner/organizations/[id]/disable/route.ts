import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, organizationMembership } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";

async function requireOwnerOfOrganization(organizationId: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("UNAUTHENTICATED");
  }

  const [membership] = await db
    .select({ id: organizationMembership.id })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.userId, session.user.id),
        eq(organizationMembership.role, "OWNER"),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new Error("FORBIDDEN");
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireOwnerOfOrganization(id);

    const body = (await request.json().catch(() => ({}))) as { reason?: string };

    const [updated] = await db
      .update(organization)
      .set({
        status: "SUSPENDED",
        suspendedAt: new Date(),
        suspensionReason: body.reason?.trim() || "Disabled by organization owner",
        updatedAt: new Date(),
      })
      .where(eq(organization.id, id))
      .returning({ id: organization.id, status: organization.status });

    if (!updated) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, organization: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Owner access required for this organization" }, { status: 403 });
    }

    console.error("Owner disable organization error:", error);
    return NextResponse.json({ error: "Failed to disable organization" }, { status: 500 });
  }
}
