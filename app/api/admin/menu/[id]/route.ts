import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { menuItem } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const updateMenuItemSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  price: z.number().positive().optional(),
  category: z.enum(["SNACKS", "MEALS", "DRINKS"]).optional(),
  imageUrl: z.string().optional().or(z.literal("")).optional(),
  available: z.boolean().optional(),
});

// PATCH — update a menu item
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateMenuItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check if item exists
    const [existing] = await db
      .select()
      .from(menuItem)
      .where(eq(menuItem.id, id));

    if (!existing) {
      return NextResponse.json(
        { error: "Menu item not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };

    // Handle empty imageUrl → null
    if (updateData.imageUrl === "") {
      updateData.imageUrl = null;
    }

    const [updated] = await db
      .update(menuItem)
      .set(updateData)
      .where(eq(menuItem.id, id))
      .returning();

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error("Update menu item error:", error);
    return NextResponse.json(
      { error: "Failed to update menu item" },
      { status: 500 }
    );
  }
}

// DELETE — remove a menu item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [existing] = await db
      .select()
      .from(menuItem)
      .where(eq(menuItem.id, id));

    if (!existing) {
      return NextResponse.json(
        { error: "Menu item not found" },
        { status: 404 }
      );
    }

    await db.delete(menuItem).where(eq(menuItem.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete menu item error:", error);
    return NextResponse.json(
      { error: "Failed to delete menu item" },
      { status: 500 }
    );
  }
}
