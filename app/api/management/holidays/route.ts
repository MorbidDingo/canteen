import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { schoolHoliday, user } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

const createHolidaySchema = z.object({
  title: z.string().min(1).max(200),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  description: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;

    const body = await request.json();
    const parsed = createHolidaySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const [holiday] = await db
      .insert(schoolHoliday)
      .values({
        organizationId,
        createdBy: access.actorUserId,
        title: data.title,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        description: data.description ?? null,
      })
      .returning();

    return NextResponse.json({ holiday });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Create holiday error:", error);
    return NextResponse.json({ error: "Failed to create holiday" }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;

    const holidays = await db
      .select({
        id: schoolHoliday.id,
        title: schoolHoliday.title,
        startDate: schoolHoliday.startDate,
        endDate: schoolHoliday.endDate,
        description: schoolHoliday.description,
        createdAt: schoolHoliday.createdAt,
        createdByName: user.name,
      })
      .from(schoolHoliday)
      .leftJoin(user, eq(schoolHoliday.createdBy, user.id))
      .where(eq(schoolHoliday.organizationId, organizationId))
      .orderBy(desc(schoolHoliday.startDate));

    return NextResponse.json({ holidays });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("List holidays error:", error);
    return NextResponse.json({ error: "Failed to list holidays" }, { status: 500 });
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
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await db
      .delete(schoolHoliday)
      .where(and(eq(schoolHoliday.id, id), eq(schoolHoliday.organizationId, organizationId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Delete holiday error:", error);
    return NextResponse.json({ error: "Failed to delete holiday" }, { status: 500 });
  }
}
