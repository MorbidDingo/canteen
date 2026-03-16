import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSetting } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { APP_SETTINGS_DEFAULTS } from "@/lib/constants";

// GET — fetch all app settings (merged with defaults)
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await db.select().from(appSetting);
    const settings: Record<string, string> = { ...APP_SETTINGS_DEFAULTS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Fetch app settings error:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

// POST — upsert app settings
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { settings } = body as { settings: Record<string, string> };

    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "Invalid settings data" }, { status: 400 });
    }

    for (const [key, value] of Object.entries(settings)) {
      const [existing] = await db
        .select()
        .from(appSetting)
        .where(eq(appSetting.key, key));

      if (existing) {
        await db
          .update(appSetting)
          .set({ value: String(value), updatedAt: new Date(), updatedBy: session.user.id })
          .where(eq(appSetting.key, key));
      } else {
        await db.insert(appSetting).values({
          key,
          value: String(value),
          updatedBy: session.user.id,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update app settings error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
