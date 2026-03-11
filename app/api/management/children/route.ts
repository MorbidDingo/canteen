import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, user } from "@/lib/db/schema";
import { or, ilike, eq, and, isNull, isNotNull, asc, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;

  // Mode 1: Return distinct class/section combinations
  if (params.get("classes") === "true") {
    const rows = await db
      .select({ className: child.className, section: child.section })
      .from(child)
      .where(isNotNull(child.className))
      .groupBy(child.className, child.section)
      .orderBy(asc(child.className), asc(child.section));
    return NextResponse.json(rows);
  }

  // Mode 2: Return children by class (for sequential card assignment)
  const className = params.get("class");
  if (className) {
    const sectionParam = params.get("section");
    const noCard = params.get("noCard") === "true";

    const conditions = [eq(child.className, className)];
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
      })
      .from(child)
      .innerJoin(user, eq(user.id, child.parentId))
      .where(and(...conditions))
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
    })
    .from(child)
    .innerJoin(user, eq(user.id, child.parentId))
    .where(
      or(
        ilike(child.name, pattern),
        ilike(child.grNumber, pattern),
        ilike(user.name, pattern)
      )
    )
    .limit(20);

  return NextResponse.json(results);
}
