import { db } from "@/lib/db";
import { order } from "@/lib/db/schema";
import { desc, isNotNull } from "drizzle-orm";
import { generateNextOrderCode } from "@/lib/constants";

/**
 * Generates the next sequential order code by querying the latest token code
 * from the database and computing the next one in sequence.
 *
 * Thread-safety note: in rare concurrent scenarios two orders could get the same
 * code. This is acceptable because the code is a display helper, not a unique key.
 * The actual PK remains the UUID.
 */
export async function getNextOrderCode(): Promise<string> {
  const recentCodes = await db
    .select({ tokenCode: order.tokenCode })
    .from(order)
    .where(isNotNull(order.tokenCode))
    .orderBy(desc(order.createdAt))
    .limit(500);

  const latestSequentialCode =
    recentCodes.find((row) => !!row.tokenCode && /^[A-Z]{4}[1-9]$/.test(row.tokenCode))?.tokenCode ?? null;

  return generateNextOrderCode(latestSequentialCode);
}
