import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { managementNotice } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

const updateNoticeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(5000).optional(),
  eventDate: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  examStartDate: z.string().datetime().nullable().optional(),
  examEndDate: z.string().datetime().nullable().optional(),
  examSubjects: z.array(z.object({
    subject: z.string().min(1),
    date: z.string(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  })).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
    const organizationId = access.activeOrganizationId!;
    const { id } = await params;

    const body = await request.json();
    const parsed = updateNoticeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Verify notice belongs to this org
    const [existing] = await db
      .select({ id: managementNotice.id })
      .from(managementNotice)
      .where(
        and(
          eq(managementNotice.id, id),
          eq(managementNotice.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Notice not found" }, { status: 404 });
    }

    const updateValues: Record<string, unknown> = {};
    if (data.title !== undefined) updateValues.title = data.title;
    if (data.message !== undefined) updateValues.message = data.message;
    if (data.eventDate !== undefined) updateValues.eventDate = data.eventDate ? new Date(data.eventDate) : null;
    if (data.expiresAt !== undefined) updateValues.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    if (data.examStartDate !== undefined) updateValues.examStartDate = data.examStartDate ? new Date(data.examStartDate) : null;
    if (data.examEndDate !== undefined) updateValues.examEndDate = data.examEndDate ? new Date(data.examEndDate) : null;
    if (data.examSubjects !== undefined) updateValues.examSubjects = data.examSubjects ? JSON.stringify(data.examSubjects) : null;

    if (Object.keys(updateValues).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const [updated] = await db
      .update(managementNotice)
      .set(updateValues)
      .where(eq(managementNotice.id, id))
      .returning();

    return NextResponse.json({ notice: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Update notice error:", error);
    return NextResponse.json({ error: "Failed to update notice" }, { status: 500 });
  }
}
