/**
 * Book search utility functions
 * Searches Google Books API and OpenLibrary for book information and cover images.
 * Uses multiple strategies (ISBN-specific endpoints, cover APIs, general search)
 * to maximize the chance of finding a cover image.
 */

function compactText(value: string, maxLen: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}...` : trimmed;
}

/** Strip hyphens/spaces from ISBN to get a pure digit string. */
function normalizeIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if a URL points to a real image (not a placeholder/1x1).
 *
 * FIX: The original used GET but only checked headers, which breaks when the
 * server uses chunked transfer encoding (no Content-Length header). Now we:
 *   1. Try HEAD first to check content-type quickly.
 *   2. If Content-Length is present, use it to gate on size >= 1000 bytes.
 *   3. If Content-Length is absent (chunked), do a real GET and measure the
 *      actual body size — OpenLibrary's 1×1 placeholder is ~807 bytes.
 */
async function isValidImageUrl(url: string, timeoutMs = 5_000): Promise<boolean> {
  try {
    // Step 1: HEAD request to check content-type cheaply
    const headController = new AbortController();
    const headTimeout = setTimeout(() => headController.abort(), timeoutMs);
    let headRes: Response;
    try {
      headRes = await fetch(url, {
        method: "HEAD",
        signal: headController.signal,
      });
    } finally {
      clearTimeout(headTimeout);
    }

    if (!headRes.ok) return false;

    const contentType = headRes.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return false;

    const contentLength = headRes.headers.get("content-length");
    if (contentLength) {
      // Content-Length present — trust it
      return parseInt(contentLength, 10) >= 1000;
    }

    // Step 2: Content-Length absent (chunked encoding) — fetch body and measure
    const getRes = await fetchWithTimeout(url, timeoutMs);
    if (!getRes.ok) return false;
    const buffer = await getRes.arrayBuffer();
    return buffer.byteLength >= 1000;
  } catch {
    return false;
  }
}

type BookImageResult = {
  imageUrl: string | null;
  source: "google" | "openlibrary";
  title?: string;
  author?: string;
};

/**
 * Search for a book cover image using multiple strategies in priority order:
 * 1. OpenLibrary direct ISBN cover URL (fastest, no search needed)
 * 2. Google Books ISBN search (isbn: prefix)
 * 3. OpenLibrary ISBN search
 * 4. Google Books title+author search
 * 5. OpenLibrary title+author search
 */
export async function searchBookImage(
  title: string,
  author: string,
  isbn?: string | null,
): Promise<BookImageResult | null> {
  const safeTitle = compactText(title, 100);
  const safeAuthor = compactText(author, 80);
  const cleanIsbn = isbn?.trim() ? normalizeIsbn(isbn.trim()) : null;

  // ── Strategy 1: Direct OpenLibrary covers API by ISBN (fastest) ────
  if (cleanIsbn) {
    const directUrl = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}.jpg`;
    if (await isValidImageUrl(directUrl)) {
      return { imageUrl: directUrl, source: "openlibrary" };
    }
  }

  // ── Strategy 2 & 3: ISBN-based search (Google + OpenLibrary in parallel) ──
  if (cleanIsbn) {
    const [googleIsbn, olIsbn] = await Promise.allSettled([
      tryGoogleBooksImageByIsbn(cleanIsbn),
      tryOpenLibraryImageByIsbn(cleanIsbn),
    ]);

    const gResult = googleIsbn.status === "fulfilled" ? googleIsbn.value : null;
    if (gResult?.imageUrl) return gResult;

    const oResult = olIsbn.status === "fulfilled" ? olIsbn.value : null;
    if (oResult?.imageUrl) return oResult;
  }

  // ── Strategy 4 & 5: Title + author search (Google + OpenLibrary in parallel) ──
  const [googleTitle, olTitle] = await Promise.allSettled([
    tryGoogleBooksImageByQuery(`${safeTitle} ${safeAuthor}`),
    tryOpenLibraryImageByQuery(safeTitle, safeAuthor),
  ]);

  const gResult = googleTitle.status === "fulfilled" ? googleTitle.value : null;
  if (gResult?.imageUrl) return gResult;

  const oResult = olTitle.status === "fulfilled" ? olTitle.value : null;
  if (oResult?.imageUrl) return oResult;

  return null;
}

// ── Google Books: ISBN search (uses isbn: prefix) ────────────────────

