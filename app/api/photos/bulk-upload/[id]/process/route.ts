import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkPhotoUpload } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { processBulkPhotoUpload } from "@/lib/photo-upload-service";

/**
 * POST /api/photos/bulk-upload/[id]/process
 *
 * Process a bulk photo upload
 * The file should have been uploaded before in the start endpoint
 *
 * Body: FormData with:
 * - file: File (JSON or ZIP containing photos and/or manifest)
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 },
      );
    }

    // Verify bulk upload exists
    const [bulkUpload] = await db
      .select()
      .from(bulkPhotoUpload)
      .where(eq(bulkPhotoUpload.id, id));

    if (!bulkUpload) {
      return NextResponse.json(
        { error: "Bulk upload not found" },
        { status: 404 },
      );
    }

    // Check if already processing or completed
    if (
      bulkUpload.status === "PROCESSING" ||
      bulkUpload.status === "COMPLETED"
    ) {
      return NextResponse.json(
        {
          error: `Bulk upload is already ${bulkUpload.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    // Parse the file
    const isJson = file.type === "application/json";
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let photos: Array<{
      grNumber: string;
      fileName: string;
      base64?: string;
      fileData?: Buffer;
    }> = [];

    if (isJson) {
      const jsonContent = buffer.toString("utf-8");
      const data = JSON.parse(jsonContent);

      if (!Array.isArray(data.photos)) {
        return NextResponse.json(
          { error: "Invalid JSON: photos must be an array" },
          { status: 400 },
        );
      }

      photos = data.photos;

      // Validate each photo has required fields and data
      for (const photo of photos) {
        if (!photo.grNumber || !photo.fileName) {
          return NextResponse.json(
            {
              error: `Invalid photo entry: missing grNumber or fileName`,
            },
            { status: 400 },
          );
        }
        if (!photo.base64) {
          return NextResponse.json(
            {
              error: `Photo for ${photo.grNumber} missing base64 encoded data`,
            },
            { status: 400 },
          );
        }
      }
    } else {
      return NextResponse.json(
        {
          error: "ZIP format not yet implemented. Please use JSON format with base64 encoded photos.",
        },
        { status: 400 },
      );
    }

    // Start processing in background
    // In a production app, you'd queue this with Bull, RabbitMQ, etc.
    processInBackground(id, photos);

    return NextResponse.json({
      success: true,
      bulkUploadId: id,
      message: "Bulk upload processing started",
      totalPhotos: photos.length,
      nextCheckUrl: `/api/photos/bulk-upload/${id}/status`,
    });
  } catch (error) {
    console.error("Bulk upload process error:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to process: ${errorMsg}` },
      { status: 500 },
    );
  }
}

// Background processing (in production, use a job queue)
async function processInBackground(
  bulkUploadId: string,
  photos: Array<{
    grNumber: string;
    fileName: string;
    base64?: string;
  }>,
) {
  try {
    await processBulkPhotoUpload(bulkUploadId, photos, (step, progress) => {
      console.log(`[${bulkUploadId}] ${step}: ${progress}%`);
    });
  } catch (error) {
    console.error(`Failed to process bulk upload ${bulkUploadId}:`, error);
  }
}
