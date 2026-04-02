import { getBookFromS3, uploadBookToS3, isS3Configured } from "@/lib/s3";

/**
 * Project Gutenberg integration via the Gutendex API.
 * Fetches public domain book metadata and content for the reader system.
 *
 * API docs: https://gutendex.com
 * Book text: https://www.gutenberg.org/files/{id}/{id}-0.txt (UTF-8 plain text)
 */

// ─── Types (match Gutendex API response format) ─────────

export interface GutenbergBook {
  id: number;
  title: string;
  authors: Array<{
    name: string;
    birth_year: number | null;
    death_year: number | null;
  }>;
  subjects: string[];
  bookshelves: string[];
  languages: string[];
  formats: Record<string, string>;
  download_count: number;
  media_type: string;
}

interface GutendexResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutenbergBook[];
}

export interface ParsedChapter {
  chapterNumber: number;
  title: string;
  content: string;
  pageStart: number;
  pageEnd: number;
}

// ─── Constants ──────────────────────────────────────────────

const GUTENDEX_API = "https://gutendex.com/books";
const GUTENBERG_FILES = "https://www.gutenberg.org";
const FETCH_TIMEOUT = 15_000;
const FETCH_CONTENT_TIMEOUT = 20_000;
const FETCH_RETRIES = 2;
const CHARS_PER_PAGE = 2000; // approximate characters per "page"

// ─── Helpers ────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(url: string, timeoutMs = FETCH_TIMEOUT, retries = FETCH_RETRIES): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, timeoutMs);
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < retries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Search for popular public domain books on Project Gutenberg.
 * Returns metadata only — content is fetched on demand.
 */
export async function searchGutenbergBooks(options?: {
  search?: string;
  topic?: string;
  languages?: string;
  page?: number;
}): Promise<{ books: GutenbergBook[]; count: number; next: string | null }> {
  const params = new URLSearchParams();
  if (options?.search) params.set("search", options.search);
  if (options?.topic) params.set("topic", options.topic);
  if (options?.languages) params.set("languages", options.languages);
  if (options?.page) params.set("page", String(options.page));
  // Sort by popularity (download count)
  params.set("sort", "popular");

  const url = `${GUTENDEX_API}?${params.toString()}`;
  const response = await fetchWithRetry(url);

  if (!response.ok) {
    throw new Error(`Gutendex API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as GutendexResponse;
  return { books: data.results, count: data.count, next: data.next };
}

/**
 * Get metadata for a single Gutenberg book by its ID.
 */
export async function getGutenbergBook(gutenbergId: number): Promise<GutenbergBook | null> {
  const response = await fetchWithRetry(`${GUTENDEX_API}/${gutenbergId}`);
  if (!response.ok) return null;
  return (await response.json()) as GutenbergBook;
}

/**
 * Get the plain text content URL for a Gutenberg book.
 * Prefers UTF-8 plain text format.
 */
export function getTextUrl(book: GutenbergBook): string | null {
  // Prefer plain text UTF-8
  const textUtf8 = book.formats["text/plain; charset=utf-8"];
  if (textUtf8) return textUtf8;

  const textPlain = book.formats["text/plain"];
  if (textPlain) return textPlain;

  // Fallback to the standard Gutenberg URL pattern
  return `${GUTENBERG_FILES}/files/${book.id}/${book.id}-0.txt`;
}

/**
 * Get multiple text URL candidates for a Gutenberg book (most reliable first).
 * Tries mirror/CDN patterns that are less likely to be blocked.
 */
function getTextUrls(gutenbergId: number): string[] {
  return [
    `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.txt`,
    `https://www.gutenberg.org/files/${gutenbergId}/${gutenbergId}-0.txt`,
    `https://www.gutenberg.org/ebooks/${gutenbergId}.txt.utf-8`,
  ];
}

/**
 * Fetch the full text content of a Gutenberg book.
 * Tries S3 cache first, then multiple Gutenberg URL patterns, then Gutendex API.
 * Returns null (never throws) if all sources fail.
 */
export async function fetchBookContent(gutenbergId: number): Promise<string | null> {
  const cachedKey = `gutenberg/${gutenbergId}.txt`;

  if (isS3Configured()) {
    try {
      const cachedContent = await getBookFromS3(cachedKey);
      if (cachedContent) return cachedContent;
    } catch (error) {
      console.error("[gutenberg] S3 cache read failed:", error instanceof Error ? error.message : error);
    }
  }

  // Try multiple Gutenberg text URL patterns in order
  const textUrls = getTextUrls(gutenbergId);

  let content: string | null = null;

  for (const textUrl of textUrls) {
    try {
      const response = await fetchWithRetry(textUrl, FETCH_CONTENT_TIMEOUT);
      if (response.ok) {
        content = await response.text();
        break;
      }
    } catch (error) {
      console.error(`[gutenberg] Fetch failed for ${textUrl}:`, error instanceof Error ? error.message : error);
    }
  }

  if (!content) {
    // Last resort: try the Gutendex API to get the canonical text URL
    try {
      const book = await getGutenbergBook(gutenbergId);
      if (book) {
        const textUrl = getTextUrl(book);
        if (textUrl && !textUrls.includes(textUrl)) {
          const response = await fetchWithRetry(textUrl, FETCH_CONTENT_TIMEOUT);
          if (response.ok) {
            content = await response.text();
          }
        }
      }
    } catch (error) {
      console.error("[gutenberg] Gutendex fallback failed:", error instanceof Error ? error.message : error);
    }
  }

  if (!content) return null;

  if (isS3Configured()) {
    try {
      await uploadBookToS3(gutenbergId, content);
    } catch (error) {
      console.error("[gutenberg] S3 cache write failed:", error instanceof Error ? error.message : error);
    }
  }

  return content;
}

/**
 * Get cover image URL for a Gutenberg book.
 * Tries the book's formats first, then falls back to Open Library.
 */
export function getCoverImageUrl(book: GutenbergBook): string | null {
  // Check Gutenberg's own image formats
  const jpegUrl = book.formats["image/jpeg"];
  if (jpegUrl) return jpegUrl;

  return null;
}

/**
 * Parse plain text content from Project Gutenberg into chapters.
 * Gutenberg texts typically have chapter markers like "CHAPTER I", "Chapter 1", etc.
 * Falls back to splitting by size if no chapter markers are found.
 */
export function parseIntoChapters(rawText: string, maxChapters = 100): ParsedChapter[] {
  // Strip Gutenberg header/footer
  const text = stripGutenbergBoilerplate(rawText);

  // Try to find chapter boundaries
  const chapterPattern = /^(?:CHAPTER|Chapter|BOOK|Book|PART|Part|SECTION|Section)\s+[IVXLCDM\d]+[.:)]*\s*$/gm;
  const matches: Array<{ index: number; title: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = chapterPattern.exec(text)) !== null) {
    // Read the next line as potential subtitle
    const afterMatch = text.slice(match.index + match[0].length, match.index + match[0].length + 200);
    const subtitleMatch = afterMatch.match(/^\s*\n\s*(.+)/);
    const subtitle = subtitleMatch ? subtitleMatch[1].trim() : "";
    const title = subtitle && subtitle.length < 100
      ? `${match[0].trim()} — ${subtitle}`
      : match[0].trim();

    matches.push({ index: match.index, title });
  }

  let chapters: ParsedChapter[];

  if (matches.length >= 2 && matches.length <= maxChapters) {
    // Split by detected chapter markers
    chapters = matches.map((m, i) => {
      const start = m.index;
      const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
      const content = text.slice(start, end).trim();
      const pageStart = Math.floor(start / CHARS_PER_PAGE) + 1;
      const pageEnd = Math.floor(end / CHARS_PER_PAGE) + 1;

      return {
        chapterNumber: i + 1,
        title: m.title,
        content,
        pageStart,
        pageEnd,
      };
    });
  } else {
    // No clear chapters found — split into roughly equal chunks (~5000 chars each)
    const chunkSize = 5000;
    const totalChunks = Math.max(1, Math.ceil(text.length / chunkSize));
    chapters = [];

    for (let i = 0; i < totalChunks && i < maxChapters; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, text.length);
      // Try to break at a paragraph boundary
      let breakPoint = end;
      if (end < text.length) {
        const nearBreak = text.lastIndexOf("\n\n", end);
        if (nearBreak > start + chunkSize * 0.5) {
          breakPoint = nearBreak;
        }
      }
      const content = text.slice(start, breakPoint).trim();
      if (!content) continue;

      const pageStart = Math.floor(start / CHARS_PER_PAGE) + 1;
      const pageEnd = Math.floor(breakPoint / CHARS_PER_PAGE) + 1;

      chapters.push({
        chapterNumber: i + 1,
        title: `Section ${i + 1}`,
        content,
        pageStart,
        pageEnd,
      });
    }
  }

  return chapters;
}

