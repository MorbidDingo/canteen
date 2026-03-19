import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, organizationMembership } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";

async function requireOwnerOfOrganization(organizationId: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("UNAUTHENTICATED");
  }

  const [membership] = await db
    .select({ id: organizationMembership.id })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.userId, session.user.id),
        eq(organizationMembership.role, "OWNER"),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  return session.user.id;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireOwnerOfOrganization(id);

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      slug?: string;
      type?: "SCHOOL" | "COLLEGE" | "OTHER";
      contactEmail?: string | null;
      contactPhone?: string | null;
    };

    const updates: Partial<typeof organization.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      }
      updates.name = name;
    }

    if (typeof body.slug === "string") {
      const slug = body.slug.trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return NextResponse.json(
          { error: "slug can only contain lowercase letters, numbers, and hyphens" },
          { status: 400 },
        );
      }

      const [existingOrg] = await db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.slug, slug))
        .limit(1);

      if (existingOrg && existingOrg.id !== id) {
        return NextResponse.json({ error: "Organization slug already exists" }, { status: 409 });
      }

      updates.slug = slug;
    }

    if (body.type) {
      updates.type = body.type;
    }

    if (body.contactEmail !== undefined) {
      updates.contactEmail = body.contactEmail ? body.contactEmail.trim().toLowerCase() : null;
    }

    if (body.contactPhone !== undefined) {
      updates.contactPhone = body.contactPhone ? body.contactPhone.trim() : null;
    }

    const [updated] = await db
      .update(organization)
      .set(updates)
      .where(eq(organization.id, id))
      .returning({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        type: organization.type,
        status: organization.status,
        contactEmail: organization.contactEmail,
        contactPhone: organization.contactPhone,
        updatedAt: organization.updatedAt,
      });

    if (!updated) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, organization: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Owner access required for this organization" }, { status: 403 });
    }

    console.error("Owner update organization error:", error);
    return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
  }
}
