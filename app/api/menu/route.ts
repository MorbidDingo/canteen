import { db } from "@/lib/db";
import { menuItem } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const items = await db
      .select()
      .from(menuItem)
      .where(eq(menuItem.available, true));

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch menu items" },
      { status: 500 },
    );
  }
}
