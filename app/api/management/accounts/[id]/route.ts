import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, session as sessionTable, user } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

const MANAGED_ROLES = ["GENERAL", "ADMIN", "OPERATOR", "MANAGEMENT", "LIB_OPERATOR", "ATTENDANCE"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
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
      .select({ id: user.id, role: user.role, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, id))
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
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.ACCOUNT_UPDATED,
      details: {
        accountId: id,
        role: target.role,
        updatedName: Boolean(nextName),
        updatedPassword: Boolean(nextPassword),
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update account error:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    if (id === session.user.id) {
      return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    }

    const [target] = await db
      .select({ id: user.id, role: user.role, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    if (!MANAGED_ROLES.includes(target.role as (typeof MANAGED_ROLES)[number])) {
      return NextResponse.json({ error: "This account type is not deletable here" }, { status: 400 });
    }

    if (target.role === "MANAGEMENT") {
      const managementUsers = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.role, "MANAGEMENT"));
      if (managementUsers.length <= 1) {
        return NextResponse.json(
          { error: "At least one management account is required" },
          { status: 400 },
        );
      }
    }

    await db.delete(user).where(eq(user.id, id));

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.ACCOUNT_DELETED,
      details: {
        accountId: id,
        role: target.role,
        name: target.name,
        email: target.email,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
