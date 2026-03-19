import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, organizationMembership, session as sessionTable, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

const MANAGED_ROLES = ["GENERAL", "OWNER", "ADMIN", "OPERATOR", "MANAGEMENT", "LIB_OPERATOR", "ATTENDANCE"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const { id } = await params;
    const body = (await request.json()) as { name?: string; password?: string };
    const nextName = body.name?.trim();
    const nextPassword = body.password?.trim();

    if (!nextName && !nextPassword) {
      return NextResponse.json({ error: "name or password is required" }, { status: 400 });
    }

    if (nextPassword && nextPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const [target] = await db
      .select({
        id: user.id,
        role: organizationMembership.role,
        name: user.name,
        email: user.email,
      })
      .from(organizationMembership)
      .innerJoin(user, eq(organizationMembership.userId, user.id))
      .where(
        and(
          eq(organizationMembership.organizationId, access.activeOrganizationId!),
          eq(organizationMembership.userId, id),
          eq(organizationMembership.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (!MANAGED_ROLES.includes(target.role as (typeof MANAGED_ROLES)[number])) {
      return NextResponse.json({ error: "This account type is not editable here" }, { status: 400 });
    }

    if (nextName) {
      await db.update(user).set({ name: nextName, updatedAt: new Date() }).where(eq(user.id, id));
    }

    if (nextPassword) {
      const { hashPassword } = await import("better-auth/crypto");
      const hashedPassword = await hashPassword(nextPassword);
      const now = new Date();

      const [existingCredential] = await db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, id), eq(account.providerId, "credential")))
        .limit(1);

      if (existingCredential) {
        await db
          .update(account)
          .set({ password: hashedPassword, updatedAt: now })
          .where(eq(account.id, existingCredential.id));
      } else {
        await db.insert(account).values({
          id: crypto.randomUUID(),
          accountId: id,
          providerId: "credential",
          userId: id,
          password: hashedPassword,
          createdAt: now,
          updatedAt: now,
        });
      }

      await db.delete(sessionTable).where(eq(sessionTable.userId, id));
    }

    await logAudit({
      userId: access.actorUserId,
      userRole: access.membershipRole || access.session.user.role,
      action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
      details: {
        organizationId: access.activeOrganizationId,
        accountId: id,
        role: target.role,
        updatedName: Boolean(nextName),
        updatedPassword: Boolean(nextPassword),
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Update account error:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const { id } = await params;

    if (id === access.actorUserId) {
      return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    }

    const [target] = await db
      .select({
        membershipId: organizationMembership.id,
        id: user.id,
        role: organizationMembership.role,
        name: user.name,
        email: user.email,
      })
      .from(organizationMembership)
      .innerJoin(user, eq(organizationMembership.userId, user.id))
      .where(
        and(
          eq(organizationMembership.organizationId, access.activeOrganizationId!),
          eq(organizationMembership.userId, id),
          eq(organizationMembership.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (!MANAGED_ROLES.includes(target.role as (typeof MANAGED_ROLES)[number])) {
      return NextResponse.json({ error: "This account type is not deletable here" }, { status: 400 });
    }

    if (target.role === "MANAGEMENT" || target.role === "OWNER") {
      const governanceUsers = await db
        .select({ id: organizationMembership.userId })
        .from(organizationMembership)
        .where(
          and(
            eq(organizationMembership.organizationId, access.activeOrganizationId!),
            inArray(organizationMembership.role, ["OWNER", "MANAGEMENT"]),
            eq(organizationMembership.status, "ACTIVE"),
          ),
        );

      if (governanceUsers.length <= 1) {
        return NextResponse.json(
          { error: "At least one owner or management account is required" },
          { status: 400 },
        );
      }
    }

    await db
      .update(organizationMembership)
      .set({
        status: "REMOVED",
        suspendedAt: new Date(),
        suspensionReason: "Removed by management",
        updatedAt: new Date(),
      })
      .where(eq(organizationMembership.id, target.membershipId));

    await logAudit({
      userId: access.actorUserId,
      userRole: access.membershipRole || access.session.user.role,
      action: AUDIT_ACTIONS.ACCOUNT_DELETED,
      details: {
        organizationId: access.activeOrganizationId,
        accountId: id,
        role: target.role,
        name: target.name,
        email: target.email,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Delete account error:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
