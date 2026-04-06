import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timetable, timetableSlot, timetableTeacherSubject } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { generateTimetable } from "@/lib/ml/timetable-scheduler";

export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;
    const body = await request.json();

    const { configId, name } = body;

    if (!configId) {
      return NextResponse.json({ error: "Config ID is required" }, { status: 400 });
    }

    // Create timetable record
    const [tt] = await db.insert(timetable).values({
      organizationId,
      configId,
      name: name?.trim() || `Timetable ${new Date().toLocaleDateString()}`,
      status: "DRAFT",
      generationMethod: "AI",
      createdBy: access.actorUserId,
    }).returning();

    // Generate the timetable
    const result = await generateTimetable(organizationId, configId, tt.id, access.actorUserId);

    // Update with results
    await db
      .update(timetable)
      .set({
        conflictCount: result.conflicts.length,
        score: result.score,
        aiExplanation: result.explanation,
        metadata: result.stats as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(timetable.id, tt.id));

    return NextResponse.json({
      timetable: { ...tt, conflictCount: result.conflicts.length, score: result.score, aiExplanation: result.explanation },
      result,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Generate timetable error:", error);
    return NextResponse.json({ error: "Failed to generate timetable" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;

    const timetables = await db.query.timetable.findMany({
      where: eq(timetable.organizationId, organizationId),
      with: { config: true },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    return NextResponse.json({ timetables });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch timetables" }, { status: 500 });
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
    const { id, status: newStatus } = body;

    if (!id) return NextResponse.json({ error: "Timetable ID is required" }, { status: 400 });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (newStatus) {
      updates.status = newStatus;
      if (newStatus === "ACTIVE") updates.publishedAt = new Date();
    }

    const [updated] = await db
      .update(timetable)
      .set(updates)
      .where(and(eq(timetable.id, id), eq(timetable.organizationId, organizationId)))
      .returning();

    if (!updated) return NextResponse.json({ error: "Timetable not found" }, { status: 404 });
    return NextResponse.json({ timetable: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update timetable" }, { status: 500 });
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

    if (!id) return NextResponse.json({ error: "Timetable ID is required" }, { status: 400 });

    await db.delete(timetable).where(and(eq(timetable.id, id), eq(timetable.organizationId, organizationId)));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to delete timetable" }, { status: 500 });
  }
}
