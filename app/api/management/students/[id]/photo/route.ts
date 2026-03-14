import { NextRequest, NextResponse } from "next/server";
import { cloudinary, configureCloudinary } from "@/lib/cloudinary";
import { db } from "@/lib/db";
import { child } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

/**
 * POST /api/management/students/[id]/photo
 *
 * Upload or update a student's photo.
 * Management role only — guards should verify identity using this photo.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "MANAGEMENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const cfg = configureCloudinary();
    if (!cfg.ok) {
      return NextResponse.json({ error: cfg.error }, { status: 500 });
    }

    // Verify student exists
    const [student] = await db
      .select({ id: child.id, name: child.name })
      .from(child)
      .where(eq(child.id, id))
      .limit(1);

    if (!student) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Invalid file type. Only JPEG, PNG, and WebP are allowed.",
        },
        { status: 400 },
      );
    }

    // Validate file size (max 5MB for photos)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 },
      );
    }

    // Upload to Cloudinary and store secure CDN URL
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `canteen/student-photos/${id}`,
          public_id: `student-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          resource_type: "image",
          quality: "auto",
        },
        (error, uploadResult) => {
          if (error) {
            reject(error);
            return;
          }

          if (!uploadResult?.secure_url) {
            reject(new Error("Cloudinary did not return a secure URL"));
            return;
          }

          resolve({ secure_url: uploadResult.secure_url });
        },
      );

      uploadStream.end(buffer);
    });

    const imageUrl = result.secure_url;

    // Update child record with image
    await db
      .update(child)
      .set({ image: imageUrl, updatedAt: new Date() })
      .where(eq(child.id, id));

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.STUDENT_PHOTO_UPDATED,
      details: { studentId: id, studentName: student.name, imageUrl },
      request,
    });

    return NextResponse.json({ imageUrl }, { status: 200 });
  } catch (error) {
    console.error("Student photo upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload photo" },
      { status: 500 },
    );
  }
}
