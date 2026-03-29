import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { librarySetting } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { LIBRARY_SETTINGS_DEFAULTS } from "@/lib/constants";

// GET — return all settings (merged with defaults)
export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "LIB_OPERATOR"],
    });

    // Accept libraryId for forward-compatibility (currently unused in query)
    const _libraryId = request.nextUrl.searchParams.get("libraryId")?.trim() || null;

    const rows = await db
      .select()
      .from(librarySetting)
      .where(eq(librarySetting.organizationId, access.activeOrganizationId!));

    const settings: Record<string, string> = { ...LIBRARY_SETTINGS_DEFAULTS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Get library settings error:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

// PUT — save all settings atomically
export async function PUT(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "LIB_OPERATOR"],
    });

    const body = await request.json();
    // Accept libraryId for forward-compatibility (currently unused in upsert)
    const { settings, libraryId: _libraryId } = body as { settings: Record<string, string>; libraryId?: string | null };

    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 });
    }

    // Only allow known keys
    const allowedKeys = new Set(Object.keys(LIBRARY_SETTINGS_DEFAULTS));
    const changes: Record<string, string> = {};

    for (const [key, value] of Object.entries(settings)) {
      if (allowedKeys.has(key)) {
        changes[key] = String(value);
      }
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(changes)) {
        const [existing] = await tx
          .select({ id: librarySetting.id })
          .from(librarySetting)
          .where(and(eq(librarySetting.key, key), eq(librarySetting.organizationId, access.activeOrganizationId!)))
          .limit(1);

        if (existing) {
          await tx
            .update(librarySetting)
            .set({ value, updatedAt: now, updatedBy: access.actorUserId })
            .where(and(eq(librarySetting.key, key), eq(librarySetting.organizationId, access.activeOrganizationId!)));
        } else {
          await tx.insert(librarySetting).values({
            organizationId: access.activeOrganizationId!,
            key,
            value,
            updatedAt: now,
            updatedBy: access.actorUserId,
          });
        }
      }
    });

    await logAudit({
      userId: access.actorUserId,
      userRole: access.membershipRole || access.session.user.role,
      action: AUDIT_ACTIONS.LIBRARY_SETTINGS_UPDATED,
      details: { organizationId: access.activeOrganizationId, changes },
      request,
    });

    // Return updated settings
    const rows = await db
      .select()
      .from(librarySetting)
      .where(eq(librarySetting.organizationId, access.activeOrganizationId!));
    const merged: Record<string, string> = { ...LIBRARY_SETTINGS_DEFAULTS };
    for (const row of rows) {
      merged[row.key] = row.value;
    }

    return NextResponse.json({ settings: merged });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Update settings error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
