import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { cloudinary, configureCloudinary } from "@/lib/cloudinary";
import { requireAccess, AccessDeniedError } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import {
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MIME_TYPES,
} from "@/lib/profile-photo";

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({ scope: "organization" });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const cfg = configureCloudinary();
    if (!cfg.ok) {
      return NextResponse.json({ error: cfg.error }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!PROFILE_PHOTO_MIME_TYPES.includes(file.type as (typeof PROFILE_PHOTO_MIME_TYPES)[number])) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, and WebP are allowed." },
        { status: 400 },
      );
    }

    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const userId = access.actorUserId;

    const uploadResult = await new Promise<{ secure_url: string }>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: `canteen/profile-photos/${userId}`,
            public_id: `profile-${userId}`,
            resource_type: "image",
            quality: "auto",
            overwrite: true,
            invalidate: true,
          },
          (error, result) => {
            if (error) {
              reject(error);
              return;
            }
            if (!result?.secure_url) {
              reject(new Error("Cloudinary did not return a secure URL"));
              return;
            }
            resolve({ secure_url: result.secure_url });
          },
        );

        uploadStream.end(buffer);
      },
    );

    await db
      .update(user)
      .set({ image: uploadResult.secure_url, updatedAt: new Date() })
      .where(eq(user.id, userId));

    return NextResponse.json({ imageUrl: uploadResult.secure_url });
  } catch (error) {
    console.error("Profile photo upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload profile photo" },
      { status: 500 },
    );
  }
}
