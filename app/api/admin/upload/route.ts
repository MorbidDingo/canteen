import { NextRequest, NextResponse } from "next/server";
import { cloudinary, configureCloudinary } from "@/lib/cloudinary";

// POST — upload a food item image
export async function POST(request: NextRequest) {
  try {
    const cfg = configureCloudinary();
    if (!cfg.ok) {
      return NextResponse.json({ error: cfg.error }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed." },
        { status: 400 }
      );
    }

    // Validate file size (max 20MB)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 20MB." },
        { status: 400 }
      );
    }

    // Upload to Cloudinary and return CDN URL
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "canteen/menu-items/admin",
          public_id: `menu-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
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

    return NextResponse.json({ imageUrl }, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
