import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { child, wallet } from "@/lib/db/schema";

const PASSWORD_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generateReadablePassword(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => PASSWORD_CHARSET[value % PASSWORD_CHARSET.length]).join("");
}

export async function ensureGeneralSelfProfile(
  userId: string,
  displayName?: string,
  database: typeof db = db,
) {
  const [existingChild] = await database
    .select({ id: child.id })
    .from(child)
    .where(eq(child.parentId, userId))
    .orderBy(asc(child.createdAt))
    .limit(1);

  let childId = existingChild?.id;
  if (!childId) {
    const generatedGr = `GEN-${userId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const [createdChild] = await database
      .insert(child)
      .values({
        parentId: userId,
        name: displayName?.trim() || "Account Holder",
        grNumber: generatedGr,
        className: "GENERAL_ACCOUNT",
      })
      .onConflictDoNothing({ target: [child.organizationId, child.grNumber] })
      .returning({ id: child.id });

    childId = createdChild?.id;
  }

  if (!childId) {
    const [resolvedChild] = await database
      .select({ id: child.id })
      .from(child)
      .where(eq(child.parentId, userId))
      .orderBy(asc(child.createdAt))
      .limit(1);
    childId = resolvedChild?.id;
  }

  if (!childId) {
    throw new Error("Failed to provision general account profile");
  }

  const [existingWallet] = await database
    .select({ id: wallet.id })
    .from(wallet)
    .where(eq(wallet.childId, childId))
    .limit(1);

  if (!existingWallet) {
    await database.insert(wallet).values({ childId, balance: 0 });
  }

  return { childId };
}
