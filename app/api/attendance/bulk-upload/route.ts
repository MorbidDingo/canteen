import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { bulkPhotoUpload, child, photoUploadBatch } from "@/lib/db/schema";
import { getSession } from "@/lib/auth-server";
import { configureCloudinary, cloudinary } from "@/lib/cloudinary";
import { runParallelForEach, type RowProgressLog } from "@/lib/bulk-upload-engine";

type UploadRow = {
  row: number;
  grNumber: string;
  fileName: string;
  base64: string;
};

type UploadResult = {
  row: number;
  grNumber: string;
  status: "created" | "skipped" | "error";
  message: string;
};

const MAX_ROWS = 2000;
const CONCURRENCY = Math.max(1, Number(process.env.ATTENDANCE_BULK_PHOTO_CONCURRENCY || 6));

function isStreamRequested(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get("mode") === "stream";
}

function normalizeRows(rawRows: Record<string, unknown>[]): UploadRow[] {
  return rawRows.map((raw, index) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      normalized[key.trim().toLowerCase()] = String(value ?? "").trim();
    }

    const grNumber =
      normalized["grnumber"] ||
      normalized["gr"] ||
      normalized["gr number"] ||
      "";

    const fileName =
      normalized["filename"] ||
      normalized["file name"] ||
      normalized["name"] ||
      `${grNumber || "student"}-${index + 2}.jpg`;

    const base64 =
      normalized["base64"] ||
      normalized["imagebase64"] ||
      normalized["photo"] ||
      normalized["photobase64"] ||
      normalized["image"] ||
      "";

    return {
      row: index + 2,
      grNumber,
      fileName,
      base64,
    };
  });
}

function parseRows(fileName: string, buffer: Buffer): UploadRow[] {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  if (ext === "json") {
    const parsed = JSON.parse(buffer.toString("utf-8")) as {
      photos?: Array<{ grNumber?: string; fileName?: string; base64?: string }>;
    };
    const photos = Array.isArray(parsed.photos) ? parsed.photos : [];
    return photos.map((photo, index) => ({
      row: index + 2,
      grNumber: String(photo.grNumber || "").trim(),
      fileName: String(photo.fileName || `${photo.grNumber || "student"}-${index + 2}.jpg`).trim(),
      base64: String(photo.base64 || "").trim(),
    }));
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return [];
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName]);
  return normalizeRows(rawRows);
}

function validateRows(rows: UploadRow[]) {
  const errors: { row: number; error: string }[] = [];
  for (const row of rows) {
    if (!row.grNumber) errors.push({ row: row.row, error: "GR number is required" });
    if (!row.base64) errors.push({ row: row.row, error: "Base64 photo is required" });
  }
  return errors;
}

async function uploadBufferToCloudinary(buffer: Buffer, childId: string, fileName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `canteen/student-photos/${childId}`,
        public_id: `${Date.now()}-${fileName.replace(/\.[^.]+$/, "")}`,
        resource_type: "image",
        overwrite: true,
      },
      (err, result) => {
        if (err || !result?.secure_url) {
          reject(new Error(err?.message || "Cloudinary upload failed"));
          return;
        }
        resolve(result.secure_url);
      },
    );

    stream.end(buffer);
  });
}