/**
 * Strip Project Gutenberg header and footer boilerplate.
 */
function stripGutenbergBoilerplate(text: string): string {
  // Find the start of actual content (after "*** START OF" marker)
  const startMarkers = [
    /\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*/i,
    /\*\*\* START OF.*?\*\*\*/i,
  ];

  let startIndex = 0;
  for (const marker of startMarkers) {
    const match = text.match(marker);
    if (match && match.index !== undefined) {
      startIndex = match.index + match[0].length;
      break;
    }
  }

  // Find the end of actual content (before "*** END OF" marker)
  const endMarkers = [
    /\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*/i,
    /\*\*\* END OF.*?\*\*\*/i,
  ];

  let endIndex = text.length;
  for (const marker of endMarkers) {
    const match = text.match(marker);
    if (match && match.index !== undefined) {
      endIndex = match.index;
      break;
    }
  }

  return text.slice(startIndex, endIndex).trim();
}

/**
 * Map Gutenberg subjects to our book categories.
 */
export function mapCategory(subjects: string[]): string {
  const joined = subjects.join(" ").toLowerCase();

  if (joined.includes("fiction") || joined.includes("novel") || joined.includes("stories")) {
    return "FICTION";
  }
  if (joined.includes("science") || joined.includes("mathematics") || joined.includes("physics")) {
    return "NON_FICTION";
  }
  if (joined.includes("history") || joined.includes("biography")) {
    return "NON_FICTION";
  }
  if (joined.includes("textbook") || joined.includes("education")) {
    return "TEXTBOOK";
  }
  if (joined.includes("reference") || joined.includes("encyclopedia") || joined.includes("dictionary")) {
    return "REFERENCE";
  }
  return "GENERAL";
}

/**
 * Extract the primary author name from a Gutenberg book.
 * Gutenberg uses "Last, First" format — we convert to "First Last".
 */
export function formatAuthorName(book: GutenbergBook): string {
  if (!book.authors.length) return "Unknown Author";

  const author = book.authors[0];
  const parts = author.name.split(", ");
  if (parts.length === 2) {
    return `${parts[1]} ${parts[0]}`;
  }
  return author.name;
}

/**
 * Calculate estimated total pages from text content.
 */
export function estimatePages(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE));
}
