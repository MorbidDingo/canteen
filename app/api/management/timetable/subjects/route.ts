import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timetableSubject } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;

    const subjects = await db
      .select()
      .from(timetableSubject)
      .where(eq(timetableSubject.organizationId, organizationId));

    return NextResponse.json({ subjects });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch subjects" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;
    const body = await request.json();

    const { name, shortCode, color, periodsPerWeek, requiresLab, isElective, preferMorning, preferAfternoon, maxConsecutive } = body;

    if (!name?.trim() || !shortCode?.trim()) {
      return NextResponse.json({ error: "Name and short code are required" }, { status: 400 });
    }

    const [subject] = await db.insert(timetableSubject).values({
      organizationId,
      name: name.trim(),
      shortCode: shortCode.trim().toUpperCase(),
      color: color || "#6366f1",
      periodsPerWeek: periodsPerWeek ?? 5,
      requiresLab: requiresLab ?? false,
      isElective: isElective ?? false,
      preferMorning: preferMorning ?? false,
      preferAfternoon: preferAfternoon ?? false,
      maxConsecutive: maxConsecutive ?? 2,
    }).returning();

    return NextResponse.json({ subject }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to create subject" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: "Subject ID is required" }, { status: 400 });
    if (updates.shortCode) updates.shortCode = updates.shortCode.trim().toUpperCase();
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(timetableSubject)
      .set(updates)
      .where(and(eq(timetableSubject.id, id), eq(timetableSubject.organizationId, organizationId)))
      .returning();

    if (!updated) return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    return NextResponse.json({ subject: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update subject" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "Subject ID is required" }, { status: 400 });

    await db.delete(timetableSubject).where(and(eq(timetableSubject.id, id), eq(timetableSubject.organizationId, organizationId)));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to delete subject" }, { status: 500 });
  }
}
