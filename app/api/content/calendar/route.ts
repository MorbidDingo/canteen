import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentPost, managementNotice, schoolHoliday } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, or, isNotNull } from "drizzle-orm";
import { requireAccess } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  const access = await requireAccess({
    scope: "organization",
    allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "OPERATOR", "LIB_OPERATOR", "ATTENDANCE", "PARENT", "GENERAL"],
  });
  const organizationId = access.activeOrganizationId!;

  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month"); // YYYY-MM
  
  let startDate: Date;
  let endDate: Date;
  
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [year, month] = monthParam.split("-").map(Number);
    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0, 23, 59, 59);
  } else {
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  }

  const [assignments, notices, holidays] = await Promise.all([
    // Assignments with due dates in range
    db
      .select({
        id: contentPost.id,
        title: contentPost.title,
        dueAt: contentPost.dueAt,
        type: contentPost.type,
      })
      .from(contentPost)
      .where(
        and(
          eq(contentPost.organizationId, organizationId),
          eq(contentPost.status, "PUBLISHED"),
          isNotNull(contentPost.dueAt),
          gte(contentPost.dueAt, startDate),
          lte(contentPost.dueAt, endDate),
        )
      ),

    // Notices with event dates in range
    db
      .select({
        id: managementNotice.id,
        title: managementNotice.title,
        eventDate: managementNotice.eventDate,
        category: managementNotice.category,
      })
      .from(managementNotice)
      .where(
        and(
          eq(managementNotice.organizationId, organizationId),
          isNotNull(managementNotice.eventDate),
          gte(managementNotice.eventDate, startDate),
          lte(managementNotice.eventDate, endDate),
        )
      ),

    // School holidays overlapping with range
    db
      .select({
        id: schoolHoliday.id,
        title: schoolHoliday.title,
        startDate: schoolHoliday.startDate,
        endDate: schoolHoliday.endDate,
        description: schoolHoliday.description,
      })
      .from(schoolHoliday)
      .where(
        and(
          eq(schoolHoliday.organizationId, organizationId),
          lte(schoolHoliday.startDate, endDate),
          or(
            gte(schoolHoliday.startDate, startDate),
            gte(schoolHoliday.endDate, startDate),
          ),
        )
      ),
  ]);

  // Normalize into CalendarEvent[]
  type CalendarEvent = {
    id: string;
    title: string;
    date: string;
    endDate?: string;
    type: "assignment" | "notice" | "holiday" | "exam";
    postType?: string;
    category?: string;
  };

  const events: CalendarEvent[] = [];

  for (const a of assignments) {
    if (a.dueAt) {
      events.push({
        id: a.id,
        title: a.title,
        date: a.dueAt.toISOString(),
        type: "assignment",
        postType: a.type,
      });
    }
  }

  for (const n of notices) {
    if (n.eventDate) {
      events.push({
        id: n.id,
        title: n.title,
        date: n.eventDate.toISOString(),
        type: n.category === "EXAM" ? "exam" : "notice",
        category: n.category ?? "GENERAL",
      });
    }
  }

  for (const h of holidays) {
    events.push({
      id: h.id,
      title: h.title,
      date: h.startDate.toISOString(),
      endDate: h.endDate?.toISOString(),
      type: "holiday",
      ...(h.description ? {} : {}),
    });
  }

  return NextResponse.json({ events });
}
