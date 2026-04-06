import { v2 as cloudinary } from "cloudinary";
import { db } from "@/lib/db";
import { bulkPhotoUpload, photoUploadBatch, child } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface PhotoEntry {
  grNumber: string;
  fileName: string;
  base64?: string;
  fileData?: Buffer;
}

/**
 * Process bulk photo upload
 * Handles step-by-step processing with progress tracking
 */
export async function processBulkPhotoUpload(
  bulkUploadId: string,
  photos: PhotoEntry[],
  onProgress?: (step: string, progress: number) => void,
) {
  const [bulkUpload] = await db
    .select()
    .from(bulkPhotoUpload)
    .where(eq(bulkPhotoUpload.id, bulkUploadId));

  if (!bulkUpload) {
    throw new Error("Bulk upload not found");
  }

  try {
    // Step 1: File Validation
    await updateBulkUploadStatus(
      bulkUploadId,
      "VALIDATING",
      "FILE_VALIDATION",
      null,
    );
    onProgress?.("FILE_VALIDATION", 10);

    // Validate all photos have required fields
    for (const photo of photos) {
      if (!photo.grNumber || !photo.fileName) {
        throw new Error(
          `Invalid photo entry: missing grNumber or fileName in ${photo.fileName}`,
        );
      }
    }

    // Step 2: Structure Check
    await updateBulkUploadStatus(
      bulkUploadId,
      "PROCESSING",
      "STRUCTURE_CHECK",
      null,
    );
    onProgress?.("STRUCTURE_CHECK", 20);

    // Map GR numbers to child IDs
    const grNumbers = photos.map((p) => p.grNumber);
    const childRecords = await db
      .select({
        id: child.id,
        grNumber: child.grNumber,
      })
      .from(child)
      .where(
        and(
          eq(child.grNumber, grNumbers[0]),
          ...grNumbers.slice(1).map((gr) => eq(child.grNumber, gr)),
        ),
      );

    const grToChildMap = new Map(
      childRecords.map((c) => [c.grNumber, c.id]),
    );

    // Check for missing students
    const missingGrNumbers = grNumbers.filter((gr) => !grToChildMap.has(gr));
    if (missingGrNumbers.length > 0) {
      throw new Error(
        `Students not found: ${missingGrNumbers.join(", ")}`,
      );
    }

    // Step 3: Photo Processing
    await updateBulkUploadStatus(
      bulkUploadId,
      "PROCESSING",
      "PHOTO_PROCESSING",
      null,
    );
    onProgress?.("PHOTO_PROCESSING", 30);

    let processedCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const photo of photos) {
      try {
        const childId = grToChildMap.get(photo.grNumber);
        if (!childId) {
          throw new Error(`No child ID for GR: ${photo.grNumber}`);
        }

        // Create batch record
        const [batchRecord] = await db
          .insert(photoUploadBatch)
          .values({
            bulkUploadId,
            childId,
            photoUrl: "", // Will be updated after upload
            originalFileName: photo.fileName,
            uploadStatus: "PENDING",
          })
          .returning({ id: photoUploadBatch.id });

        // Upload to cloudinary
        let photoUrl = "";
        try {
          if (photo.base64) {
            // Base64 encoded photo
            const buffer = Buffer.from(photo.base64, "base64");
            photoUrl = await uploadPhotoBuffer(buffer, childId, photo.fileName);
          } else if (photo.fileData) {
            // Binary file data
            photoUrl = await uploadPhotoBuffer(
              photo.fileData,
              childId,
              photo.fileName,
            );
          } else {
            throw new Error("No photo data provided");
          }

          // Update batch record with success
          await db
            .update(photoUploadBatch)
            .set({
              photoUrl,
              uploadStatus: "SUCCESS",
              processingCompletedAt: new Date(),
            })
            .where(eq(photoUploadBatch.id, batchRecord.id));

          // Update child photo
          await db
            .update(child)
            .set({
              image: photoUrl,
              updatedAt: new Date(),
            })
            .where(eq(child.id, childId));

          processedCount++;
        } catch (uploadErr) {
          const errorMsg =
            uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
          await db
            .update(photoUploadBatch)
            .set({
              uploadStatus: "FAILED",
              errorReason: errorMsg,
              processingCompletedAt: new Date(),
            })
            .where(eq(photoUploadBatch.id, batchRecord.id));

          failedCount++;
          errors.push(`${photo.grNumber} (${photo.fileName}): ${errorMsg}`);
        }

        // Update progress
        const progressPercent = 30 + ((processedCount + failedCount) / photos.length) * 50;
        onProgress?.(
          "PHOTO_PROCESSING",
          Math.floor(progressPercent),
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        failedCount++;
        errors.push(`${photo.grNumber}: ${errorMsg}`);
      }
    }

    // Step 4: Database Update
    await updateBulkUploadStatus(
      bulkUploadId,
      failedCount > 0 ? "FAILED" : "COMPLETED",
      "DATABASE_UPDATE",
      failedCount > 0
        ? `Processed: ${processedCount}, Failed: ${failedCount}`
        : null,
    );
    onProgress?.("DATABASE_UPDATE", 90);

    // Final update
    await db
      .update(bulkPhotoUpload)
      .set({
        processedFiles: processedCount,
        failedFiles: failedCount,
        status: failedCount > 0 ? "FAILED" : "COMPLETED",
        currentStep: "COMPLETED",
        completedAt: new Date(),
        errorMessage:
          errors.length > 0
            ? `Failed files:\n${errors.join("\n")}`
            : null,
      })
      .where(eq(bulkPhotoUpload.id, bulkUploadId));

    onProgress?.("COMPLETED", 100);

    return {
      success: failedCount === 0,
      processedCount,
      failedCount,
      errors: errors.length > 0 ? errors : null,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    await updateBulkUploadStatus(
      bulkUploadId,
      "FAILED",
      "FAILED",
      errorMsg,
    );

    throw error;
  }
}

async function uploadPhotoBuffer(
  buffer: Buffer,
  childId: string,
  fileName: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `canteen/student-photos/${childId}`,
        public_id: `photo-${Date.now()}`,
        resource_type: "auto",
        quality: "auto",
      },
      (error: any, result: any) => {
        if (error) {
          reject(
            new Error(
              `Cloudinary upload failed: ${error.message}`,
            ),
          );
        } else {
          resolve(result.secure_url);
        }
      },
    );

    uploadStream.end(buffer);
  });
}

async function updateBulkUploadStatus(
  bulkUploadId: string,
  status: string,
  currentStep: string,
  errorMessage: string | null,
) {
  await db
    .update(bulkPhotoUpload)
    .set({
      status: status as any,
      currentStep: currentStep as any,
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(bulkPhotoUpload.id, bulkUploadId));
}
