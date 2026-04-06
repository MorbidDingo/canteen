import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bulkPhotoUpload } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/photos/bulk-upload/[id]/status
 *
 * Get status of a bulk upload
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    const [upload] = await db
      .select()
      .from(bulkPhotoUpload)
      .where(eq(bulkPhotoUpload.id, id));

    if (!upload) {
      return NextResponse.json(
        { error: "Bulk upload not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: upload.id,
      fileName: upload.fileName,
      totalFiles: upload.totalFiles,
      processedFiles: upload.processedFiles,
      failedFiles: upload.failedFiles,
      status: upload.status,
      currentStep: upload.currentStep,
      errorMessage: upload.errorMessage,
      progress: {
        percentage: Math.floor(
          ((upload.processedFiles + upload.failedFiles) /
            upload.totalFiles) *
            100,
        ),
        processed: upload.processedFiles,
        failed: upload.failedFiles,
        remaining: upload.totalFiles - upload.processedFiles - upload.failedFiles,
      },
      createdAt: upload.createdAt,
      startedAt: upload.startedAt,
      completedAt: upload.completedAt,
    });
  } catch (error) {
    console.error("Bulk upload status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
