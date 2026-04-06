import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { organization, organizationMembership, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

export async function GET(request: NextRequest) {
  try {
    await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER", "PLATFORM_SUPPORT"],
    });

    const q = request.nextUrl.searchParams.get("q")?.trim();
    const status = request.nextUrl.searchParams.get("status")?.trim();

    const whereClause =
      q && status
        ? and(ilike(organization.name, `%${q}%`), ilike(organization.status, status))
        : q
          ? ilike(organization.name, `%${q}%`)
          : status
            ? ilike(organization.status, status)
            : undefined;

    const organizations = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        type: organization.type,
        status: organization.status,
        createdAt: organization.createdAt,
        approvedAt: organization.approvedAt,
        suspendedAt: organization.suspendedAt,
      })
      .from(organization)
      .where(whereClause)
      .orderBy(desc(organization.createdAt), asc(organization.name))
      .limit(500);

    return NextResponse.json({ organizations });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Platform organizations list error:", error);
    return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "platform",
      allowedPlatformRoles: ["PLATFORM_OWNER", "PLATFORM_SUPPORT"],
    });

    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      slug?: string;
      type?: "SCHOOL" | "COLLEGE" | "OTHER";
      primaryAdminEmail?: string;
      primaryAdminRole?: "OWNER" | "ADMIN" | "MANAGEMENT";
    };

    const name = body.name?.trim();
    const slug = body.slug?.trim().toLowerCase();
    const type = body.type ?? "SCHOOL";
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
        createdByUserId: access.actorUserId,
        approvedByUserId: access.actorUserId,
        approvedAt: now,
        defaultTimezone: "Asia/Kolkata",
        createdAt: now,
        updatedAt: now,
      });

      if (adminUserId) {
        await tx.insert(organizationMembership).values({
          id: crypto.randomUUID(),
          organizationId,
          userId: adminUserId,
          role: primaryAdminRole,
          status: "ACTIVE",
          invitedByUserId: access.actorUserId,
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        });

        if (primaryAdminRole === "OWNER") {
          await tx
            .update(user)
            .set({ role: "OWNER", updatedAt: now })
            .where(eq(user.id, adminUserId));
        }
      }
    });

    const [created] = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        type: organization.type,
        status: organization.status,
        createdAt: organization.createdAt,
      })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);

    return NextResponse.json({ success: true, organization: created }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Platform create organization error:", error);
    return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
  }
}