async function processUpload(
  request: NextRequest,
  emit?: (log: RowProgressLog, processed: number, total: number) => void,
  emitStage?: (stage: string, message: string, progress?: number) => void,
) {
  const session = await getSession();
  if (!session?.user || !["MANAGEMENT", "ATTENDANCE"].includes(session.user.role)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const cloudinaryState = configureCloudinary();
  if (!cloudinaryState.ok) {
    return { response: NextResponse.json({ error: cloudinaryState.error }, { status: 500 }) };
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return { response: NextResponse.json({ error: "No file uploaded" }, { status: 400 }) };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!["xlsx", "xls", "csv", "json"].includes(ext)) {
    return {
      response: NextResponse.json(
        { error: "Only .xlsx, .xls, .csv, or .json files are supported" },
        { status: 400 },
      ),
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  emitStage?.("parsing", "Reading upload file", 10);
  const rows = parseRows(file.name, buffer);
  if (rows.length === 0) {
    return { response: NextResponse.json({ error: "No data rows found" }, { status: 400 }) };
  }

  if (rows.length > MAX_ROWS) {
    return {
      response: NextResponse.json(
        { error: `Maximum ${MAX_ROWS} rows allowed per upload` },
        { status: 400 },
      ),
    };
  }

  emitStage?.("parsing", "File parsed", 100);
  emitStage?.("validating", "Validating rows", 10);
  const validationErrors = validateRows(rows);
  if (validationErrors.length > 0) {
    return {
      response: NextResponse.json(
        { error: "Validation errors", errors: validationErrors.slice(0, 30) },
        { status: 400 },
      ),
    };
  }
  emitStage?.("validating", "Validation completed", 100);

  const [upload] = await db
    .insert(bulkPhotoUpload)
    .values({
      uploadedBy: session.user.id,
      fileName: file.name,
      fileSize: file.size,
      totalFiles: rows.length,
      status: "PROCESSING",
      currentStep: "STRUCTURE_CHECK",
      startedAt: new Date(),
      metadata: JSON.stringify({ source: "attendance-bulk-upload" }),
    })
    .returning({ id: bulkPhotoUpload.id });

  emitStage?.("preloading", "Matching GR numbers", 20);
  const uniqueGRs = [...new Set(rows.map((r) => r.grNumber))];
  const students = await db
    .select({ id: child.id, grNumber: child.grNumber })
    .from(child)
    .where(inArray(child.grNumber, uniqueGRs));
  const childByGr = new Map(students.map((s) => [String(s.grNumber), s.id]));
  emitStage?.("preloading", "Student lookup complete", 100);

  const results: UploadResult[] = new Array(rows.length);
  const total = rows.length;
  let processed = 0;
  let progressSent = -1;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  emitStage?.("uploading", "Uploading photos", 0);
  await runParallelForEach(rows, CONCURRENCY, async (row, idx) => {
    const childId = childByGr.get(row.grNumber);

    if (!childId) {
      const result: UploadResult = {
        row: row.row,
        grNumber: row.grNumber,
        status: "skipped",
        message: `No student found with GR ${row.grNumber}`,
      };
      results[idx] = result;
      skipped += 1;
      processed += 1;
      const pct = Math.round((processed / total) * 100);
      if (pct !== progressSent) {
        progressSent = pct;
        emitStage?.("uploading", `Uploading photos (${processed}/${total})`, pct);
      }
      emit?.({ row: row.row, status: "skipped", message: result.message }, processed, total);
      return;
    }

    try {
      const sanitizedBase64 = row.base64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
      const fileBuffer = Buffer.from(sanitizedBase64, "base64");

      const [batch] = await db
        .insert(photoUploadBatch)
        .values({
          bulkUploadId: upload.id,
          childId,
          photoUrl: "",
          originalFileName: row.fileName,
          fileSize: fileBuffer.length,
          uploadStatus: "PENDING",
          processingStartedAt: new Date(),
        })
        .returning({ id: photoUploadBatch.id });

      const photoUrl = await uploadBufferToCloudinary(fileBuffer, childId, row.fileName);

      await db
        .update(child)
        .set({ image: photoUrl, updatedAt: new Date() })
        .where(eq(child.id, childId));

      await db
        .update(photoUploadBatch)
        .set({
          photoUrl,
          uploadStatus: "SUCCESS",
          processingCompletedAt: new Date(),
        })
        .where(eq(photoUploadBatch.id, batch.id));

      const result: UploadResult = {
        row: row.row,
        grNumber: row.grNumber,
        status: "created",
        message: "Photo uploaded successfully",
      };
      results[idx] = result;
      created += 1;
      processed += 1;
      const pct = Math.round((processed / total) * 100);
      if (pct !== progressSent) {
        progressSent = pct;
        emitStage?.("uploading", `Uploading photos (${processed}/${total})`, pct);
      }
      emit?.({ row: row.row, status: "created", message: result.message }, processed, total);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      const result: UploadResult = {
        row: row.row,
        grNumber: row.grNumber,
        status: "error",
        message,
      };
      results[idx] = result;
      errors += 1;
      processed += 1;
      const pct = Math.round((processed / total) * 100);
      if (pct !== progressSent) {
        progressSent = pct;
        emitStage?.("uploading", `Uploading photos (${processed}/${total})`, pct);
      }
      emit?.({ row: row.row, status: "error", message }, processed, total);
    }
  });

  emitStage?.("finalizing", "Saving bulk upload result", 50);
  await db
    .update(bulkPhotoUpload)
    .set({
      processedFiles: created,
      failedFiles: errors,
      status: errors > 0 ? "FAILED" : "COMPLETED",
      currentStep: errors > 0 ? "FAILED" : "COMPLETED",
      completedAt: new Date(),
      errorMessage: errors > 0 ? `${errors} row(s) failed` : null,
      updatedAt: new Date(),
    })
    .where(eq(bulkPhotoUpload.id, upload.id));

  emitStage?.("finalizing", "Completed", 100);

  return {
    payload: {
      bulkUploadId: upload.id,
      summary: {
        total,
        created,
        skipped,
        errors,
      },
      results,
    },
  };
}

export async function POST(request: NextRequest) {
  if (!isStreamRequested(request)) {
    try {
      const out = await processUpload(request);
      if (out.response) return out.response;
      return NextResponse.json(out.payload);
    } catch (error) {
      console.error("Attendance bulk upload error:", error);
      return NextResponse.json({ error: "Failed to process upload" }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("start", { message: "Upload started" });
        const out = await processUpload(
          request,
          (log, processed, total) => {
            send("row", { ...log, processed, total });
          },
          (stage, message, progress) => {
            send("stage", { stage, message, progress });
          },
        );

        if (out.response) {
          const text = await out.response.text();
          send("error", { message: text });
          return;
        }

        send("done", out.payload);
      } catch (error) {
        send("error", { message: error instanceof Error ? error.message : "Upload failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
