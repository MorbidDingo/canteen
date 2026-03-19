import { NextResponse } from "next/server";
import { cloudinary, configureCloudinary } from "@/lib/cloudinary";
import { db } from "@/lib/db";
import { menuItem } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

/**
 * POST /api/menu/upload
 *
 * Upload an image for a menu item
 * Only accessible to ADMIN and OPERATOR roles
 *
 * Body: FormData with:
 * - file: File
 * - menuItemId: string (UUID of menu item)
 */
export async function POST(request: Request) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["ADMIN", "MANAGEMENT", "OPERATOR"],
    });

    const cfg = configureCloudinary();
    if (!cfg.ok) {
      return NextResponse.json(
        { error: cfg.error },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const itemId = formData.get("menuItemId") as string;

    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 },
      );
    }

    if (!itemId) {
      return NextResponse.json(
        { error: "menuItemId is required" },
        { status: 400 },
      );
    }

    // Verify menu item exists
    const [itemExists] = await db
      .select({ id: menuItem.id })
      .from(menuItem)
      .where(and(eq(menuItem.id, itemId), eq(menuItem.organizationId, access.activeOrganizationId!)))
      .limit(1);

    if (!itemExists) {
      return NextResponse.json(
        { error: "Menu item not found" },
        { status: 404 },
      );
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "File must be an image" },
        { status: 400 },
      );
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `canteen/menu-items/${itemId}`,
          public_id: `image-${Date.now()}`,
          resource_type: "auto",
          quality: "auto",
        },
        (error: any, result: any) => {
          if (error) reject(error);
          else resolve(result);
        },
      );

      uploadStream.end(buffer);
    });

    // Update menu item image URL
    const uploadedResult = result as { secure_url: string };
    await db
      .update(menuItem)
      .set({
        imageUrl: uploadedResult.secure_url,
        updatedAt: new Date(),
      })
      .where(and(eq(menuItem.id, itemId), eq(menuItem.organizationId, access.activeOrganizationId!)));

    return NextResponse.json({
      success: true,
      imageUrl: uploadedResult.secure_url,
      message: "Image uploaded successfully",
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Menu image upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 },
    );
  }
}
