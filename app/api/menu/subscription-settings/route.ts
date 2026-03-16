import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSetting } from "@/lib/db/schema";
import { APP_SETTINGS_DEFAULTS } from "@/lib/constants";

// GET — fetch subscription-related app settings (public, no auth required)
export async function GET() {
  try {
    const rows = await db.select().from(appSetting);
    const settings: Record<string, string> = { ...APP_SETTINGS_DEFAULTS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return NextResponse.json({
      subscription_min_order_value: settings.subscription_min_order_value,
      subscription_min_days: settings.subscription_min_days,
      subscription_max_days: settings.subscription_max_days,
    });
  } catch {
    return NextResponse.json(APP_SETTINGS_DEFAULTS);
  }
}
