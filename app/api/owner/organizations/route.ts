import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, organizationMembership, user } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";
import { resolveOwnerPlan } from "@/lib/owner-org-plan";

async function requireOwnerUserId() {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("UNAUTHENTICATED");
  }

  const [ownerMembership] = await db
    .select({ organizationId: organizationMembership.organizationId })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.userId, session.user.id),
        eq(organizationMembership.role, "OWNER"),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!ownerMembership) {
    throw new Error("FORBIDDEN");
  }

  return session.user.id;
}

export async function GET() {
  try {
    const ownerUserId = await requireOwnerUserId();

    const organizations = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        type: organization.type,
        status: organization.status,
        contactEmail: organization.contactEmail,
        contactPhone: organization.contactPhone,
        suspensionReason: organization.suspensionReason,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
      })
      .from(organizationMembership)
      .innerJoin(organization, eq(organizationMembership.organizationId, organization.id))
      .where(
        and(
          eq(organizationMembership.userId, ownerUserId),
          eq(organizationMembership.role, "OWNER"),
          eq(organizationMembership.status, "ACTIVE"),
          ne(organization.status, "CLOSED"),
        ),
      );

    const plan = await resolveOwnerPlan(ownerUserId);

    return NextResponse.json({ organizations, plan });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }

    console.error("Owner organizations list error:", error);
    return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ownerUserId = await requireOwnerUserId();

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      slug?: string;
      type?: "SCHOOL" | "COLLEGE" | "OTHER";
      contactEmail?: string;
      contactPhone?: string;
      primaryAdminEmail?: string;
      primaryAdminRole?: "OWNER" | "ADMIN" | "MANAGEMENT";
    };

    const name = body.name?.trim();
    const slug = body.slug?.trim().toLowerCase();
    const type = body.type ?? "SCHOOL";
    const contactEmail = body.contactEmail?.trim().toLowerCase() || null;
    const contactPhone = body.contactPhone?.trim() || null;
    const primaryAdminEmail = body.primaryAdminEmail?.trim().toLowerCase();
    const primaryAdminRole = body.primaryAdminRole ?? "OWNER";

    if (!name || !slug) {
      return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
    }

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

    if (existingOrg) {
      return NextResponse.json({ error: "Organization slug already exists" }, { status: 409 });
    }

    let adminUserId: string | null = null;
    if (primaryAdminEmail) {
      const [adminUser] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, primaryAdminEmail))
        .limit(1);

      if (!adminUser) {
        return NextResponse.json({ error: "Primary admin user not found" }, { status: 404 });
      }

      adminUserId = adminUser.id;
    }

    const now = new Date();
    const organizationId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(organization).values({
        id: organizationId,
        name,
        slug,
        type,
        status: "ACTIVE",
        createdByUserId: ownerUserId,
        approvedByUserId: ownerUserId,
        approvedAt: now,
        defaultTimezone: "Asia/Kolkata",
        contactEmail,
        contactPhone,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(organizationMembership).values({
        id: crypto.randomUUID(),
        organizationId,
        userId: ownerUserId,
        role: "OWNER",
        status: "ACTIVE",
        invitedByUserId: ownerUserId,
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      if (adminUserId && adminUserId !== ownerUserId) {
        await tx.insert(organizationMembership).values({
          id: crypto.randomUUID(),
          organizationId,
          userId: adminUserId,
          role: primaryAdminRole,
          status: "ACTIVE",
          invitedByUserId: ownerUserId,
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (adminUserId && primaryAdminRole === "OWNER") {
        await tx
          .update(user)
          .set({ role: "OWNER", updatedAt: now })
          .where(eq(user.id, adminUserId));
      }
    });

    const [created] = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        type: organization.type,
        status: organization.status,
        contactEmail: organization.contactEmail,
        contactPhone: organization.contactPhone,
        createdAt: organization.createdAt,
      })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);

    return NextResponse.json({ success: true, organization: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }

    console.error("Owner create organization error:", error);
    return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
  }
}
