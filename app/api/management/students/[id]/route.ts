import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, wallet, walletTransaction, parentControl, order, orderItem } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

// DELETE — remove a student and cascade delete related records
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Student management controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  const organizationId = access.activeOrganizationId!;

  try {
    const { id } = await params;

    // Verify student exists
    const [student] = await db
      .select({ id: child.id, name: child.name, parentId: child.parentId })
      .from(child)
      .where(and(eq(child.id, id), eq(child.organizationId, organizationId)))
      .limit(1);

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    await db.transaction(async (tx) => {
      // Delete parent controls
      await tx.delete(parentControl).where(eq(parentControl.childId, id));

      // Delete wallet transactions (need wallet id first)
      const wallets = await tx
        .select({ id: wallet.id })
        .from(wallet)
        .where(eq(wallet.childId, id));

      if (wallets.length > 0) {
        await tx.delete(walletTransaction).where(eq(walletTransaction.walletId, wallets[0].id));
      }

      // Delete wallet
      await tx.delete(wallet).where(eq(wallet.childId, id));

      // Delete order items for this child's orders
      const childOrders = await tx
        .select({ id: order.id })
        .from(order)
        .where(eq(order.childId, id));

      if (childOrders.length > 0) {
        const orderIds = childOrders.map((o) => o.id);
        await tx.delete(orderItem).where(inArray(orderItem.orderId, orderIds));
        await tx.delete(order).where(eq(order.childId, id));
      }

      // Delete the child
      await tx.delete(child).where(eq(child.id, id));
    });

    await logAudit({
      organizationId: access.activeOrganizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole ?? "UNKNOWN",
      action: AUDIT_ACTIONS.STUDENT_DELETED,
      details: { studentId: id, name: student.name },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete student error:", error);
    return NextResponse.json({ error: "Failed to delete student" }, { status: 500 });
  }
}
