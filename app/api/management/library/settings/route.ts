import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { librarySetting } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { LIBRARY_SETTINGS_DEFAULTS } from "@/lib/constants";

// GET — return all settings (merged with defaults)
export async function GET() {
  const session = await getSession();
  if (!session?.user || (session.user.role !== "MANAGEMENT" && session.user.role !== "LIB_OPERATOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db.select().from(librarySetting);

  const settings: Record<string, string> = { ...LIBRARY_SETTINGS_DEFAULTS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return NextResponse.json({ settings });
}

// PUT — save all settings atomically
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || (session.user.role !== "MANAGEMENT" && session.user.role !== "LIB_OPERATOR")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { settings } = body as { settings: Record<string, string> };

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
          .where(eq(librarySetting.key, key))
          .limit(1);

        if (existing) {
          await tx
            .update(librarySetting)
            .set({ value, updatedAt: now, updatedBy: session.user.id })
            .where(eq(librarySetting.key, key));
        } else {
          await tx.insert(librarySetting).values({
            key,
            value,
            updatedAt: now,
            updatedBy: session.user.id,
          });
        }
      }
    });

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.LIBRARY_SETTINGS_UPDATED,
      details: { changes },
      request,
    });

    // Return updated settings
    const rows = await db.select().from(librarySetting);
    const merged: Record<string, string> = { ...LIBRARY_SETTINGS_DEFAULTS };
    for (const row of rows) {
      merged[row.key] = row.value;
    }

    return NextResponse.json({ settings: merged });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
