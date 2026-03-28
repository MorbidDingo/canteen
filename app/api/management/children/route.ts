import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, user } from "@/lib/db/schema";
import { or, ilike, eq, and, isNull, isNotNull, asc } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Child management controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;

  const params = request.nextUrl.searchParams;

  // Mode 1: Return distinct class/section combinations
  if (params.get("classes") === "true") {
    const rows = await db
      .select({ className: child.className, section: child.section })
      .from(child)
      .innerJoin(user, eq(user.id, child.parentId))
      .where(
        and(
          eq(child.organizationId, organizationId),
          isNotNull(child.className),
          or(eq(user.role, "PARENT"), eq(user.role, "GENERAL")),
        ),
      )
      .groupBy(child.className, child.section)
      .orderBy(asc(child.className), asc(child.section));
    return NextResponse.json(rows);
  }

  // Mode 2: Return children by class (for sequential card assignment)
  const className = params.get("class");
  if (className) {
    const sectionParam = params.get("section");
    const noCard = params.get("noCard") === "true";

    const conditions = [eq(child.organizationId, organizationId), eq(child.className, className)];
    if (sectionParam) conditions.push(eq(child.section, sectionParam));
    if (noCard) conditions.push(isNull(child.rfidCardId));

    const results = await db
      .select({
        id: child.id,
        name: child.name,
        grNumber: child.grNumber,
        className: child.className,
        section: child.section,
        rfidCardId: child.rfidCardId,
        parentName: user.name,
        accountRole: user.role,
      })
      .from(child)
      .innerJoin(user, eq(user.id, child.parentId))
      .where(and(or(eq(user.role, "PARENT"), eq(user.role, "GENERAL")), ...conditions))
      .orderBy(asc(child.name));

    return NextResponse.json(results);
  }

  // Mode 3: Search by query (original)
  const q = params.get("q");
  if (!q || q.trim().length < 3) {
    return NextResponse.json({ error: "Search query too short" }, { status: 400 });
  }

  const pattern = `%${q.trim()}%`;

  const results = await db
    .select({
      id: child.id,
      name: child.name,
      grNumber: child.grNumber,
      className: child.className,
      section: child.section,
      rfidCardId: child.rfidCardId,
      parentName: user.name,
      accountRole: user.role,
    })
    .from(child)
    .innerJoin(user, eq(user.id, child.parentId))
    .where(
      and(
        eq(child.organizationId, organizationId),
        or(
          ilike(child.name, pattern),
          ilike(child.grNumber, pattern),
          ilike(user.name, pattern),
        ),
      )
    )
    .limit(20);

  return NextResponse.json(results);
}
