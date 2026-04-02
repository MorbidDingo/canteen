import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.AWS_REGION || "ap-south-1";
const BUCKET = process.env.AWS_S3_BUCKET;

let _client: S3Client | null = null;

/**
 * Returns true only when all required S3 environment variables are present.
 * Use this to guard S3 operations and avoid cryptic errors when S3 is not configured.
 */
export function isS3Configured(): boolean {
  return !!(
    process.env.AWS_S3_BUCKET &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

function getS3Client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}

// ─── In-Memory LRU Cache ────────────────────────────────
// Keeps recently accessed books in RAM for instant subsequent reads.
// Max ~50 books in cache (~50MB for average Gutenberg texts).

const MAX_CACHE_ENTRIES = 50;
const bookCache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const value = bookCache.get(key);
  if (value !== undefined) {
    // Move to end (most recently used)
    bookCache.delete(key);
    bookCache.set(key, value);
  }
  return value;
}

function cacheSet(key: string, value: string): void {
  if (bookCache.has(key)) bookCache.delete(key);
  bookCache.set(key, value);
  // Evict oldest entry if over limit
  if (bookCache.size > MAX_CACHE_ENTRIES) {
    const oldest = bookCache.keys().next().value;
    if (oldest) bookCache.delete(oldest);
  }
}

/**
 * Upload plain-text book content to S3.
 * Key pattern: gutenberg/{gutenbergId}.txt
 * Also populates the in-memory cache.
 */
export async function uploadBookToS3(
  gutenbergId: number,
  content: string,
  contentType = "text/plain; charset=utf-8",
): Promise<{ key: string }> {
  const key = `gutenberg/${gutenbergId}.txt`;
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: content,
      ContentType: contentType,
    }),
  );

  // Populate cache so the next read is instant
  cacheSet(key, content);

  return { key };
}

/**
 * Download book content from S3 (with in-memory LRU cache).
 * First hit: S3 round-trip (~100-300ms from ap-south-1).
 * Subsequent hits: served from RAM (~0ms).
 */
export async function getBookFromS3(key: string): Promise<string | null> {
  // Check cache first
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const client = getS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }),
    );

    const content = (await response.Body?.transformToString("utf-8")) ?? null;
    if (content) cacheSet(key, content);
    return content;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "NoSuchKey") return null;
    throw err;
  }
}

/**
 * Check if a key already exists in S3.
 */
export async function bookExistsInS3(key: string): Promise<boolean> {
  const client = getS3Client();

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Upload a binary file (PDF, ePub, etc.) to S3.
 * Key pattern: books/{bookId}/{filename}
 */
export async function uploadFileToS3(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<{ key: string }> {
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return { key };
}

/**
 * Download binary content from S3 as a Buffer.
 */
export async function getFileFromS3(key: string): Promise<Buffer | null> {
  const client = getS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      }),
    );

    const bytes = await response.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "NoSuchKey") return null;
    throw err;
  }
}

/**
 * Generate a presigned URL for an S3 object.
 * Default expiry: 3600s (60 minutes).
 */
export async function getPresignedUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
}
