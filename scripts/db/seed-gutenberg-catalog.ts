/**
 * Seed the gutenberg_catalog table from the Gutendex API.
 *
 * Usage:
 *   npx tsx scripts/db/seed-gutenberg-catalog.ts           # default: 1000 books
 *   npx tsx scripts/db/seed-gutenberg-catalog.ts --count 500
 *   npx tsx scripts/db/seed-gutenberg-catalog.ts --count 2000 --lang en
 *
 * This fetches popular public-domain books page by page from gutendex.com
 * and inserts them into the gutenberg_catalog table.
 *
 * It also indexes them into Meilisearch for instant search.
 */

import "dotenv/config";
import { db } from "@/lib/db";
import { gutenbergCatalog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  ensureGutenbergIndex,
  indexGutenbergBooks,
  type MeiliGutenbergBook,
} from "@/lib/meilisearch";
import { mapCategory, formatAuthorName, getCoverImageUrl, type GutenbergBook } from "@/lib/gutenberg";

// ─── CLI Args ───────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let count = 1000;
  let lang = "en";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" && args[i + 1]) {
      count = parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === "--lang" && args[i + 1]) {
      lang = args[i + 1];
      i++;
    }
  }

  return { count, lang };
}

// ─── Fetch pages from Gutendex ──────────────────────────

const GUTENDEX_API = "https://gutendex.com/books";
const PAGE_SIZE = 32; // Gutendex default page size

async function fetchPage(page: number, lang: string): Promise<{
  results: GutenbergBook[];
  next: string | null;
  count: number;
}> {
  const params = new URLSearchParams({
    page: String(page),
    languages: lang,
    sort: "popular",
    mime_type: "text/plain",
  });

  const url = `${GUTENDEX_API}?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Gutendex API error: ${res.status} ${res.statusText} for ${url}`);
  }

  return res.json();
}

// ─── Main seed logic ────────────────────────────────────

async function main() {
  const { count, lang } = parseArgs();
  console.log(`Seeding Gutenberg catalog: up to ${count} books, language: ${lang}`);

  // Setup Meilisearch index
  let meiliAvailable = true;
  try {
    await ensureGutenbergIndex();
    console.log("Meilisearch index configured.");
  } catch (err) {
    console.warn("Meilisearch not available, skipping indexing:", (err as Error).message);
    meiliAvailable = false;
  }

  let fetched = 0;
  let page = 1;
  let inserted = 0;
  let skipped = 0;
  const meiliDocs: MeiliGutenbergBook[] = [];

  while (fetched < count) {
    console.log(`  Fetching page ${page}...`);

    let data;
    try {
      data = await fetchPage(page, lang);
    } catch (err) {
      console.error(`  Failed to fetch page ${page}:`, (err as Error).message);
      break;
    }

    if (data.results.length === 0) {
      console.log("  No more results from Gutendex.");
      break;
    }

    for (const book of data.results) {
      if (fetched >= count) break;
      fetched++;

      // Skip if already exists
      const [existing] = await db
        .select({ id: gutenbergCatalog.id })
        .from(gutenbergCatalog)
        .where(eq(gutenbergCatalog.gutenbergId, book.id))
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      const authorFormatted = formatAuthorName(book);
      const category = mapCategory(book.subjects);
      const coverUrl = getCoverImageUrl(book);

      const [row] = await db
        .insert(gutenbergCatalog)
        .values({
          gutenbergId: book.id,
          title: book.title,
          authors: JSON.stringify(book.authors),
          subjects: JSON.stringify(book.subjects),
          bookshelves: JSON.stringify(book.bookshelves),
          languages: JSON.stringify(book.languages),
          formats: JSON.stringify(book.formats),
          downloadCount: book.download_count,
          mediaType: book.media_type,
          coverImageUrl: coverUrl,
          category,
        })
        .returning({ id: gutenbergCatalog.id });

      inserted++;

      if (meiliAvailable && row) {
        meiliDocs.push({
          id: row.id,
          gutenbergId: book.id,
          title: book.title,
          authors: authorFormatted,
          subjects: book.subjects,
          bookshelves: book.bookshelves,
          languages: book.languages,
          category,
          downloadCount: book.download_count,
          coverImageUrl: coverUrl,
          isDownloaded: false,
        });
      }
    }

    if (!data.next) {
      console.log("  Reached last page of Gutendex results.");
      break;
    }

    page++;

    // Be respectful to the API: small delay between pages
    await new Promise((r) => setTimeout(r, 500));
  }

  // Index into Meilisearch in bulk
  if (meiliAvailable && meiliDocs.length > 0) {
    console.log(`Indexing ${meiliDocs.length} books into Meilisearch...`);
    await indexGutenbergBooks(meiliDocs);
    console.log("Meilisearch indexing complete.");
  }

  console.log(`\nDone! Fetched: ${fetched}, Inserted: ${inserted}, Skipped (duplicates): ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
