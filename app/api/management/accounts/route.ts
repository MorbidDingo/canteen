import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, user } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";
import { ensureGeneralSelfProfile, generateReadablePassword } from "@/lib/general-account";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

const GENERAL_ROLES = ["GENERAL"] as const;
const STAFF_ROLES = ["ADMIN", "OPERATOR", "MANAGEMENT", "LIB_OPERATOR", "ATTENDANCE"] as const;
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
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const kind = parseKind(params.get("kind"));
  const q = params.get("q")?.trim();
  const roleFilter = allowedRolesForKind(kind);

  const whereClause =
    q && q.length >= 2
      ? and(
          inArray(user.role, roleFilter),
          or(ilike(user.name, `%${q}%`), ilike(user.email, `%${q}%`)),
        )
      : inArray(user.role, roleFilter);

  const accounts = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(whereClause)
    .orderBy(desc(user.createdAt))
    .limit(200);

  return NextResponse.json({ accounts });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
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
      .select({ email: user.email })
      .from(user)
      .where(inArray(user.email, uniqueEmails));
    const existingEmails = new Set(existingRows.map((row) => row.email.toLowerCase()));

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
    const skipped: Array<{ email: string; reason: string }> = [];

    for (const row of normalizedInput) {
      if (existingEmails.has(row.email)) {
        skipped.push({ email: row.email, reason: "Email already exists" });
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

      existingEmails.add(row.email);
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
      userId: session.user.id,
      userRole: session.user.role,
      action: mode === "bulk" ? AUDIT_ACTIONS.ACCOUNT_BULK_CREATED : AUDIT_ACTIONS.ACCOUNT_CREATED,
      details: {
        kind,
        mode,
        attempted: normalizedInput.length,
        created: created.length,
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
          skipped: skipped.length,
        },
        created,
        skipped,
      },
      { status: created.length > 0 ? 201 : 200 },
    );
  } catch (error) {
    console.error("Management accounts create error:", error);
    return NextResponse.json({ error: "Failed to create accounts" }, { status: 500 });
  }
}
