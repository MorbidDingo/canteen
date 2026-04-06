import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timetableTeacherSubject } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  try {
    await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get("teacherId");

    let assignments;
    if (teacherId) {
      assignments = await db
        .select()
        .from(timetableTeacherSubject)
        .where(eq(timetableTeacherSubject.teacherId, teacherId));
    } else {
      assignments = await db.select().from(timetableTeacherSubject);
    }

    return NextResponse.json({ assignments });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const body = await request.json();
    const { teacherId, subjectId, studentGroupId, isPrimary } = body;

    if (!teacherId || !subjectId) {
      return NextResponse.json({ error: "Teacher ID and Subject ID are required" }, { status: 400 });
    }

    const [assignment] = await db.insert(timetableTeacherSubject).values({
      teacherId,
      subjectId,
      studentGroupId: studentGroupId || null,
      isPrimary: isPrimary ?? true,
    }).returning();

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to create assignment" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Assignment ID is required" }, { status: 400 });

    await db.delete(timetableTeacherSubject).where(eq(timetableTeacherSubject.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to delete assignment" }, { status: 500 });
  }
}
