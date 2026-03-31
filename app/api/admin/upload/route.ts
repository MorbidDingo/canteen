import { NextRequest, NextResponse } from "next/server";
import { cloudinary, configureCloudinary } from "@/lib/cloudinary";

const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const VALID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VALID_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];

// POST — upload a food item image
export async function POST(request: NextRequest) {
  try {
    const cfg = configureCloudinary();
    if (!cfg.ok) {
      return NextResponse.json({ error: cfg.error }, { status: 500 });
    }

    let formData: globalThis.FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      const looksLikeBodyLimit =
        message.includes("boundary") ||
        message.includes("formdata") ||
        message.includes("body") ||
        message.includes("size");

      return NextResponse.json(
        {
          error: looksLikeBodyLimit
            ? "Upload payload is invalid or too large. Please upload a file below 20MB."
            : "Failed to parse upload payload",
        },
        { status: looksLikeBodyLimit ? 413 : 400 },
      );
    }

    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const normalizedMimeType = file.type.split(";")[0]?.trim().toLowerCase() || "";
    const kind = (formData.get("kind") as string | null)?.trim().toLowerCase() || "auto";
    const inferredIsVideo = normalizedMimeType.startsWith("video/");
    const isVideo = kind === "video" || (kind === "auto" && inferredIsVideo);

    if (isVideo && !VALID_VIDEO_TYPES.includes(normalizedMimeType)) {
      return NextResponse.json(
        { error: "Invalid video type. Only MP4, WebM, OGG, and MOV are allowed." },
        { status: 400 },
      );
    }

    if (!isVideo && !VALID_IMAGE_TYPES.includes(normalizedMimeType)) {
      return NextResponse.json(
        { error: "Invalid image type. Only JPEG, PNG, WebP, and GIF are allowed." },
        { status: 400 },
      );
    }

    // Validate file size (max 20MB)
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 20MB." },
        { status: 413 },
      );
    }

    // Upload to Cloudinary and return CDN URL
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "canteen/menu-items/admin",
          public_id: `menu-${isVideo ? "video" : "image"}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          resource_type: isVideo ? "video" : "image",
          quality: "auto",
          ...(isVideo
            ? {
                transformation: [
                  { width: 1280, crop: "limit" },
                  { quality: "auto:low", fetch_format: "mp4", bit_rate: "1100k" },
                ],
              }
            : {}),
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

    return NextResponse.json(
      { imageUrl, assetUrl: imageUrl, mediaType: isVideo ? "video" : "image" },
      { status: 201 },
    );
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
