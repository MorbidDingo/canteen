import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  organization,
  organizationDevice,
  organizationFeatureEntitlement,
  organizationMembership,
  platformUserRole,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";

export async function getSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

export type PlatformRole = "PLATFORM_OWNER" | "PLATFORM_SUPPORT";
export type OrgRole = "OWNER" | "ADMIN" | "MANAGEMENT" | "OPERATOR" | "LIB_OPERATOR" | "ATTENDANCE" | "PARENT" | "GENERAL" | "DEVICE";
export type DeviceType = "GATE" | "KIOSK" | "LIBRARY";
export type AccessDeniedCode =
  | "UNAUTHENTICATED"
  | "ORG_CONTEXT_MISSING"
  | "INSUFFICIENT_ROLE"
  | "ORG_NOT_FOUND"
  | "ORG_SUSPENDED"
  | "MEMBERSHIP_NOT_FOUND"
  | "MEMBERSHIP_SUSPENDED"
  | "FEATURE_DISABLED";

export class AccessDeniedError extends Error {
  constructor(
    public readonly code: AccessDeniedCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export type RequireAccessOptions = {
  scope: "platform" | "organization";
  organizationId?: string;
  allowedPlatformRoles?: PlatformRole[];
  allowedOrgRoles?: OrgRole[];
  requiredFeature?: string;
  allowWhenOrgSuspended?: boolean;
};

export type ResolvedAccessContext = {
  actorUserId: string;
  actorPlatformRole: PlatformRole | null;
  activeOrganizationId: string | null;
  membershipRole: OrgRole | null;
  membershipStatus: string | null;
  organizationStatus: string | null;
  featureEnabled: boolean | null;
  deviceLoginProfile: {
    deviceId: string;
    deviceType: DeviceType;
    terminalPath: "/kiosk" | "/gate" | "/library";
  } | null;
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
};

function resolveTerminalPathForDeviceType(deviceType: DeviceType): "/kiosk" | "/gate" | "/library" {
  if (deviceType === "GATE") {
    return "/gate";
  }

  if (deviceType === "LIBRARY") {
    return "/library";
  }

  return "/kiosk";
}

export function isDeviceTypeAllowedForTerminal(
  deviceType: DeviceType,
  allowedDeviceTypes: DeviceType[],
): boolean {
  return allowedDeviceTypes.includes(deviceType);
}

function hasOrgRoleAccessWithHierarchy(
  membershipRole: OrgRole,
  allowedOrgRoles: OrgRole[] | undefined,
): boolean {
  if (!allowedOrgRoles || allowedOrgRoles.length === 0) {
    return true;
  }

  if (allowedOrgRoles.includes(membershipRole)) {
    return true;
  }

  // Organization owners are treated as superusers for organization-scoped endpoints.
  if (membershipRole === "OWNER") {
    return true;
  }

  // Management can access all organization endpoints except explicit owner-only ones.
  if (membershipRole === "MANAGEMENT") {
    const ownerOnly = allowedOrgRoles.every((role) => role === "OWNER");
    return !ownerOnly;
  }

  return false;
}

async function resolveActiveOrganizationIdFromRequest() {
  const reqHeaders = await headers();
  const reqCookies = await cookies();

  return (
    reqHeaders.get("x-organization-id") ??
    reqHeaders.get("x-org-id") ??
    reqCookies.get("activeOrganizationId")?.value ??
    null
  );
}

export async function requireAccess(options: RequireAccessOptions): Promise<ResolvedAccessContext> {
  const session = await getSession();

  if (!session?.user?.id) {
    throw new AccessDeniedError("UNAUTHENTICATED", 401, "You must be logged in to access this resource.");
  }

  const actorUserId = session.user.id;

  const [platformRoleRow] = await db
    .select({ role: platformUserRole.role, status: platformUserRole.status })
    .from(platformUserRole)
    .where(eq(platformUserRole.userId, actorUserId))
    .limit(1);

  const actorPlatformRole =
    platformRoleRow && platformRoleRow.status === "ACTIVE"
      ? (platformRoleRow.role as PlatformRole)
      : null;

  if (options.scope === "platform") {
    const allowedPlatformRoles = options.allowedPlatformRoles ?? ["PLATFORM_OWNER"];
    if (!actorPlatformRole || !allowedPlatformRoles.includes(actorPlatformRole)) {
      throw new AccessDeniedError(
        "INSUFFICIENT_ROLE",
        403,
        "Platform access denied for this user role.",
      );
    }

    return {
      actorUserId,
      actorPlatformRole,
      activeOrganizationId: null,
      membershipRole: null,
      membershipStatus: null,
      organizationStatus: null,
      featureEnabled: null,
      deviceLoginProfile: null,
      session,
    };
  }

  let activeOrganizationId = options.organizationId ?? (await resolveActiveOrganizationIdFromRequest());
  if (!activeOrganizationId) {
    const [firstMembership] = await db
      .select({ organizationId: organizationMembership.organizationId })
      .from(organizationMembership)
      .where(
        and(
          eq(organizationMembership.userId, actorUserId),
          eq(organizationMembership.status, "ACTIVE"),
        ),
      )
      .limit(1);

    activeOrganizationId = firstMembership?.organizationId ?? null;
  }

  if (!activeOrganizationId) {
    throw new AccessDeniedError(
      "ORG_CONTEXT_MISSING",
      400,
      "Active organization context is required.",
    );
  }

  const [orgRow] = await db
    .select({ id: organization.id, status: organization.status })
    .from(organization)
    .where(eq(organization.id, activeOrganizationId))
    .limit(1);

  if (!orgRow) {
    throw new AccessDeniedError("ORG_NOT_FOUND", 404, "Organization not found.");
  }

  if (!options.allowWhenOrgSuspended && (orgRow.status === "SUSPENDED" || orgRow.status === "CLOSED")) {
    throw new AccessDeniedError("ORG_SUSPENDED", 403, "Organization is suspended or closed.");
  }

  const [membershipRow] = await db
    .select({ role: organizationMembership.role, status: organizationMembership.status })
    .from(organizationMembership)
    .where(
      and(
        eq(organizationMembership.organizationId, activeOrganizationId),
        eq(organizationMembership.userId, actorUserId),
      ),
    )
    .limit(1);

  if (!membershipRow) {
    throw new AccessDeniedError("MEMBERSHIP_NOT_FOUND", 403, "No organization membership found.");
  }

  if (membershipRow.status !== "ACTIVE") {
    throw new AccessDeniedError("MEMBERSHIP_SUSPENDED", 403, "Organization membership is not active.");
  }

  const membershipRole = membershipRow.role as OrgRole;
  const allowedOrgRoles = options.allowedOrgRoles;
  if (!hasOrgRoleAccessWithHierarchy(membershipRole, allowedOrgRoles)) {
    throw new AccessDeniedError("INSUFFICIENT_ROLE", 403, "Insufficient role for this resource.");
  }

  let featureEnabled: boolean | null = null;
  if (options.requiredFeature) {
    const [featureRow] = await db
      .select({ enabled: organizationFeatureEntitlement.enabled })
      .from(organizationFeatureEntitlement)
      .where(
        and(
          eq(organizationFeatureEntitlement.organizationId, activeOrganizationId),
          eq(organizationFeatureEntitlement.featureKey, options.requiredFeature),
        ),
      )
      .limit(1);

    featureEnabled = featureRow?.enabled ?? false;
    if (!featureEnabled) {
      throw new AccessDeniedError(
        "FEATURE_DISABLED",
        403,
        `Feature ${options.requiredFeature} is disabled for this organization.`,
      );
    }
  }

  const [deviceLogin] = await db
    .select({ id: organizationDevice.id, deviceType: organizationDevice.deviceType })
    .from(organizationDevice)
    .where(
      and(
        eq(organizationDevice.organizationId, activeOrganizationId),
        eq(organizationDevice.loginUserId, actorUserId),
        eq(organizationDevice.status, "ACTIVE"),
      ),
    )
    .limit(1);

  const deviceLoginProfile = deviceLogin
    ? {
        deviceId: deviceLogin.id,
        deviceType: deviceLogin.deviceType as DeviceType,
        terminalPath: resolveTerminalPathForDeviceType(deviceLogin.deviceType as DeviceType),
      }
    : null;

  return {
    actorUserId,
    actorPlatformRole,
    activeOrganizationId,
    membershipRole,
    membershipStatus: membershipRow.status,
    organizationStatus: orgRow.status,
    featureEnabled,
    deviceLoginProfile,
    session,
  };
}

export async function requireLinkedAccount(options?: { allowPlatformOwnerBypass?: boolean }) {
  const access = await requireAccess({ scope: "organization" });

  if (!options?.allowPlatformOwnerBypass) {
    return access;
  }

  if (access.actorPlatformRole === "PLATFORM_OWNER") {
    return access;
  }

  return access;
}
