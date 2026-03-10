import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user, child, wallet, account, session as sessionTable } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// PATCH — update parent password
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
    const body = await request.json();
    const { password } = body;

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    // Verify the parent exists
    const [parent] = await db
      .select({ id: user.id, name: user.name, role: user.role })
      .from(user)
      .where(and(eq(user.id, id), eq(user.role, "PARENT")))
      .limit(1);

    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    const { hashPassword } = await import("better-auth/crypto");
    const hashedPassword = await hashPassword(password);

    // Update password in the credential account
    const [existingAccount] = await db
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, id), eq(account.providerId, "credential")))
      .limit(1);

    if (existingAccount) {
      await db
        .update(account)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(eq(account.id, existingAccount.id));
    } else {
      await db.insert(account).values({
        id: crypto.randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Invalidate all existing sessions for this parent
    await db.delete(sessionTable).where(eq(sessionTable.userId, id));

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      details: { parentId: id, parentName: parent.name },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update password error:", error);
    return NextResponse.json(
      { error: "Failed to update password" },
      { status: 500 },
    );
  }
}

// DELETE — delete parent (reassign children first)
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
    const body = await request.json().catch(() => ({}));
    const { newParentId } = body as { newParentId?: string };

    // Verify parent exists
    const [parent] = await db
      .select({ id: user.id, name: user.name, role: user.role })
      .from(user)
      .where(and(eq(user.id, id), eq(user.role, "PARENT")))
      .limit(1);

    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    // Check for children
    const children = await db
      .select({
        id: child.id,
        name: child.name,
        walletBalance: wallet.balance,
      })
      .from(child)
      .leftJoin(wallet, eq(child.id, wallet.childId))
      .where(eq(child.parentId, id));

    if (children.length > 0) {
      if (!newParentId) {
        // Return children info so the UI can ask for reassignment
        return NextResponse.json(
          {
            error: "CHILDREN_EXIST",
            children: children.map((c) => ({
              id: c.id,
              name: c.name,
              walletBalance: c.walletBalance ?? 0,
            })),
          },
          { status: 409 },
        );
      }

      // Verify new parent exists
      const [newParent] = await db
        .select({ id: user.id, role: user.role })
        .from(user)
        .where(and(eq(user.id, newParentId), eq(user.role, "PARENT")))
        .limit(1);

      if (!newParent) {
        return NextResponse.json(
          { error: "New parent not found" },
          { status: 400 },
        );
      }

      // Reassign all children to the new parent
      await db
        .update(child)
        .set({ parentId: newParentId, updatedAt: new Date() })
        .where(eq(child.parentId, id));
    }

    // Now safe to delete the parent user (sessions + account cascade)
    await db.delete(user).where(eq(user.id, id));

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.PARENT_DELETED,
      details: {
        parentId: id,
        parentName: parent.name,
        childrenReassignedTo: newParentId || null,
        childrenCount: children.length,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete parent error:", error);
    return NextResponse.json(
      { error: "Failed to delete parent" },
      { status: 500 },
    );
  }
}
