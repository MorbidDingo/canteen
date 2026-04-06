import { menuItem } from "@/lib/db/schema";
import { eq, sql, and, isNotNull } from "drizzle-orm";

/** Maximum quantity of any single item per order. */
export const MAX_QUANTITY_PER_ITEM = 5;

/**
 * Decrement available units for ordered items.
 * Only affects items where availableUnits IS NOT NULL (tracked stock).
 * Uses GREATEST to prevent going below 0.
 * Must be called within an existing transaction (pass `tx`).
 */
export async function decrementUnits(
  items: { menuItemId: string; quantity: number }[],
  tx: Parameters<Parameters<typeof import("@/lib/db").db.transaction>[0]>[0],
) {
  for (const item of items) {
    await tx
      .update(menuItem)
      .set({
        availableUnits: sql`GREATEST(${menuItem.availableUnits} - ${item.quantity}, 0)`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(menuItem.id, item.menuItemId),
          isNotNull(menuItem.availableUnits),
        ),
      );
  }
}

/**
 * Re-increment available units (e.g. on refund/cancel of a PAID order).
 * Only affects tracked-stock items (availableUnits IS NOT NULL).
 */
export async function incrementUnits(
  items: { menuItemId: string; quantity: number }[],
  tx: Parameters<Parameters<typeof import("@/lib/db").db.transaction>[0]>[0],
) {
  for (const item of items) {
    await tx
      .update(menuItem)
      .set({
        availableUnits: sql`${menuItem.availableUnits} + ${item.quantity}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(menuItem.id, item.menuItemId),
          isNotNull(menuItem.availableUnits),
        ),
      );
  }
}

/**
 * Validate that sufficient units are available for all items.
 * Also enforces a per-item max of MAX_QUANTITY_PER_ITEM.
 * Returns null if all OK, or an error message string if not.
 */
export async function validateUnits(
  items: { menuItemId: string; quantity: number; name?: string }[],
  db: typeof import("@/lib/db").db,
): Promise<string | null> {
  for (const item of items) {
    // Enforce per-item quantity cap
    if (item.quantity > MAX_QUANTITY_PER_ITEM) {
      const [row] = await db
        .select({ name: menuItem.name })
        .from(menuItem)
        .where(eq(menuItem.id, item.menuItemId))
        .limit(1);
      const name = row?.name || item.name || "item";
      return `Maximum ${MAX_QUANTITY_PER_ITEM} units of "${name}" per order.`;
    }

    const [menuRow] = await db
      .select({ availableUnits: menuItem.availableUnits, name: menuItem.name })
      .from(menuItem)
      .where(eq(menuItem.id, item.menuItemId))
      .limit(1);

    if (!menuRow) continue;

    // null = unlimited, skip
    if (menuRow.availableUnits === null) continue;

    if (menuRow.availableUnits === 0) {
      return `"${menuRow.name}" is sold out.`;
    }

    if (menuRow.availableUnits < item.quantity) {
      return `Only ${menuRow.availableUnits} unit(s) of "${menuRow.name}" remaining.`;
    }
  }

  return null;
}
