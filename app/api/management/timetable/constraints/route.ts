import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timetableConstraint } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;

    const constraints = await db
      .select()
      .from(timetableConstraint)
      .where(eq(timetableConstraint.organizationId, organizationId));

    return NextResponse.json({ constraints });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch constraints" }, { status: 500 });
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

    const { type, category, description, weight, parameters } = body;

    if (!type || !category || !description?.trim()) {
      return NextResponse.json({ error: "Type, category, and description are required" }, { status: 400 });
    }

    const [constraint] = await db.insert(timetableConstraint).values({
      organizationId,
      type,
      category,
      description: description.trim(),
      weight: weight ?? 50,
      parameters: parameters ?? {},
    }).returning();

    return NextResponse.json({ constraint }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to create constraint" }, { status: 500 });
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

    if (!id) return NextResponse.json({ error: "Constraint ID is required" }, { status: 400 });
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(timetableConstraint)
      .set(updates)
      .where(and(eq(timetableConstraint.id, id), eq(timetableConstraint.organizationId, organizationId)))
      .returning();

    if (!updated) return NextResponse.json({ error: "Constraint not found" }, { status: 404 });
    return NextResponse.json({ constraint: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update constraint" }, { status: 500 });
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

    if (!id) return NextResponse.json({ error: "Constraint ID is required" }, { status: 400 });

    await db.delete(timetableConstraint).where(and(eq(timetableConstraint.id, id), eq(timetableConstraint.organizationId, organizationId)));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to delete constraint" }, { status: 500 });
  }
}
