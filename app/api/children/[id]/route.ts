import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

// PATCH /api/children/[id] — update a child's info
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "GENERAL") {
    return NextResponse.json(
      { error: "General accounts do not support child management" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = await request.json();
  const { name, grNumber, className, section } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Ensure child belongs to the logged-in parent
  const existing = await db
    .select()
    .from(child)
    .where(and(eq(child.id, id), eq(child.parentId, session.user.id)))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  await db
    .update(child)
    .set({
      name: name.trim(),
      grNumber: grNumber?.trim() || null,
      className: className?.trim() || null,
      section: section?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(child.id, id));

  return NextResponse.json({ success: true });
}
