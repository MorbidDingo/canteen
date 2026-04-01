import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gutenbergCatalog } from "@/lib/db/schema";
import { searchGutenbergCatalog } from "@/lib/meilisearch";
import { desc, sql } from "drizzle-orm";

/**
 * GET /api/library/gutenberg/search
 *
 * Search the Gutenberg catalog using Meilisearch (instant, typo-tolerant).
 * Falls back to PostgreSQL ILIKE if Meilisearch is unavailable.
 *
 * Query params:
 *   q        - search query (required)
 *   category - filter by category (optional)
 *   language - filter by language (optional, e.g. "en")
 *   page     - page number (default 1)
 *   limit    - results per page (default 20, max 100)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? undefined;
  const language = searchParams.get("language") ?? undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));

  // Try Meilisearch first
  try {
    const results = await searchGutenbergCatalog(query, {
      category,
      language,
      page,
      limit,
    });

    return NextResponse.json({
      hits: results.hits,
      totalHits: results.estimatedTotalHits,
      page,
      limit,
      processingTimeMs: results.processingTimeMs,
      source: "meilisearch",
    });
  } catch {
    // Meilisearch unavailable — fall back to Postgres
  }

  // Fallback: PostgreSQL full-text-ish search with ILIKE
  const conditions: ReturnType<typeof sql>[] = [];

  if (query) {
    const pattern = `%${query}%`;
    conditions.push(
      sql`(${gutenbergCatalog.title} ILIKE ${pattern} OR ${gutenbergCatalog.authors} ILIKE ${pattern})`,
    );
  }
  if (category) {
    conditions.push(sql`${gutenbergCatalog.category} = ${category}`);
  }
  if (language) {
    conditions.push(sql`${gutenbergCatalog.languages}::text ILIKE ${`%"${language}"%`}`);
  }

  const where = conditions.length > 0
    ? sql.join(conditions, sql` AND `)
    : undefined;

  const [books, countResult] = await Promise.all([
    db
      .select()
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
    hits: books.map((b) => ({
      id: b.id,
      gutenbergId: b.gutenbergId,
      title: b.title,
      authors: b.authors,
      subjects: b.subjects,
      category: b.category,
      downloadCount: b.downloadCount,
      coverImageUrl: b.coverImageUrl,
      isDownloaded: b.isDownloaded,
      languages: b.languages,
    })),
    totalHits: countResult[0]?.total ?? 0,
    page,
    limit,
    source: "postgres_fallback",
  });
}
