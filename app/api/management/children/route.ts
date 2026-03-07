import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, user } from "@/lib/db/schema";
import { or, ilike, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = request.nextUrl.searchParams.get("q");
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
