import { db } from "@/lib/db";
import { contentPermission } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Check if a user has content posting permission for the given org.
 * Returns the permission row if found, or null.
 */
export async function getContentPermission(
  organizationId: string,
  userId: string,
  requiredType?: "ASSIGNMENT" | "NOTE",
) {
  const [perm] = await db
    .select()
    .from(contentPermission)
    .where(
      and(
        eq(contentPermission.organizationId, organizationId),
        eq(contentPermission.userId, userId),
      ),
    )
    .limit(1);

  if (!perm) return null;

  // If a specific type is required, check scope
  if (requiredType) {
    if (perm.scope === "BOTH") return perm;
    if (perm.scope === requiredType) return perm;
    return null;
  }

  return perm;
}