async function tryGoogleBooksImageByIsbn(isbn: string): Promise<BookImageResult | null> {
  try {
    const response = await fetchWithTimeout(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=3`,
      7_000,
    );
    if (!response.ok) {
      console.warn(`Google Books ISBN search failed: ${response.status} ${response.statusText}`);
      return null;
    }
    return extractGoogleImage(await response.json());
  } catch {
    return null;
  }
}

// ── Google Books: title+author search ────────────────────────────────

async function tryGoogleBooksImageByQuery(query: string): Promise<BookImageResult | null> {
  try {
    const encoded = encodeURIComponent(query);
    const response = await fetchWithTimeout(
      `https://www.googleapis.com/books/v1/volumes?q=${encoded}&maxResults=5`,
      7_000,
    );
    if (!response.ok) {
      console.warn(`Google Books query search failed: ${response.status} ${response.statusText}`);
      return null;
    }
    return extractGoogleImage(await response.json());
  } catch {
    return null;
  }
}

/**
 * FIX: The original returned null as soon as it hit an item without imageLinks.
 * Now we `continue` to keep checking remaining items in the list, and also
 * prefer higher-resolution sizes (large → medium → small → thumbnail).
 */
function extractGoogleImage(payload: {
  items?: Array<{
    volumeInfo?: {
      title?: string;
      authors?: string[];
      imageLinks?: {
        thumbnail?: string;
        smallThumbnail?: string;
        large?: string;
        medium?: string;
        small?: string;
      };
      industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
    };
  }>;
}): BookImageResult | null {
  for (const item of payload.items ?? []) {
    const links = item.volumeInfo?.imageLinks;

    // FIX: skip items with no imageLinks rather than returning null immediately
    if (!links) continue;

    // Prefer highest quality available, fall back down the chain
    const imageUrl =
      links.large ??
      links.medium ??
      links.small ??
      links.thumbnail ??
      links.smallThumbnail;

    if (imageUrl) {
      // Google Books URLs may use http — upgrade to https
      const secureUrl = imageUrl.replace(/^http:\/\//, "https://");
      return {
        imageUrl: secureUrl,
        source: "google",
        title: item.volumeInfo?.title,
        author: item.volumeInfo?.authors?.[0],
      };
    }
  }
  return null;
}

// ── OpenLibrary: ISBN search ─────────────────────────────────────────

/**
 * FIX: The original only tried the medium (-M) cover size, which is often
 * missing on OpenLibrary. Now we try large (-L) first, validate it, and fall
 * back to medium (-M) if the large cover is absent.
 */
async function tryOpenLibraryImageByIsbn(isbn: string): Promise<BookImageResult | null> {
  try {
    const response = await fetchWithTimeout(
      `https://openlibrary.org/isbn/${isbn}.json`,
      7_000,
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      title?: string;
      covers?: number[];
    };

    const coverId = data.covers?.find((id) => id > 0);
    if (coverId) {
      const largeUrl = `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
      const mediumUrl = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;

      // Prefer large, fall back to medium
      const resolvedUrl = (await isValidImageUrl(largeUrl)) ? largeUrl : mediumUrl;

      return {
        imageUrl: resolvedUrl,
        source: "openlibrary",
        title: data.title,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

// ── OpenLibrary: title+author search ─────────────────────────────────

/**
 * FIX: Same cover size strategy as above — try large (-L) before medium (-M).
 */
async function tryOpenLibraryImageByQuery(
  title: string,
  author: string,
): Promise<BookImageResult | null> {
  try {
    const params = new URLSearchParams({ limit: "5" });
    if (title) params.set("title", title);
    if (author) params.set("author", author);

    const response = await fetchWithTimeout(
      `https://openlibrary.org/search.json?${params.toString()}`,
      7_000,
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      docs?: Array<{
        title?: string;
        author_name?: string[];
        cover_i?: number;
        isbn?: string[];
      }>;
    };

    for (const doc of payload.docs ?? []) {
      if (doc.cover_i) {
        const largeUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
        const mediumUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;

        // Prefer large, fall back to medium
        const resolvedUrl = (await isValidImageUrl(largeUrl)) ? largeUrl : mediumUrl;

        return {
          imageUrl: resolvedUrl,
          source: "openlibrary",
          title: doc.title,
          author: doc.author_name?.[0],
        };
      }
    }
  } catch {
    // Ignore
  }
  return null;
}