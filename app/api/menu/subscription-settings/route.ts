import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSetting } from "@/lib/db/schema";
import { APP_SETTINGS_DEFAULTS } from "@/lib/constants";
import { parseBreakSlots, breakNames } from "@/lib/break-slots";

// GET - fetch subscription-related app settings (public, no auth required)
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
      subscription_breaks: breakNames(parseBreakSlots(settings.subscription_breaks_json)),
      subscription_break_slots: parseBreakSlots(settings.subscription_breaks_json),
    });
  } catch {
    const fallbackSlots = parseBreakSlots(APP_SETTINGS_DEFAULTS.subscription_breaks_json);
    return NextResponse.json({
      subscription_min_order_value: APP_SETTINGS_DEFAULTS.subscription_min_order_value,
      subscription_min_days: APP_SETTINGS_DEFAULTS.subscription_min_days,
      subscription_max_days: APP_SETTINGS_DEFAULTS.subscription_max_days,
      subscription_breaks: breakNames(fallbackSlots),
      subscription_break_slots: fallbackSlots,
    });
  }
}
