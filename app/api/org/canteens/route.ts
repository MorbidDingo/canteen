import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { canteen } from "@/lib/db/schema";
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

// GET — list canteens for active org
export async function GET() {
  try {
    const access = await requireAccess({ scope: "organization" });

    const canteens = await db
      .select()
      .from(canteen)
      .where(eq(canteen.organizationId, access.activeOrganizationId!));

    return NextResponse.json({ canteens });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to fetch canteens" }, { status: 500 });
  }
}

// POST — create canteen (admin/owner/management only)
export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN", "MANAGEMENT", "OWNER"],
    });

    const body = await request.json();
    const data = createSchema.parse(body);

    const [created] = await db
      .insert(canteen)
      .values({
        organizationId: access.activeOrganizationId!,
        name: data.name,
        description: data.description ?? null,
        location: data.location ?? null,
      })
      .returning();

    return NextResponse.json({ canteen: created }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create canteen" }, { status: 500 });
  }
}

// PUT — update canteen
export async function PUT(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN", "MANAGEMENT", "OWNER"],
    });

    const body = await request.json();
    const data = updateSchema.parse(body);

    const [updated] = await db
      .update(canteen)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.status !== undefined && { status: data.status }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(canteen.id, data.id),
          eq(canteen.organizationId, access.activeOrganizationId!),
        ),
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Canteen not found" }, { status: 404 });
    }

    return NextResponse.json({ canteen: updated });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update canteen" }, { status: 500 });
  }
}
