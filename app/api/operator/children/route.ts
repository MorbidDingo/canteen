import { NextRequest, NextResponse } from "next/server";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { child } from "@/lib/db/schema";
import { and, asc, eq, ilike, or } from "drizzle-orm";

// GET /api/operator/children?q=<search>
// Returns a list of children in the operator's organization for kiosk usage
export async function GET(req: NextRequest) {
  let access;
  try {
    access = await requireAccess({ scope: "organization", allowedOrgRoles: ["OPERATOR", "ADMIN", "MANAGEMENT", "OWNER"] });
  } catch (err) {
    if (err instanceof AccessDeniedError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

  const rows = await db
    .select({
      id: child.id,
      name: child.name,
      grNumber: child.grNumber,
      className: child.className,
      section: child.section,
    })
    .from(child)
    .where(
      and(
        eq(child.organizationId, access.activeOrganizationId!),
        q
          ? or(
              ilike(child.name, `%${q}%`),
              ilike(child.grNumber, `%${q}%`),
              ilike(child.className, `%${q}%`),
            )
          : undefined,
      ),
    )
    .orderBy(asc(child.name))
    .limit(limit);

  return NextResponse.json({ results: rows });
}
