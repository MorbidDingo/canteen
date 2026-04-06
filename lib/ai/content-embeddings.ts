import OpenAI from "openai";
import { db } from "@/lib/db";
import { contentDocumentChunk } from "@/lib/db/schema";
import { getFileFromS3 } from "@/lib/s3";
import { sql } from "drizzle-orm";
import { checkEmbeddingRateLimit, logAiUsage } from "./usage";

// ─── Supported MIME types for text extraction ────────────────────────
const SUPPORTED_MIME_TYPES = new Set([
  "text/plain",
  "text/csv",
  "application/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/msword", // .doc
  "application/vnd.ms-excel", // .xls
]);

export function isSupportedForEmbedding(mimeType: string): boolean {
  return SUPPORTED_MIME_TYPES.has(mimeType);
}

// ─── OpenAI client (embeddings only) ─────────────────────────────────
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const CHUNK_SIZE = 512; // tokens per chunk
const CHUNK_OVERLAP = 64; // token overlap between chunks

// ─── Text extraction ─────────────────────────────────────────────────

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractTextFromXlsx(buffer: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    parts.push(`--- Sheet: ${sheetName} ---`);
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(csv);
  }

  return parts.join("\n\n");
}

export async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  switch (mimeType) {
    case "text/plain":
    case "text/csv":
    case "application/csv":
      return buffer.toString("utf-8");
    case "application/pdf":
      return extractTextFromPDF(buffer);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractTextFromDocx(buffer);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.ms-excel":
      return extractTextFromXlsx(buffer);
    case "application/msword":
      // .doc is legacy; attempt as plain text fallback
      return buffer.toString("utf-8");
    default:
      throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}

// ─── Chunking ────────────────────────────────────────────────────────

interface TextChunk {
  index: number;
  content: string;
}

/**
 * Split text into overlapping chunks using tiktoken for accurate token counting.
 * Each chunk is ~CHUNK_SIZE tokens with CHUNK_OVERLAP token overlap.
 */
export async function chunkText(text: string): Promise<TextChunk[]> {
  const { encoding_for_model } = await import("tiktoken");
  const enc = encoding_for_model("gpt-4o");

  try {
    const tokens = enc.encode(text);
    const chunks: TextChunk[] = [];

    if (tokens.length === 0) return [];

    let start = 0;
    let index = 0;

    while (start < tokens.length) {
      const end = Math.min(start + CHUNK_SIZE, tokens.length);
      const chunkTokens = tokens.slice(start, end);
      const content = new TextDecoder().decode(enc.decode(chunkTokens)).trim();

      if (content.length > 0) {
        chunks.push({ index, content });
        index++;
      }

      if (end >= tokens.length) break;
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }

    return chunks;
  } finally {
    enc.free();
  }
}

// ─── Embedding generation ────────────────────────────────────────────

/**
 * Generate embeddings for an array of text chunks.
 * Batches up to 100 texts per API call.
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const openai = getOpenAI();
  const embeddings: number[][] = [];
  const BATCH_SIZE = 100;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    for (const item of response.data) {
      embeddings.push(item.embedding);
    }
  }

  return embeddings;
}

/**
 * Generate a single embedding vector for a query string.
 */
export async function generateQueryEmbedding(
  query: string,
): Promise<number[]> {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0].embedding;
}

// ─── Fetch file content ──────────────────────────────────────────────

async function fetchFileContent(
  storageBackend: "S3" | "CLOUDINARY",
  storageKey: string,
): Promise<Buffer | null> {
  if (storageBackend === "S3") {
    return getFileFromS3(storageKey);
  }

  // Cloudinary: storageKey is a URL — fetch it
  const response = await fetch(storageKey);
  if (!response.ok) return null;
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Main pipeline ───────────────────────────────────────────────────

interface ProcessAttachmentParams {
  attachmentId: string;
  postId: string;
  organizationId: string;
  storageBackend: "S3" | "CLOUDINARY";
  storageKey: string;
  mimeType: string;
  filename?: string;
}

/**
 * Process a single attachment: extract text, chunk, embed, and store.
 * This is called asynchronously after the attachment upload response is sent.
 * On failure, logs the error but does not throw (fire-and-forget).
 */
export async function processAttachmentForEmbedding(
  params: ProcessAttachmentParams,
): Promise<{ chunksCreated: number; tokensUsed: number } | null> {
  const {
    attachmentId,
    postId,
    organizationId,
    storageBackend,
    storageKey,
    mimeType,
    filename,
  } = params;

  try {
    // Rate limit: 50 docs/hr/org
    if (!checkEmbeddingRateLimit(organizationId)) {
      console.warn(
        `[content-embeddings] Embedding rate limit exceeded for org ${organizationId}`,
      );
      return null;
    }

    // 1. Fetch file content
    const buffer = await fetchFileContent(storageBackend, storageKey);
    if (!buffer) {
      console.error(`[content-embeddings] Could not fetch file: ${storageKey}`);
      return null;
    }

    // 2. Extract text
    const rawText = await extractText(buffer, mimeType);
    if (!rawText || rawText.trim().length === 0) {
      console.log(`[content-embeddings] No text extracted from: ${storageKey}`);
      return null;
    }

    // 3. Chunk text
    const chunks = await chunkText(rawText);
    if (chunks.length === 0) return null;

    // 4. Generate embeddings (stored as text since pgvector was removed)
    const texts = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(texts);

    // 5. Store chunks + embeddings in DB
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      const embeddingStr = `[${embedding.join(",")}]`;

      await db.insert(contentDocumentChunk).values({
        postId,
        attachmentId,
        organizationId,
        chunkIndex: chunk.index,
        content: chunk.content,
        embedding: embeddingStr,
        metadata: {
          filename: filename ?? storageKey.split("/").pop(),
        },
      });
    }

    // Estimate tokens used (rough: input tokens for embedding)
    const { encoding_for_model } = await import("tiktoken");
    const enc = encoding_for_model("gpt-4o");
    let totalTokens = 0;
    try {
      for (const text of texts) {
        totalTokens += enc.encode(text).length;
      }
    } finally {
      enc.free();
    }

    console.log(
      `[content-embeddings] Processed ${chunks.length} chunks for attachment ${attachmentId} (${totalTokens} tokens)`,
    );

    // Log embedding usage
    logAiUsage({
      userId: "system",
      organizationId,
      type: "EMBEDDING",
      tokens: totalTokens,
      metadata: { attachmentId, chunksCreated: chunks.length, filename },
    });

    return { chunksCreated: chunks.length, tokensUsed: totalTokens };
  } catch (error) {
    console.error(
      `[content-embeddings] Failed to process attachment ${attachmentId}:`,
      error,
    );
    return null;
  }
}

/**
 * Fire-and-forget wrapper — kicks off processing without blocking the caller.
 * Catches and logs all errors. Used in the attachment upload API route.
 */
export function enqueueAttachmentProcessing(
  params: ProcessAttachmentParams,
): void {
  // Process asynchronously after response is sent
  processAttachmentForEmbedding(params).catch((err) =>
    console.error("[content-embeddings] Background processing error:", err),
  );
}
