import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, organizationMembership, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { ensureGeneralSelfProfile, generateReadablePassword } from "@/lib/general-account";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

const GENERAL_ROLES = ["GENERAL"] as const;
const STAFF_ROLES = ["OWNER", "ADMIN", "OPERATOR", "MANAGEMENT", "LIB_OPERATOR", "ATTENDANCE"] as const;
type AccountKind = "general" | "staff";
type StaffRole = (typeof STAFF_ROLES)[number];

type IncomingAccount = {
  name?: string;
  email?: string;
  phone?: string | null;
  password?: string;
  role?: string;
};

function parseKind(value: string | null): AccountKind {
  return value === "staff" ? "staff" : "general";
}

function allowedRolesForKind(kind: AccountKind) {
  return kind === "general" ? [...GENERAL_ROLES] : [...STAFF_ROLES];
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const params = request.nextUrl.searchParams;
    const kind = parseKind(params.get("kind"));
    const q = params.get("q")?.trim();
    const roleFilter = allowedRolesForKind(kind);

    const whereClause =
      q && q.length >= 2
        ? and(
            eq(organizationMembership.organizationId, access.activeOrganizationId!),
            inArray(organizationMembership.role, roleFilter),
            eq(organizationMembership.status, "ACTIVE"),
            or(ilike(user.name, `%${q}%`), ilike(user.email, `%${q}%`)),
          )
        : and(
            eq(organizationMembership.organizationId, access.activeOrganizationId!),
            inArray(organizationMembership.role, roleFilter),
            eq(organizationMembership.status, "ACTIVE"),
          );

    const accounts = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: organizationMembership.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(organizationMembership)
      .innerJoin(user, eq(organizationMembership.userId, user.id))
      .where(whereClause)
      .orderBy(desc(user.createdAt))
      .limit(200);

    return NextResponse.json({ accounts });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Management accounts list error:", error);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });

    const body = (await request.json()) as {
      kind?: AccountKind;
      mode?: "single" | "bulk";
      account?: IncomingAccount;
      accounts?: IncomingAccount[];
    };

    const kind = body.kind === "staff" ? "staff" : "general";
    const mode = body.mode === "bulk" ? "bulk" : "single";
    const payloads = mode === "bulk" ? body.accounts ?? [] : body.account ? [body.account] : [];

    if (payloads.length === 0) {
      return NextResponse.json({ error: "No accounts provided" }, { status: 400 });
    }

    if (payloads.length > 500) {
      return NextResponse.json({ error: "Maximum 500 accounts per request" }, { status: 400 });
    }

    const allowedRoles = new Set<string>(allowedRolesForKind(kind));
    const normalizedInput = payloads.map((row) => ({
      name: row.name?.trim() || "",
      email: row.email ? normalizeEmail(row.email) : "",
      phone: row.phone?.trim() || null,
      password: row.password?.trim() || "",
      role: kind === "general" ? "GENERAL" : row.role,
    }));

    for (const row of normalizedInput) {
      if (!row.name || !row.email) {
        return NextResponse.json({ error: "Each account needs a name and email" }, { status: 400 });
      }
      if (row.password && row.password.length < 8) {
        return NextResponse.json(
          { error: `Password must be at least 8 characters for ${row.email}` },
          { status: 400 },
        );
      }
      if (!allowedRoles.has(row.role || "")) {
        return NextResponse.json(
          { error: `Invalid role "${row.role || ""}" for ${kind} accounts` },
          { status: 400 },
        );
      }
    }

    const uniqueEmails = Array.from(new Set(normalizedInput.map((row) => row.email)));
    const existingRows = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(inArray(user.email, uniqueEmails));
    const existingUsersByEmail = new Map(existingRows.map((row) => [row.email.toLowerCase(), row.id]));

    const { hashPassword } = await import("better-auth/crypto");
    const created: Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      phone: string | null;
      password: string;
      generatedPassword: boolean;
    }> = [];
    const linked: Array<{ id: string; email: string; role: string }> = [];
    const skipped: Array<{ email: string; reason: string }> = [];

    for (const row of normalizedInput) {
      const existingUserId = existingUsersByEmail.get(row.email);
      if (existingUserId) {
        const [existingMembership] = await db
          .select({ id: organizationMembership.id })
          .from(organizationMembership)
          .where(
            and(
              eq(organizationMembership.organizationId, access.activeOrganizationId!),
              eq(organizationMembership.userId, existingUserId),
              eq(organizationMembership.role, row.role as StaffRole | "GENERAL"),
            ),
          )
          .limit(1);

        if (existingMembership) {
          skipped.push({ email: row.email, reason: "User already has this role in organization" });
          continue;
        }

        await db.insert(organizationMembership).values({
          id: crypto.randomUUID(),
          organizationId: access.activeOrganizationId!,
          userId: existingUserId,
          role: row.role as StaffRole | "GENERAL",
          status: "ACTIVE",
          invitedByUserId: access.actorUserId,
          joinedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        linked.push({
          id: existingUserId,
          email: row.email,
          role: row.role as string,
        });
        continue;
      }

      const plainPassword = row.password || generateReadablePassword(10);
      const hashedPassword = await hashPassword(plainPassword);
      const userId = crypto.randomUUID();
      const now = new Date();

      await db.insert(user).values({
        id: userId,
        name: row.name,
        email: row.email,
        emailVerified: false,
        role: row.role as "GENERAL" | StaffRole,
        phone: row.phone,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(organizationMembership).values({
        id: crypto.randomUUID(),
        organizationId: access.activeOrganizationId!,
        userId,
        role: row.role as StaffRole | "GENERAL",
        status: "ACTIVE",
        invitedByUserId: access.actorUserId,
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(account).values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      });

      if (row.role === "GENERAL") {
        await ensureGeneralSelfProfile(userId, row.name);
      }

      existingUsersByEmail.set(row.email, userId);
      created.push({
        id: userId,
        name: row.name,
        email: row.email,
        role: row.role as string,
        phone: row.phone,
        password: plainPassword,
        generatedPassword: !row.password,
      });
    }

    await logAudit({
      userId: access.actorUserId,
      userRole: access.membershipRole || access.session.user.role,
      action: mode === "bulk" ? AUDIT_ACTIONS.ACCOUNT_BULK_CREATED : AUDIT_ACTIONS.ACCOUNT_CREATED,
      details: {
        organizationId: access.activeOrganizationId,
        kind,
        mode,
        attempted: normalizedInput.length,
        created: created.length,
        linked: linked.length,
        skipped: skipped.length,
        roles: Array.from(new Set(created.map((entry) => entry.role))),
      },
      request,
    });

    return NextResponse.json(
      {
        summary: {
          kind,
          attempted: normalizedInput.length,
          created: created.length,
          linked: linked.length,
          skipped: skipped.length,
        },
        created,
        linked,
        skipped,
      },
      { status: created.length > 0 ? 201 : 200 },
    );
  } catch (error) {
      if (error instanceof AccessDeniedError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
    console.error("Management accounts create error:", error);
    return NextResponse.json({ error: "Failed to create accounts" }, { status: 500 });
  }
}
