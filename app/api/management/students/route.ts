import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, user, wallet, parentControl } from "@/lib/db/schema";
import { eq, or, ilike, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// GET — list/search students
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  let students;

  if (q && q.length >= 2) {
    students = await db
      .select({
        id: child.id,
        name: child.name,
        grNumber: child.grNumber,
        className: child.className,
        section: child.section,
        rfidCardId: child.rfidCardId,
        parentId: child.parentId,
        parentName: user.name,
        parentEmail: user.email,
        parentPhone: user.phone,
        createdAt: child.createdAt,
      })
      .from(child)
      .innerJoin(user, eq(child.parentId, user.id))
      .where(
        or(
          ilike(child.name, `%${q}%`),
          ilike(child.grNumber, `%${q}%`),
          ilike(user.name, `%${q}%`),
        ),
      )
      .limit(50);
  } else {
    students = await db
      .select({
        id: child.id,
        name: child.name,
        grNumber: child.grNumber,
        className: child.className,
        section: child.section,
        rfidCardId: child.rfidCardId,
        parentId: child.parentId,
        parentName: user.name,
        parentEmail: user.email,
        parentPhone: user.phone,
        createdAt: child.createdAt,
      })
      .from(child)
      .innerJoin(user, eq(child.parentId, user.id))
      .orderBy(child.name)
      .limit(50);
  }

  return NextResponse.json({ students });
}

// POST — create a new student
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, grNumber, className, section, parentId } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Student name is required" }, { status: 400 });
    }

    if (!parentId) {
      return NextResponse.json({ error: "Parent is required" }, { status: 400 });
    }

    // Verify parent exists and has PARENT role
    const [parentUser] = await db
      .select({ id: user.id, role: user.role, name: user.name })
      .from(user)
      .where(eq(user.id, parentId))
      .limit(1);

    if (!parentUser || parentUser.role !== "PARENT") {
      return NextResponse.json({ error: "Invalid parent" }, { status: 400 });
    }

    // Check for duplicate GR number
    if (grNumber?.trim()) {
      const [existingGr] = await db
        .select({ id: child.id })
        .from(child)
        .where(eq(child.grNumber, grNumber.trim()))
        .limit(1);

      if (existingGr) {
        return NextResponse.json({ error: "GR number already exists" }, { status: 409 });
      }
    }

    const newChild = await db.transaction(async (tx) => {
      // Create child
      const [created] = await tx
        .insert(child)
        .values({
          parentId,
          name: name.trim(),
          grNumber: grNumber?.trim() || null,
          className: className?.trim() || null,
          section: section?.trim() || null,
        })
        .returning();

      // Auto-create wallet
      await tx.insert(wallet).values({
        childId: created.id,
        balance: 0,
      });

      // Auto-create parent controls
      await tx.insert(parentControl).values({
        childId: created.id,
        blockedCategories: "[]",
        blockedItemIds: "[]",
      });

      return created;
    });

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.STUDENT_CREATED,
      details: { studentId: newChild.id, name: name.trim(), parentId, parentName: parentUser.name },
      request,
    });

    return NextResponse.json({ student: newChild }, { status: 201 });
  } catch (error) {
    console.error("Create student error:", error);
    return NextResponse.json({ error: "Failed to create student" }, { status: 500 });
  }
}
