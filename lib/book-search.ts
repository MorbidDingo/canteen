/**
 * Book search utility functions
 * Searches Google Books API and OpenLibrary for book information and cover images
 */

function compactText(value: string, maxLen: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}...` : trimmed;
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

type BookImageResult = {
  imageUrl: string | null;
  source: "google" | "openlibrary";
  title?: string;
  author?: string;
};

/**
 * Search for a book cover image using Google Books API and OpenLibrary
 * Returns the first available cover image found
 */
export async function searchBookImage(
  title: string,
  author: string,
  isbn?: string | null,
): Promise<BookImageResult | null> {
  const safeTitle = compactText(title, 100);
  const safeAuthor = compactText(author, 80);

  // Try ISBN first if available
  if (isbn?.trim()) {
    const isbnResult = await tryGoogleBooksImage(isbn.trim());
    if (isbnResult?.imageUrl) return isbnResult;

    const olIsbnResult = await tryOpenLibraryImage(isbn.trim());
    if (olIsbnResult?.imageUrl) return olIsbnResult;
  }

  // Fall back to title + author search
  const query = `${safeTitle} ${safeAuthor}`;
  const encoded = encodeURIComponent(query);

  // Try Google Books with title + author
  const googleResult = await tryGoogleBooksImage(encoded);
  if (googleResult?.imageUrl) return googleResult;

  // Try OpenLibrary with title + author
  const olResult = await tryOpenLibraryImage(encoded);
  if (olResult?.imageUrl) return olResult;

  return null;
}

async function tryGoogleBooksImage(query: string): Promise<BookImageResult | null> {
  try {
    const encoded = encodeURIComponent(query);
    const response = await fetchWithTimeout(
      `https://www.googleapis.com/books/v1/volumes?q=${encoded}&maxResults=5`,
      7_000,
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      items?: Array<{
        volumeInfo?: {
          title?: string;
          authors?: string[];
          imageLinks?: {
            thumbnail?: string;
            smallThumbnail?: string;
          };
        };
      }>;
    };

    for (const item of payload.items ?? []) {
      const imageUrl = item.volumeInfo?.imageLinks?.thumbnail;
      if (imageUrl) {
        return {
          imageUrl,
          source: "google",
          title: item.volumeInfo?.title,
          author: item.volumeInfo?.authors?.[0],
        };
      }
    }
  } catch {
    // Ignore fetch or parse errors
  }

  return null;
}

async function tryOpenLibraryImage(query: string): Promise<BookImageResult | null> {
  try {
    const encoded = encodeURIComponent(query);
    const response = await fetchWithTimeout(
      `https://openlibrary.org/search.json?q=${encoded}&limit=5`,
      7_000,
    );

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      docs?: Array<{
        title?: string;
        author_name?: string[];
        cover_i?: number;
      }>;
    };

    for (const doc of payload.docs ?? []) {
      if (doc.cover_i) {
        const imageUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
        return {
          imageUrl,
          source: "openlibrary",
          title: doc.title,
          author: doc.author_name?.[0],
        };
      }
    }
  } catch {
    // Ignore fetch or parse errors
  }

  return null;
}
