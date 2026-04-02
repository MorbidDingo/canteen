import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// GET — list distinct class/section combinations for audience builder
export async function GET(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "OPERATOR", "LIB_OPERATOR", "ATTENDANCE", "PARENT", "GENERAL"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const organizationId = access.activeOrganizationId!;

  const rows = await db
    .selectDistinct({ className: child.className, section: child.section })
    .from(child)
    .where(eq(child.organizationId, organizationId))
    .orderBy(child.className, child.section);

  // Group sections by class
  const classMap = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.className) continue;
    const sections = classMap.get(row.className) || [];
    if (row.section && !sections.includes(row.section)) {
      sections.push(row.section);
    }
    classMap.set(row.className, sections);
  }

  const classes = Array.from(classMap.entries()).map(([className, sections]) => ({
    className,
    sections: sections.sort(),
  }));

  return NextResponse.json({ classes });
}
