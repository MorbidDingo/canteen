import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { maskIdentifier, maskName } from "@/lib/privacy";

// PATCH /api/children/[id] — update a child's info
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let access;
  try {
    access = await requireLinkedAccount();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const session = access.session;

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
      name: maskName(name),
      grNumber: maskIdentifier(grNumber),
      className: className?.trim() || null,
      section: section?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(child.id, id));

  return NextResponse.json({ success: true });
}
