import { NextResponse } from "next/server";
import { and, eq, gte, lte, or, isNull, ne, desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { child, menuItem, preOrder, preOrderItem, user } from "@/lib/db/schema";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN"],
    });

    if (access.deviceLoginProfile) {
      return NextResponse.json(
        { error: "Pre-order controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
        { status: 403 },
      );
    }

    const organizationId = access.activeOrganizationId!;

    const today = todayISODate();

    const rows = await db
      .select({
        id: preOrder.id,
        mode: preOrder.mode,
        status: preOrder.status,
        scheduledDate: preOrder.scheduledDate,
        subscriptionUntil: preOrder.subscriptionUntil,
        lastFulfilledDate: preOrder.lastFulfilledDate,
        createdAt: preOrder.createdAt,
        childId: preOrder.childId,
        childName: child.name,
        parentName: user.name,
        parentEmail: user.email,
      })
      .from(preOrder)
      .innerJoin(child, eq(child.id, preOrder.childId))
      .innerJoin(user, eq(user.id, preOrder.parentId))
      .where(
        and(
          eq(child.organizationId, organizationId),
          eq(preOrder.status, "PENDING"),
          or(
            and(eq(preOrder.mode, "ONE_DAY"), eq(preOrder.scheduledDate, today)),
            and(
              eq(preOrder.mode, "SUBSCRIPTION"),
              lte(preOrder.scheduledDate, today),
              or(isNull(preOrder.subscriptionUntil), gte(preOrder.subscriptionUntil, today)),
              or(isNull(preOrder.lastFulfilledDate), ne(preOrder.lastFulfilledDate, today)),
            ),
          ),
        ),
      )
      .orderBy(desc(preOrder.createdAt));

    const ids = rows.map((r) => r.id);

    const itemRows = ids.length
      ? await db
          .select({
            preOrderId: preOrderItem.preOrderId,
            menuItemId: preOrderItem.menuItemId,
            menuItemName: menuItem.name,
            quantity: preOrderItem.quantity,
            breakName: preOrderItem.breakName,
            lastFulfilledOn: preOrderItem.lastFulfilledOn,
          })
          .from(preOrderItem)
          .innerJoin(menuItem, eq(menuItem.id, preOrderItem.menuItemId))
            .where(and(inArray(preOrderItem.preOrderId, ids), eq(menuItem.organizationId, organizationId)))
      : [];

    const itemsByPreOrder = new Map<
      string,
      Array<{ menuItemId: string; menuItemName: string; quantity: number; breakName: string | null }>
    >();
    for (const row of itemRows) {
      if (row.lastFulfilledOn === today) {
        continue;
      }
      const current = itemsByPreOrder.get(row.preOrderId) ?? [];
      current.push({
        menuItemId: row.menuItemId,
        menuItemName: row.menuItemName,
        quantity: row.quantity,
        breakName: row.breakName,
      });
      itemsByPreOrder.set(row.preOrderId, current);
    }

    const prepDemandMap = new Map<
      string,
      {
        menuItemId: string;
        menuItemName: string;
        breakName: string | null;
        quantity: number;
        fromOneDay: number;
        fromSubscription: number;
      }
    >();

    for (const row of rows) {
      const items = itemsByPreOrder.get(row.id) ?? [];
      for (const item of items) {
        const key = `${item.menuItemId}::${item.breakName || ""}`;
        const existing = prepDemandMap.get(key) ?? {
          menuItemId: item.menuItemId,
          menuItemName: item.menuItemName,
          breakName: item.breakName,
          quantity: 0,
          fromOneDay: 0,
          fromSubscription: 0,
        };

        existing.quantity += item.quantity;
        if (row.mode === "SUBSCRIPTION") {
          existing.fromSubscription += item.quantity;
        } else {
          existing.fromOneDay += item.quantity;
        }

        prepDemandMap.set(key, existing);
      }
    }

    const oneDay = rows
      .filter((r) => r.mode === "ONE_DAY")
      .map((r) => ({
        ...r,
        items: itemsByPreOrder.get(r.id) ?? [],
      }));

    const subscriptions = rows
      .filter((r) => r.mode === "SUBSCRIPTION")
      .map((r) => ({
        ...r,
        items: itemsByPreOrder.get(r.id) ?? [],
      }));

    const prepDemand = Array.from(prepDemandMap.values()).sort((a, b) => b.quantity - a.quantity);

    return NextResponse.json({
      oneDay,
      subscriptions,
      prepDemand,
      summary: {
        oneDayCount: oneDay.length,
        subscriptionCount: subscriptions.length,
        totalPlannedItems: prepDemand.reduce((sum, item) => sum + item.quantity, 0),
      },
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Admin pre-orders fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch pre-orders" }, { status: 500 });
  }
}
