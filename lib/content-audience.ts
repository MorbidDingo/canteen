import { db } from "@/lib/db";
import {
  contentPostAudience,
  contentFolderAudience,
  contentGroupMember,
  organizationMembership,
  child,
} from "@/lib/db/schema";
import { eq, and, or, inArray } from "drizzle-orm";

/** Roles that can see all org content regardless of audience targeting */
const MANAGEMENT_ROLES = new Set(["OWNER", "ADMIN", "MANAGEMENT", "OPERATOR"]);

/**
 * Check if a user has audience access to a specific post.
 * Management roles (OWNER, ADMIN, MANAGEMENT, OPERATOR) have implicit access.
 * Resolves ALL_ORG, USER, CLASS, SECTION, and GROUP audience types for others.
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

  // Management roles can see all published content in their org
  const memberships = await db
    .select({ role: organizationMembership.role })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.userId, userId),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    );

  if (memberships.some((m) => MANAGEMENT_ROLES.has(m.role))) return true;

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
    const groupMemberships = await db
      .select({ groupId: contentGroupMember.groupId })
      .from(contentGroupMember)
      .where(
        and(
          eq(contentGroupMember.userId, userId),
          inArray(contentGroupMember.groupId, targetGroupIds),
        ),
      );

    if (groupMemberships.length > 0) return true;
  }

  return false;
}

/**
 * Check if a user has audience access to a specific folder.
 * Management roles (OWNER, ADMIN, MANAGEMENT, OPERATOR) have implicit access.
 * Folder authors always have access.
 */
export async function checkFolderAudienceAccess(
  organizationId: string,
  userId: string,
  folderId: string,
  folderAuthorUserId: string,
): Promise<boolean> {
  // Authors always see their own folders
  if (folderAuthorUserId === userId) return true;

  // Fetch folder audience rows
  const audiences = await db
    .select()
    .from(contentFolderAudience)
    .where(eq(contentFolderAudience.folderId, folderId));

  if (audiences.length === 0) return false;

  // Quick checks
  for (const a of audiences) {
    if (a.audienceType === "ALL_ORG") return true;
    if (a.audienceType === "USER" && a.userId === userId) return true;
  }

  // Management roles
  const memberships = await db
    .select({ role: organizationMembership.role })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, organizationId),
        eq(organizationMembership.userId, userId),
        eq(organizationMembership.status, "ACTIVE"),
      ),
    );

  if (memberships.some((m) => MANAGEMENT_ROLES.has(m.role))) return true;

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

  // Check GROUP audiences
  const groupAudiences = audiences.filter((a) => a.audienceType === "GROUP" && a.groupId);
  if (groupAudiences.length > 0) {
    const targetGroupIds = groupAudiences.map((a) => a.groupId!);
    const groupMemberships = await db
      .select({ groupId: contentGroupMember.groupId })
      .from(contentGroupMember)
      .where(
        and(
          eq(contentGroupMember.userId, userId),
          inArray(contentGroupMember.groupId, targetGroupIds),
        ),
      );

    if (groupMemberships.length > 0) return true;
  }

  return false;
}
