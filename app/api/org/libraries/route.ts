import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { library } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

// GET — list libraries for active org
export async function GET() {
  try {
    const access = await requireAccess({ scope: "organization" });

    const libraries = await db
      .select()
      .from(library)
      .where(eq(library.organizationId, access.activeOrganizationId!));

    return NextResponse.json({ libraries });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch libraries" }, { status: 500 });
  }
}

// POST — create library (admin/owner/management only)
export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN", "MANAGEMENT", "OWNER"],
    });

    const body = await request.json();
    const data = createSchema.parse(body);

    const [created] = await db
      .insert(library)
      .values({
        organizationId: access.activeOrganizationId!,
        name: data.name,
        description: data.description ?? null,
        location: data.location ?? null,
      })
      .returning();

    return NextResponse.json({ library: created }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create library" }, { status: 500 });
  }
}

// PUT — update library
export async function PUT(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN", "MANAGEMENT", "OWNER"],
    });

    const body = await request.json();
    const data = updateSchema.parse(body);

    const [updated] = await db
      .update(library)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.status !== undefined && { status: data.status }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(library.id, data.id),
          eq(library.organizationId, access.activeOrganizationId!),
        ),
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Library not found" }, { status: 404 });
    }

    return NextResponse.json({ library: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update library" }, { status: 500 });
  }
}
