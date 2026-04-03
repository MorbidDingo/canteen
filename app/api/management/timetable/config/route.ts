import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timetableConfig } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;

    const configs = await db
      .select()
      .from(timetableConfig)
      .where(eq(timetableConfig.organizationId, organizationId));

    return NextResponse.json({ configs });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch configs" }, { status: 500 });
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

    const [config] = await db.insert(timetableConfig).values({
      organizationId,
      name: body.name?.trim() || "Default",
      periodsPerDay: body.periodsPerDay ?? 8,
      daysPerWeek: body.daysPerWeek ?? 6,
      periodDurationMinutes: body.periodDurationMinutes ?? 45,
      startTime: body.startTime || "08:00",
      breakAfterPeriod: body.breakAfterPeriod ?? [],
      breakDurationMinutes: body.breakDurationMinutes ?? 15,
      lunchAfterPeriod: body.lunchAfterPeriod ?? 4,
      lunchDurationMinutes: body.lunchDurationMinutes ?? 30,
      activeDays: body.activeDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      createdBy: access.actorUserId,
    }).returning();

    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to create config" }, { status: 500 });
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

    if (!id) return NextResponse.json({ error: "Config ID is required" }, { status: 400 });
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(timetableConfig)
      .set(updates)
      .where(and(eq(timetableConfig.id, id), eq(timetableConfig.organizationId, organizationId)))
      .returning();

    if (!updated) return NextResponse.json({ error: "Config not found" }, { status: 404 });
    return NextResponse.json({ config: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
  }
}
