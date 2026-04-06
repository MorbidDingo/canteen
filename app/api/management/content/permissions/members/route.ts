import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizationMembership, user } from "@/lib/db/schema";
import { eq, and, ilike, or } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// GET — search org members to grant permissions to
export async function GET(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Not available on terminal devices", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ members: [] });
  }

  const members = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: organizationMembership.role,
    })
    .from(organizationMembership)
    .innerJoin(user, eq(organizationMembership.userId, user.id))
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.status, "ACTIVE"),
        or(
          ilike(user.name, `%${q}%`),
          ilike(user.email, `%${q}%`),
        ),
      ),
    )
    .limit(20);

  return NextResponse.json({ members });
}
