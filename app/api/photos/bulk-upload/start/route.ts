import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkPhotoUpload } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/photos/bulk-upload/start
 *
 * Initialize a bulk photo upload session
 * Expected file format:
 *
 * Option 1: ZIP file with:
 *   manifest.json:
 *   {
 *     "photos": [
 *       { "grNumber": "12345", "fileName": "photo1.jpg" },
 *       { "grNumber": "12346", "fileName": "photo2.jpg" }
 *     ]
 *   }
 *   photo1.jpg, photo2.jpg, ...
 *
 * Option 2: JSON file with:
 *   {
 *     "photos": [
 *       { "grNumber": "12345", "fileName": "photo1.jpg", "base64": "..." },
 *       { "grNumber": "12346", "fileName": "photo2.jpg", "base64": "..." }
 *     ]
 *   }
 *
 * Only ATTENDANCE and MANAGEMENT roles can use this
 */
export async function POST(request: Request) {
  try {
    // TODO: Add auth check
    // const session = await auth();
    // if (!session?.user || !['MANAGEMENT', 'ATTENDANCE'].includes(session.user.role)) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    // }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const userId = formData.get("userId") as string; // Temporary - should come from auth

    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 },
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    // Validate file type
    const isZip =
      file.type === "application/zip" ||
      file.type === "application/x-zip-compressed";
    const isJson = file.type === "application/json";

    if (!isZip && !isJson) {
      return NextResponse.json(
        { error: "File must be ZIP or JSON" },
        { status: 400 },
      );
    }

    // Get file content
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let manifestData: { photos: Array<{ grNumber: string; fileName: string }> };

    if (isJson) {
      // Parse JSON file
      const jsonContent = buffer.toString("utf-8");
      try {
        const data = JSON.parse(jsonContent);
        if (!Array.isArray(data.photos)) {
          throw new Error("photos must be an array");
        }
        manifestData = data;
      } catch (err) {
        return NextResponse.json(
          { error: "Invalid JSON format" },
          { status: 400 },
        );
      }
    } else {
      // For ZIP files, we'd need to extract and parse manifest.json
      // This requires unzipping which we'll handle in a utility
      return NextResponse.json(
        {
          error: "ZIP format not yet implemented. Please use JSON format.",
        },
        { status: 400 },
      );
    }

    // Validate manifest
    if (!manifestData.photos || manifestData.photos.length === 0) {
      return NextResponse.json(
        { error: "No photos found in manifest" },
        { status: 400 },
      );
    }

    // Create bulk upload record
    const [bulkUpload] = await db
      .insert(bulkPhotoUpload)
      .values({
        uploadedBy: userId,
        fileName: file.name,
        fileSize: buffer.length,
        totalFiles: manifestData.photos.length,
        status: "UPLOADED",
        currentStep: "FILE_RECEIVED",
        metadata: JSON.stringify({
          format: isJson ? "json" : "zip",
          originalFileName: file.name,
        }),
      })
      .returning({ id: bulkPhotoUpload.id });

    return NextResponse.json({
      success: true,
      bulkUploadId: bulkUpload.id,
      totalFiles: manifestData.photos.length,
      message: "Bulk upload initialized. You can now process the photos.",
      nextStep: "Ready to process",
    });
  } catch (error) {
    console.error("Bulk upload start error:", error);
    return NextResponse.json(
      { error: "Failed to initialize bulk upload" },
      { status: 500 },
    );
  }
}
