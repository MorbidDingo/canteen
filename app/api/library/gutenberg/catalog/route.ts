import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gutenbergCatalog } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";

/**
 * GET /api/library/gutenberg/catalog
 *
 * Browse the seeded Gutenberg catalog.
 *
 * Query params:
 *   page     - page number (default 1)
 *   limit    - results per page (default 20, max 100)
 *   category - filter by category
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const category = searchParams.get("category");

  const where = category ? eq(gutenbergCatalog.category, category) : undefined;

  const [books, countResult] = await Promise.all([
    db
      .select({
        id: gutenbergCatalog.id,
        gutenbergId: gutenbergCatalog.gutenbergId,
        title: gutenbergCatalog.title,
        authors: gutenbergCatalog.authors,
        category: gutenbergCatalog.category,
        coverImageUrl: gutenbergCatalog.coverImageUrl,
        downloadCount: gutenbergCatalog.downloadCount,
        isDownloaded: gutenbergCatalog.isDownloaded,
        languages: gutenbergCatalog.languages,
        subjects: gutenbergCatalog.subjects,
      })
      .from(gutenbergCatalog)
      .where(where)
      .orderBy(desc(gutenbergCatalog.downloadCount))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ total: sql<number>`count(*)` })
      .from(gutenbergCatalog)
      .where(where),
  ]);

  return NextResponse.json({
    books,
    total: countResult[0]?.total ?? 0,
    page,
    limit,
  });
}
