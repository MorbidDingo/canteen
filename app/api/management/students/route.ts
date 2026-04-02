import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, user, wallet, parentControl, organizationMembership } from "@/lib/db/schema";
import { eq, or, and, ilike, count } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { sanitizeImageUrl } from "@/lib/image-url";
import { MAX_CHILDREN_PER_PARENT } from "@/lib/constants";
import { maskEmail, maskIdentifier, maskName, maskPhone } from "@/lib/privacy";

// GET — list/search students
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
      { error: "Student management controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;

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
        image: child.image,
        parentId: child.parentId,
        parentName: user.name,
        parentEmail: user.email,
        parentPhone: user.phone,
        createdAt: child.createdAt,
      })
      .from(child)
      .innerJoin(user, eq(child.parentId, user.id))
      .innerJoin(
        organizationMembership,
        and(
          eq(organizationMembership.userId, user.id),
          eq(organizationMembership.organizationId, access.activeOrganizationId!),
          eq(organizationMembership.role, "PARENT"),
          eq(organizationMembership.status, "ACTIVE"),
        ),
      )
      .where(
        and(
          eq(child.organizationId, organizationId),
          eq(user.role, "PARENT"),
          or(
            ilike(child.name, `%${q}%`),
            ilike(child.grNumber, `%${q}%`),
            ilike(user.name, `%${q}%`),
          ),
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
        image: child.image,
        parentId: child.parentId,
        parentName: user.name,
        parentEmail: user.email,
        parentPhone: user.phone,
        createdAt: child.createdAt,
      })
      .from(child)
      .innerJoin(user, eq(child.parentId, user.id))
      .innerJoin(
        organizationMembership,
        and(
          eq(organizationMembership.userId, user.id),
          eq(organizationMembership.organizationId, access.activeOrganizationId!),
          eq(organizationMembership.role, "PARENT"),
          eq(organizationMembership.status, "ACTIVE"),
        ),
      )
      .where(and(eq(child.organizationId, organizationId), eq(user.role, "PARENT")))
      .orderBy(child.name)
      .limit(50);
  }

  return NextResponse.json({
    students: students.map((student) => ({
      ...student,
      name: maskName(student.name),
      grNumber: maskIdentifier(student.grNumber),
      parentName: maskName(student.parentName),
      parentEmail: maskEmail(student.parentEmail),
      parentPhone: maskPhone(student.parentPhone),
      image: sanitizeImageUrl(student.image),
    })),
  });
}

// POST — create a new student
export async function POST(request: NextRequest) {
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
      { error: "Student management controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;

  const session = access.session;

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
      .innerJoin(
        organizationMembership,
        and(
          eq(organizationMembership.userId, user.id),
          eq(organizationMembership.organizationId, access.activeOrganizationId!),
          eq(organizationMembership.role, "PARENT"),
          eq(organizationMembership.status, "ACTIVE"),
        ),
      )
      .where(eq(user.id, parentId))
      .limit(1);

    if (!parentUser || parentUser.role !== "PARENT") {
      return NextResponse.json({ error: "Invalid parent" }, { status: 400 });
    }

    const [childrenCount] = await db
      .select({ total: count() })
      .from(child)
      .where(and(eq(child.parentId, parentId), eq(child.organizationId, organizationId)));

    if ((childrenCount?.total ?? 0) >= MAX_CHILDREN_PER_PARENT) {
      return NextResponse.json(
        { error: `A parent can have at most ${MAX_CHILDREN_PER_PARENT} children` },
        { status: 409 },
      );
    }

    // Check for duplicate GR number
    if (grNumber?.trim()) {
      const [existingGr] = await db
        .select({ id: child.id })
        .from(child)
        .where(and(eq(child.grNumber, grNumber.trim()), eq(child.organizationId, organizationId)))
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
          organizationId,
          parentId,
          name: maskName(name),
          grNumber: maskIdentifier(grNumber),
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
      organizationId,
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.STUDENT_CREATED,
      details: { studentId: newChild.id, name: maskName(name), parentId, parentName: maskName(parentUser.name) },
      request,
    });

    return NextResponse.json({ student: newChild }, { status: 201 });
  } catch (error) {
    console.error("Create student error:", error);
    return NextResponse.json({ error: "Failed to create student" }, { status: 500 });
  }
}
