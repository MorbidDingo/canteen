import { NextResponse } from "next/server";
import { cloudinary, configureCloudinary } from "@/lib/cloudinary";
import { db } from "@/lib/db";
import { child } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/photos/upload
 *
 * Upload a single photo for a student
 * Only accessible to MANAGEMENT and ATTENDANCE roles
 *
 * Body: FormData with:
 * - file: File
 * - childId: string (UUID of child)
 */
export async function POST(request: Request) {
  try {
    const cfg = configureCloudinary();
    if (!cfg.ok) {
      return NextResponse.json(
        { error: cfg.error },
        { status: 500 },
      );
    }

    // TODO: Add auth check - verify user is MANAGEMENT or ATTENDANCE
    // const session = await auth();
    // if (!session?.user || !['MANAGEMENT', 'ATTENDANCE'].includes(session.user.role)) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    // }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const childId = formData.get("childId") as string;

    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 },
      );
    }

    if (!childId) {
      return NextResponse.json(
        { error: "childId is required" },
        { status: 400 },
      );
    }

    // Verify child exists
    const [studentExists] = await db
      .select({ id: child.id })
      .from(child)
      .where(eq(child.id, childId))
      .limit(1);

    if (!studentExists) {
      return NextResponse.json(
        { error: "Student not found" },
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
          folder: `canteen/student-photos/${childId}`,
          public_id: `photo-${Date.now()}`,
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

    // Update child photo URL
    const uploadedResult = result as { secure_url: string };
    await db
      .update(child)
      .set({
        image: uploadedResult.secure_url,
        updatedAt: new Date(),
      })
      .where(eq(child.id, childId));

    return NextResponse.json({
      success: true,
      photoUrl: uploadedResult.secure_url,
      message: "Photo uploaded successfully",
    });
  } catch (error) {
    console.error("Photo upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload photo" },
      { status: 500 },
    );
  }
}
