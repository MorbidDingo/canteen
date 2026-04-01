/**
 * Meilisearch integration for full-text search + AI-powered recommendations.
 *
 * Uses the free tier (self-hosted via Docker or Meilisearch Cloud free plan).
 *
 * Setup (self-hosted):
 *   docker run -d -p 7700:7700 \
 *     -e MEILI_MASTER_KEY='your-master-key' \
 *     -v $(pwd)/meili_data:/meili_data \
 *     getmeili/meilisearch:v1.12
 *
 * Setup (Meilisearch Cloud free tier):
 *   1. Sign up at https://www.meilisearch.com/cloud (free plan: 1 project, 100k docs)
 *   2. Copy host URL + API key to .env
 *
 * Docs: https://www.meilisearch.com/docs
 */

import { Meilisearch, type SearchParams, type SearchResponse } from "meilisearch";

const INDEX_NAME = "gutenberg_books";

let _client: Meilisearch | null = null;

function getClient(): Meilisearch {
  if (!_client) {
    _client = new Meilisearch({
      host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
      apiKey: process.env.MEILISEARCH_API_KEY || "",
    });
  }
  return _client;
}

// ─── Index Management ───────────────────────────────────

export interface MeiliGutenbergBook {
  id: string;               // our DB id
  gutenbergId: number;
  title: string;
  authors: string;           // formatted: "Charles Dickens, Jane Austen"
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  category: string;
  downloadCount: number;
  coverImageUrl: string | null;
  isDownloaded: boolean;
}

/**
 * Ensure the gutenberg_books index exists with proper settings.
 * Call this once during setup or on app startup.
 */
export async function ensureGutenbergIndex(): Promise<void> {
  const client = getClient();

  // Create index if it doesn't exist
  await client.createIndex(INDEX_NAME, { primaryKey: "id" });

  const index = client.index(INDEX_NAME);

  // Configure searchable attributes (order = relevance weight)
  await index.updateSearchableAttributes([
    "title",
    "authors",
    "subjects",
    "bookshelves",
    "category",
  ]);

  // Configure filterable attributes for faceted search
  await index.updateFilterableAttributes([
    "category",
    "languages",
    "isDownloaded",
    "downloadCount",
  ]);

  // Configure sortable attributes
  await index.updateSortableAttributes([
    "downloadCount",
    "title",
  ]);

  // Configure ranking rules (customise relevance)
  await index.updateRankingRules([
    "words",
    "typo",
    "proximity",
    "attribute",
    "sort",
    "exactness",
    "downloadCount:desc", // popular books rank higher
  ]);
}

/**
 * Add or update documents in the Meilisearch index.
 * Meilisearch handles upserts automatically by primary key.
 */
export async function indexGutenbergBooks(books: MeiliGutenbergBook[]): Promise<void> {
  if (books.length === 0) return;

  const client = getClient();
  const index = client.index(INDEX_NAME);

  // Meilisearch accepts batches up to ~100MB. We chunk at 1000 docs.
  const BATCH_SIZE = 1000;
  for (let i = 0; i < books.length; i += BATCH_SIZE) {
    const batch = books.slice(i, i + BATCH_SIZE);
    await index.addDocuments(batch);
  }
}

/**
 * Search for Gutenberg books with full-text + typo-tolerance + filters.
 */
export async function searchGutenbergCatalog(
  query: string,
  options?: {
    category?: string;
    language?: string;
    onlyDownloaded?: boolean;
    page?: number;
    limit?: number;
    sort?: string[];
  },
): Promise<SearchResponse<MeiliGutenbergBook>> {
  const client = getClient();
  const index = client.index<MeiliGutenbergBook>(INDEX_NAME);

  const filters: string[] = [];
  if (options?.category) filters.push(`category = "${options.category}"`);
  if (options?.language) filters.push(`languages = "${options.language}"`);
  if (options?.onlyDownloaded) filters.push("isDownloaded = true");

  const params: SearchParams = {
    limit: options?.limit ?? 20,
    offset: ((options?.page ?? 1) - 1) * (options?.limit ?? 20),
    filter: filters.length > 0 ? filters.join(" AND ") : undefined,
    sort: options?.sort,
    attributesToHighlight: ["title", "authors"],
    highlightPreTag: "<mark>",
    highlightPostTag: "</mark>",
  };

  return index.search(query, params);
}

/**
 * Delete a single document from the index.
 */
export async function removeFromIndex(documentId: string): Promise<void> {
  const client = getClient();
  const index = client.index(INDEX_NAME);
  await index.deleteDocument(documentId);
}

/**
 * Mark a book as downloaded in the Meilisearch index (partial update).
 */
export async function markBookDownloadedInIndex(documentId: string): Promise<void> {
  const client = getClient();
  const index = client.index(INDEX_NAME);
  await index.updateDocuments([{ id: documentId, isDownloaded: true }]);
}

/**
 * Get index stats (document count, indexing status, etc.)
 */
export async function getIndexStats() {
  const client = getClient();
  const index = client.index(INDEX_NAME);
  return index.getStats();
}
