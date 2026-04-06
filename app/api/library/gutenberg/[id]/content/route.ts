import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gutenbergCatalog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { uploadBookToS3, getBookFromS3 } from "@/lib/s3";
import { markBookDownloadedInIndex } from "@/lib/meilisearch";
import { getGutenbergBook, getTextUrl } from "@/lib/gutenberg";

/**
 * GET /api/library/gutenberg/[id]/content
 *
 * Returns the book's plain-text content.
 * If not already downloaded to S3, fetches from Gutenberg and uploads to S3 first.
 * Subsequent requests serve directly from S3.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Look up the catalog entry
  const [entry] = await db
    .select()
    .from(gutenbergCatalog)
    .where(eq(gutenbergCatalog.id, id))
    .limit(1);

  if (!entry) {
    return NextResponse.json({ error: "Book not found in catalog" }, { status: 404 });
  }

  // Already downloaded — serve from S3
  if (entry.isDownloaded && entry.s3Key) {
    const content = await getBookFromS3(entry.s3Key);
    if (content) {
      return NextResponse.json({
        gutenbergId: entry.gutenbergId,
        title: entry.title,
        content,
        source: "s3",
      });
    }
    // S3 key was set but content is missing — re-download below
  }

  // Download from Gutenberg
  const gutenbergBook = await getGutenbergBook(entry.gutenbergId);
  if (!gutenbergBook) {
    return NextResponse.json(
      { error: "Could not fetch book from Gutenberg" },
      { status: 502 },
    );
  }

  const textUrl = getTextUrl(gutenbergBook);
  if (!textUrl) {
    return NextResponse.json(
      { error: "No plain-text format available for this book" },
      { status: 404 },
    );
  }

  const textResponse = await fetch(textUrl, {
    signal: AbortSignal.timeout(60_000),
  });

  if (!textResponse.ok) {
    return NextResponse.json(
      { error: "Failed to download book content from Gutenberg" },
      { status: 502 },
    );
  }

  const content = await textResponse.text();

  // Upload to S3
  const { key } = await uploadBookToS3(entry.gutenbergId, content);

  // Update catalog entry
  await db
    .update(gutenbergCatalog)
    .set({
      s3Key: key,
      s3ContentType: "text/plain; charset=utf-8",
      isDownloaded: true,
      updatedAt: new Date(),
    })
    .where(eq(gutenbergCatalog.id, id));

  // Update Meilisearch index (fire-and-forget)
  markBookDownloadedInIndex(id).catch(() => {});

  return NextResponse.json({
    gutenbergId: entry.gutenbergId,
    title: entry.title,
    content,
    source: "gutenberg_fresh",
  });
}
