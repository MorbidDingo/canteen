import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { menuItem } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

// GET — list all menu items (including unavailable ones for admin)
export async function GET() {
  try {
    const items = await db
      .select()
      .from(menuItem)
      .orderBy(desc(menuItem.createdAt));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Admin fetch menu error:", error);
    return NextResponse.json(
      { error: "Failed to fetch menu items" },
      { status: 500 }
    );
  }
}

const createMenuItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  price: z.number().positive("Price must be positive"),
  category: z.enum(["SNACKS", "MEALS", "DRINKS"]),
  imageUrl: z.string().optional().or(z.literal("")),
  available: z.boolean().default(true),
});

// POST — create a new menu item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createMenuItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const [created] = await db
      .insert(menuItem)
      .values({
        name: data.name,
        description: data.description || null,
        price: data.price,
        category: data.category,
        imageUrl: data.imageUrl || null,
        available: data.available,
      })
      .returning();

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error) {
    console.error("Create menu item error:", error);
    return NextResponse.json(
      { error: "Failed to create menu item" },
      { status: 500 }
    );
  }
}
