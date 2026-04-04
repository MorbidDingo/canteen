import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentPost, contentPostAttachment } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { uploadFileToS3 } from "@/lib/s3";
import { configureCloudinary } from "@/lib/cloudinary";
import cloudinary from "cloudinary";
import { isSupportedForEmbedding, enqueueAttachmentProcessing } from "@/lib/ai/content-embeddings";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const MAX_S3_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_CLOUDINARY_SIZE = 20 * 1024 * 1024; // 20 MB

// POST — upload attachment to a post
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN", "OPERATOR", "LIB_OPERATOR", "ATTENDANCE", "PARENT", "GENERAL"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const organizationId = access.activeOrganizationId!;
  const { id: postId } = await params;

  // Verify post ownership
  const [post] = await db
    .select({ id: contentPost.id })
    .from(contentPost)
    .where(
      and(
        eq(contentPost.id, postId),
        eq(contentPost.organizationId, organizationId),
        eq(contentPost.authorUserId, access.actorUserId),
      ),
    )
    .limit(1);

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const mimeType = file.type;
  const isImage = IMAGE_TYPES.has(mimeType);
  const maxSize = isImage ? MAX_CLOUDINARY_SIZE : MAX_S3_SIZE;

  if (file.size > maxSize) {
    return NextResponse.json(
      { error: `File too large (max ${isImage ? "20" : "50"} MB)` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let storageBackend: "S3" | "CLOUDINARY";
  let storageKey: string;

  if (isImage) {
    // Upload to Cloudinary
    const config = configureCloudinary();
    if (!config.ok) {
      return NextResponse.json({ error: "Cloudinary not configured" }, { status: 500 });
    }

    const result = await new Promise<cloudinary.UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.v2.uploader.upload_stream(
        {
          folder: `content/posts/${postId}`,
          public_id: `att-${Date.now()}`,
          resource_type: "auto",
          quality: "auto",
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result!);
        },
      );
      uploadStream.end(buffer);
    });

    storageBackend = "CLOUDINARY";
    storageKey = result.secure_url;
  } else {
    // Upload to S3
    const ext = file.name.split(".").pop() || "bin";
    const s3Key = `content/posts/${postId}/${crypto.randomUUID()}.${ext}`;
    await uploadFileToS3(s3Key, buffer, mimeType);
    storageBackend = "S3";
    storageKey = s3Key;
  }

  const [attachment] = await db
    .insert(contentPostAttachment)
    .values({
      postId,
      storageBackend,
      storageKey,
      originalFileName: file.name,
      mimeType,
      size: file.size,
    })
    .returning();

  // Fire-and-forget: process document for vector embeddings if supported
  if (isSupportedForEmbedding(mimeType)) {
    enqueueAttachmentProcessing({
      attachmentId: attachment.id,
      postId,
      organizationId,
      storageBackend,
      storageKey,
      mimeType,
      filename: file.name,
    });
  }

  return NextResponse.json({ attachment }, { status: 201 });
}
