import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationMembership } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";

const ACTIVE_ORG_COOKIE = "activeOrganizationId";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeOrganizationId = request.cookies.get(ACTIVE_ORG_COOKIE)?.value ?? null;
  return NextResponse.json({ activeOrganizationId });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { organizationId?: string };
  let targetOrganizationId = body.organizationId?.trim() || null;

  if (!targetOrganizationId) {
    const [firstMembership] = await db
      .select({ organizationId: organizationMembership.organizationId })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.userId, session.user.id),
          eq(organizationMembership.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (!firstMembership) {
      return NextResponse.json({ error: "No active organization memberships" }, { status: 400 });
    }

    targetOrganizationId = firstMembership.organizationId;
  }

  const [membership] = await db
    .select({ organizationId: organizationMembership.organizationId })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.userId, session.user.id),
        eq(organizationMembership.organizationId, targetOrganizationId),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!membership) {
    return NextResponse.json({ error: "Organization membership not found" }, { status: 403 });
  }

  const response = NextResponse.json({ success: true, activeOrganizationId: targetOrganizationId });
  response.cookies.set(ACTIVE_ORG_COOKIE, targetOrganizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
