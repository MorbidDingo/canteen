import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { child, order, orderItem, organizationDevice, wallet, walletTransaction } from "@/lib/db/schema";
import { and, eq, inArray, asc, or } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { incrementUnits } from "@/lib/units";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";
import { createSettlementLedgerEntryForOrder } from "@/lib/settlement-ledger";

const VALID_TRANSITIONS: Record<string, string[]> = {
  PLACED: ["PREPARING", "CANCELLED"],
  PREPARING: ["SERVED"],
  SERVED: [],
  CANCELLED: [],
};

const statusSchema = z.object({
  status: z.enum(["PLACED", "PREPARING", "SERVED", "CANCELLED"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN"],
    });

    if (access.deviceLoginProfile) {
      return NextResponse.json(
        { error: "Order controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
        { status: 403 },
      );
    }

    const organizationId = access.activeOrganizationId!;

    const { id } = await params;
    const body = await request.json();
    const parsed = statusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid status", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const newStatus = parsed.data.status;

    // Fetch the order
    const [existingOrder] = await db
      .select({
        id: order.id,
        userId: order.userId,
        childId: order.childId,
        tokenCode: order.tokenCode,
        status: order.status,
        totalAmount: order.totalAmount,
        platformFee: order.platformFee,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        childOrganizationId: child.organizationId,
        deviceOrganizationId: organizationDevice.organizationId,
      })
      .from(order)
      .leftJoin(child, eq(order.childId, child.id))
      .leftJoin(organizationDevice, eq(order.deviceId, organizationDevice.id))
      .where(eq(order.id, id))
      .limit(1);

    if (
      !existingOrder ||
      (existingOrder.childOrganizationId !== organizationId &&
        existingOrder.deviceOrganizationId !== organizationId)
    ) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Validate state transition
    const allowedTransitions = VALID_TRANSITIONS[existingOrder.status] || [];
    if (!allowedTransitions.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Cannot transition from "${existingOrder.status}" to "${newStatus}". Allowed: ${allowedTransitions.join(", ") || "none"}`,
        },
        { status: 400 }
      );
    }

    // If cancelling a PAID order, refund wallet + restore stock
    if (newStatus === "CANCELLED" && existingOrder.paymentStatus === "PAID") {
      const payableAmount = Math.round((existingOrder.totalAmount + (existingOrder.platformFee ?? 0)) * 100) / 100;
      const items = await db
        .select({ menuItemId: orderItem.menuItemId, quantity: orderItem.quantity })
        .from(orderItem)
        .where(eq(orderItem.orderId, id));

      await db.transaction(async (tx) => {
        // Refund to wallet if order has a childId
        if (existingOrder.childId) {
          const [orderChild] = await tx
            .select({ parentId: child.parentId })
            .from(child)
            .where(eq(child.id, existingOrder.childId))
            .limit(1);
          const siblingRows = orderChild
            ? await tx
              .select({ id: child.id })
              .from(child)
              .where(and(eq(child.parentId, orderChild.parentId), eq(child.organizationId, organizationId)))
            : [];
          const siblingIds = siblingRows.map((s) => s.id);

          const [walletRow] = await tx
            .select()
            .from(wallet)
            .where(inArray(wallet.childId, siblingIds))
            .orderBy(asc(wallet.createdAt))
            .limit(1);

          if (walletRow) {
            const newBalance = walletRow.balance + payableAmount;

            await tx
              .update(wallet)
              .set({ balance: newBalance, updatedAt: new Date() })
              .where(inArray(wallet.childId, siblingIds));

            await tx.insert(walletTransaction).values({
              walletId: walletRow.id,
              type: "REFUND",
              amount: payableAmount,
              balanceAfter: newBalance,
              description: `Refund for cancelled order #${existingOrder.tokenCode || existingOrder.id.slice(0, 6)}`,
              orderId: id,
            });
          }
        }

        // Restore stock
        if (items.length > 0) {
          await incrementUnits(items, tx);
        }

        await tx
          .update(order)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(order.id, id));
      });

      broadcast("menu-updated");

      if (existingOrder.paymentMethod !== "CASH") {
        await createSettlementLedgerEntryForOrder({
          orderId: id,
          entryType: "REVERSAL",
        });
      }
    } else {
      await db
        .update(order)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(order.id, id));
    }

    const [updatedOrder] = await db
      .select()
      .from(order)
      .where(eq(order.id, id));

    logAudit({
      userId: access.actorUserId,
      userRole: access.membershipRole ?? "UNKNOWN",
      action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
      details: { orderId: id, from: existingOrder.status, to: newStatus },
      request,
    });

    broadcast("orders-updated");

    // Notify parent in real-time when order status changes
    if (updatedOrder.childId) {
      const statusLabels: Record<string, string> = {
        PREPARING: "being prepared",
        SERVED: "served",
        CANCELLED: "cancelled",
      };
      const statusTypes: Record<string, "KIOSK_ORDER_PREPARING" | "KIOSK_ORDER_SERVED" | "KIOSK_ORDER_CANCELLED"> = {
        PREPARING: "KIOSK_ORDER_PREPARING",
        SERVED: "KIOSK_ORDER_SERVED",
        CANCELLED: "KIOSK_ORDER_CANCELLED",
      };
      const label = statusLabels[newStatus];
      const type = statusTypes[newStatus];
      if (label && type) {
        notifyParentForChild({
          childId: updatedOrder.childId,
          type,
          title: `Order ${label}`,
          message: `Order #${updatedOrder.tokenCode || updatedOrder.id.slice(0, 6)} is now ${label}.`,
          metadata: { orderId: id, status: newStatus },
        }).catch(() => {});
      }
    }

    return NextResponse.json({ order: updatedOrder });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Update order status error:", error);
    return NextResponse.json(
      { error: "Failed to update order status" },
      { status: 500 }
    );
  }
}
