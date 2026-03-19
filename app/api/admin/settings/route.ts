import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSetting } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { APP_SETTINGS_DEFAULTS } from "@/lib/constants";

// GET — fetch all app settings (merged with defaults)
export async function GET() {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN"],
    });

    if (access.deviceLoginProfile) {
      return NextResponse.json(
        { error: "Settings controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
        { status: 403 },
      );
    }

    const organizationId = access.activeOrganizationId!;

    const rows = await db
      .select()
      .from(appSetting)
      .where(eq(appSetting.organizationId, organizationId));
    const settings: Record<string, string> = { ...APP_SETTINGS_DEFAULTS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Fetch app settings error:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

// POST — upsert app settings
export async function POST(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN"],
    });

    if (access.deviceLoginProfile) {
      return NextResponse.json(
        { error: "Settings controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
        { status: 403 },
      );
    }

    const organizationId = access.activeOrganizationId!;

    const body = await request.json();
    const { settings } = body as { settings: Record<string, string> };

    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "Invalid settings data" }, { status: 400 });
    }

    for (const [key, value] of Object.entries(settings)) {
      const [existing] = await db
        .select()
        .from(appSetting)
        .where(and(eq(appSetting.key, key), eq(appSetting.organizationId, organizationId)));

      if (existing) {
        await db
          .update(appSetting)
          .set({ value: String(value), updatedAt: new Date(), updatedBy: access.actorUserId })
          .where(and(eq(appSetting.key, key), eq(appSetting.organizationId, organizationId)));
      } else {
        await db.insert(appSetting).values({
          organizationId,
          key,
          value: String(value),
          updatedBy: access.actorUserId,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Update app settings error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
