import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user, child, wallet, account } from "@/lib/db/schema";
import { eq, ilike, and, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const surname = searchParams.get("surname")?.trim();
  const all = searchParams.get("all");

  // If "all" param is set, return parents with children + wallet info
  if (all !== null) {
    const q = searchParams.get("q")?.trim();
    const parents = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(
        q && q.length >= 2
          ? and(eq(user.role, "PARENT"), ilike(user.name, `%${q}%`))
          : eq(user.role, "PARENT"),
      )
      .orderBy(user.name)
      .limit(100);

    // Get children + wallet info for each parent
    const parentIds = parents.map((p) => p.id);
    const children = parentIds.length > 0
      ? await db
          .select({
            id: child.id,
            parentId: child.parentId,
            name: child.name,
            grNumber: child.grNumber,
            walletBalance: wallet.balance,
          })
          .from(child)
          .leftJoin(wallet, eq(child.id, wallet.childId))
          .where(sql`${child.parentId} IN (${sql.join(parentIds.map((id) => sql`${id}`), sql`, `)})`)
      : [];

    const parentList = parents.map((p) => ({
      ...p,
      children: children.filter((c) => c.parentId === p.id),
    }));

    return NextResponse.json({ parents: parentList });
  }

  // Legacy surname search
  if (!surname || surname.length < 2) {
    return NextResponse.json({ parents: [] });
  }

  const parents = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    })
    .from(user)
    .where(
      and(
        eq(user.role, "PARENT"),
        ilike(user.name, `%${surname}%`),
      ),
    )
    .limit(20);

  return NextResponse.json({ parents });
}

// POST — create a new parent account
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, email, phone, password } = body;

    if (!name?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Check for existing email
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email.trim().toLowerCase()))
      .limit(1);

    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    // Hash password using better-auth's crypto
    const { hashPassword } = await import("better-auth/crypto");
    const hashedPassword = await hashPassword(password);

    const userId = crypto.randomUUID();
    const now = new Date();

    // Create user
    await db.insert(user).values({
      id: userId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      emailVerified: false,
      role: "PARENT",
      phone: phone?.trim() || null,
      createdAt: now,
      updatedAt: now,
    });

    // Create credential account
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    });

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.PARENT_CREATED,
      details: { parentId: userId, name: name.trim(), email: email.trim().toLowerCase() },
      request,
    });

    return NextResponse.json({ id: userId, name: name.trim(), email: email.trim().toLowerCase() });
  } catch (error) {
    console.error("Create parent error:", error);
    return NextResponse.json({ error: "Failed to create parent" }, { status: 500 });
  }
}
