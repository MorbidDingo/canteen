import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { organizationMembership, user } from "@/lib/db/schema";

// GET /api/operator/payment-events/accounts
// Search parent/general accounts for SELECTED targeting.
export async function GET(req: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OPERATOR", "ADMIN", "MANAGEMENT", "OWNER"],
    });
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  const idsParam = params.get("ids")?.trim() ?? "";
  const limitParam = params.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 40, 200) : 40;

  const requestedIds = idsParam
    ? idsParam.split(",").map((id) => id.trim()).filter(Boolean)
    : [];

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: organizationMembership.role,
    })
    .from(organizationMembership)
    .innerJoin(user, eq(organizationMembership.userId, user.id))
    .where(
      and(
        eq(organizationMembership.organizationId, access.activeOrganizationId!),
        eq(organizationMembership.status, "ACTIVE"),
        inArray(organizationMembership.role, ["PARENT", "GENERAL"]),
        requestedIds.length > 0 ? inArray(organizationMembership.userId, requestedIds) : undefined,
        q
          ? or(
              ilike(user.name, `%${q}%`),
              ilike(user.email, `%${q}%`),
              ilike(user.phone, `%${q}%`),
            )
          : undefined,
      ),
    )
    .orderBy(asc(user.name))
    .limit(limit);

  return NextResponse.json({ accounts: rows });
}
