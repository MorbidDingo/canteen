import { db } from "@/lib/db";
import {
  contentPostAudience,
  contentGroupMember,
  child,
} from "@/lib/db/schema";
import { eq, and, or, inArray } from "drizzle-orm";

/**
 * Check if a user has audience access to a specific post.
 * Resolves ALL_ORG, USER, CLASS, SECTION, and GROUP audience types.
 */
export async function checkAudienceAccess(
  organizationId: string,
  userId: string,
  postId: string,
): Promise<boolean> {
  // Fetch audience rows for this post
  const audiences = await db
    .select()
    .from(contentPostAudience)
    .where(eq(contentPostAudience.postId, postId));

  if (audiences.length === 0) return false;

  // Quick checks that don't require extra queries
  for (const a of audiences) {
    if (a.audienceType === "ALL_ORG") return true;
    if (a.audienceType === "USER" && a.userId === userId) return true;
  }

  // Check CLASS / SECTION audiences against caller's children
  const classAudiences = audiences.filter((a) => a.audienceType === "CLASS" || a.audienceType === "SECTION");
  if (classAudiences.length > 0) {
    const children = await db
      .select({ className: child.className, section: child.section })
      .from(child)
      .where(
        and(
          eq(child.parentId, userId),
          eq(child.organizationId, organizationId),
        ),
      );

    for (const a of classAudiences) {
      for (const c of children) {
        if (a.audienceType === "CLASS" && a.className === c.className) return true;
        if (
          a.audienceType === "SECTION" &&
          a.className === c.className &&
          a.section === c.section
        ) return true;
      }
    }
  }

  // Check GROUP audiences against caller's group memberships
  const groupAudiences = audiences.filter((a) => a.audienceType === "GROUP" && a.groupId);
  if (groupAudiences.length > 0) {
    const targetGroupIds = groupAudiences.map((a) => a.groupId!);
    const memberships = await db
      .select({ groupId: contentGroupMember.groupId })
      .from(contentGroupMember)
      .where(
        and(
          eq(contentGroupMember.userId, userId),
          inArray(contentGroupMember.groupId, targetGroupIds),
        ),
      );

    if (memberships.length > 0) return true;
  }

  return false;
}
