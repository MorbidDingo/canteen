import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, organizationMembership } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await db
    .select({
      membershipId: organizationMembership.id,
      organizationId: organizationMembership.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      organizationStatus: organization.status,
      role: organizationMembership.role,
      status: organizationMembership.status,
    })
    .from(organizationMembership)
    .innerJoin(organization, eq(organizationMembership.organizationId, organization.id))
    .where(
      and(
        eq(organizationMembership.userId, session.user.id),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    );

  return NextResponse.json({ memberships });
}
