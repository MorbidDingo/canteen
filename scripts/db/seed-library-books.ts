import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { book, bookCopy, organization } from "../../lib/db/schema";

type LibraryBookCategory =
  | "FICTION"
  | "NON_FICTION"
  | "TEXTBOOK"
  | "REFERENCE"
  | "PERIODICAL"
  | "GENERAL";

type GutendexAuthor = { name: string };
type GutendexBook = {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  subjects?: string[];
  bookshelves?: string[];
  formats?: Record<string, string>;
};
type GutendexResponse = {
  next: string | null;
  results: GutendexBook[];
};

type SeedCandidate = {
  sourceId: string;
  title: string;
  author: string;
  isbn: string | null;
  description: string | null;
  category: LibraryBookCategory;
  coverImageUrl: string | null;
};

const DEFAULT_TARGET = Number(process.env.LIBRARY_SEED_TARGET ?? 3200);
const FETCH_BATCH_SIZE = Number(process.env.LIBRARY_SEED_FETCH_BATCH ?? 220);
const OPEN_LIBRARY_CONCURRENCY = Number(
  process.env.LIBRARY_SEED_OPENLIB_CONCURRENCY ?? 8,
);
const INSERT_BATCH_SIZE = Number(process.env.LIBRARY_SEED_INSERT_BATCH ?? 200);

function parseCliTarget() {
  const arg = process.argv.find((item) => item.startsWith("--target="));
  if (!arg) return DEFAULT_TARGET;
  const value = Number(arg.split("=")[1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_TARGET;
}

function normalizeBookKey(title: string, author: string) {
  return `${title.trim().toLowerCase()}|||${author.trim().toLowerCase()}`;
}

function trimText(value: string | null | undefined, max = 240) {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

function normalizeIsbn(raw: string | null | undefined) {
  if (!raw) return null;
  const compact = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (compact.length === 10 || compact.length === 13) return compact;
  return null;
}

function deriveCategory(seed: GutendexBook): LibraryBookCategory {
  const text = [
    seed.title,
    ...(seed.subjects ?? []),
    ...(seed.bookshelves ?? []),
  ]
    .join(" ")
    .toLowerCase();

  if (
    /(textbook|curriculum|worksheet|exam|school|mathematics|science for|grammar|course|algebra|geometry|physics|chemistry|biology)/.test(
      text,
    )
  ) {
    return "TEXTBOOK";
  }

  if (
    /(encyclopedia|dictionary|atlas|handbook|manual|reference|catalog|guidebook|glossary)/.test(
      text,
    )
  ) {
    return "REFERENCE";
  }

  if (/(journal|magazine|periodical|newspaper|bulletin|review)/.test(text)) {
    return "PERIODICAL";
  }

  if (
    /(novel|fiction|mystery|fantasy|drama|poetry|romance|thriller|stories|children.?s fiction|adventure)/.test(
      text,
    )
  ) {
    return "FICTION";
  }

  if (
    /(history|biography|memoir|science|philosophy|politics|economics|religion|psychology|sociology|nonfiction|essay)/.test(
      text,
    )
  ) {
    return "NON_FICTION";
  }

  return "GENERAL";
}

function pickPrimaryCoverUrl(formats?: Record<string, string>) {
  if (!formats) return null;
  return (
    formats["image/jpeg"] ??
    formats["image/jpg"] ??
    formats["image/png"] ??
    null
  );
}

async function fetchJson<T>(url: string, retries = 3): Promise<T> {
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < retries) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "certe-library-seeder/1.0" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to fetch ${url}`);
}

async function findCoverOnOpenLibrary(
  title: string,
  author: string,
): Promise<{ coverImageUrl: string | null; isbn: string | null }> {
  const query = `https://openlibrary.org/search.json?title=${encodeURIComponent(
    title,
  )}&author=${encodeURIComponent(
    author,
  )}&limit=1&fields=cover_i,isbn`;
  const data = await fetchJson<{
    docs?: Array<{ cover_i?: number; isbn?: string[] }>;
  }>(query, 2);

  const doc = data.docs?.[0];
  if (!doc) return { coverImageUrl: null, isbn: null };

  const isbn = normalizeIsbn(doc.isbn?.[0] ?? null);
  if (typeof doc.cover_i === "number") {
    return {
      coverImageUrl: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
      isbn,
    };
  }

  if (isbn) {
    return {
      coverImageUrl: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
      isbn,
    };
  }

  return { coverImageUrl: null, isbn: null };
}

async function forEachConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  if (items.length === 0) return;
  let nextIndex = 0;

  async function runner() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      await worker(items[current], current);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runner(),
    ),
  );
}

async function collectCandidates(
  desiredCount: number,
  existingKeys: Set<string>,
): Promise<SeedCandidate[]> {
  const candidates: SeedCandidate[] = [];
  const seenKeys = new Set(existingKeys);

  let nextUrl = "https://gutendex.com/books/?page=1";
  let pagesFetched = 0;

  while (nextUrl && candidates.length < desiredCount && pagesFetched < FETCH_BATCH_SIZE) {
    const data = await fetchJson<GutendexResponse>(nextUrl);
    pagesFetched += 1;
    nextUrl = data.next;

    for (const entry of data.results ?? []) {
      const title = trimText(entry.title, 180);
      if (!title) continue;

      const author = trimText(entry.authors?.[0]?.name, 120) ?? "Unknown Author";
      const key = normalizeBookKey(title, author);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const description = trimText(entry.subjects?.slice(0, 8).join(", "), 450);

      candidates.push({
        sourceId: `gutendex:${entry.id}`,
        title,
        author,
        isbn: null,
        description,
        category: deriveCategory(entry),
        coverImageUrl: pickPrimaryCoverUrl(entry.formats),
      });

      if (candidates.length >= desiredCount) break;
    }

    if (pagesFetched % 20 === 0) {
      console.log(
        `  fetched ${pagesFetched} pages from Gutendex, collected ${candidates.length} candidate books...`,
      );
    }
  }

  return candidates;
}

async function enrichMissingCoverData(candidates: SeedCandidate[]) {
  const missingCoverIndices = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => !candidate.coverImageUrl)
    .map(({ index }) => index);

  if (missingCoverIndices.length === 0) return 0;

  let covered = 0;
  await forEachConcurrent(
    missingCoverIndices,
    OPEN_LIBRARY_CONCURRENCY,
    async (candidateIndex, workerIndex) => {
      const candidate = candidates[candidateIndex];
      try {
        const result = await findCoverOnOpenLibrary(
          candidate.title,
          candidate.author,
        );
        if (!candidate.coverImageUrl && result.coverImageUrl) {
          candidate.coverImageUrl = result.coverImageUrl;
          covered += 1;
        }
        if (!candidate.isbn && result.isbn) {
          candidate.isbn = result.isbn;
        }
      } catch {
        // Ignore single-book enrichment failures and continue.
      }

      if ((workerIndex + 1) % 100 === 0) {
        console.log(
          `  Open Library enrichment progress: ${workerIndex + 1}/${missingCoverIndices.length}`,
        );
      }
    },
  );

  return covered;
}

async function resolveOrganizationId() {
  const explicitOrgId = process.env.SEED_ORG_ID?.trim();
  if (explicitOrgId) return explicitOrgId;

  const [existingOrg] = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .limit(1);

  if (!existingOrg) {
    throw new Error(
      "No organization found. Seed base data first (e.g. run npm run db:seed).",
    );
  }

  console.log(`Using organization: ${existingOrg.name} (${existingOrg.id})`);
  return existingOrg.id;
}

async function seedLibraryBooks() {
  const target = parseCliTarget();
  const orgId = await resolveOrganizationId();

  console.log(`\nSeeding library catalog to at least ${target} books...`);

  const existingBooks = await db
    .select({
      id: book.id,
      title: book.title,
      author: book.author,
    })
    .from(book)
    .where(eq(book.organizationId, orgId));

  const existingCount = existingBooks.length;
  if (existingCount >= target) {
    console.log(
      `Library already has ${existingCount} books (target ${target}). Nothing to do.`,
    );
    return;
  }

  const needed = target - existingCount;
  const existingKeys = new Set(
    existingBooks.map((record) => normalizeBookKey(record.title, record.author)),
  );

  console.log(`Current books: ${existingCount}. Need to add: ${needed}.`);
  const candidateBuffer = Math.max(needed + 300, needed);
  const candidates = await collectCandidates(candidateBuffer, existingKeys);

  if (candidates.length === 0) {
    throw new Error("No candidate books could be fetched from free APIs.");
  }

  console.log(`Collected ${candidates.length} candidate books from Gutendex.`);

  const coverRecovered = await enrichMissingCoverData(candidates);
  if (coverRecovered > 0) {
    console.log(
      `Recovered ${coverRecovered} missing cover links via Open Library API.`,
    );
  }

  const toInsert = candidates.slice(0, needed);
  console.log(`Preparing to insert ${toInsert.length} books...`);

  let insertedCount = 0;
  for (let offset = 0; offset < toInsert.length; offset += INSERT_BATCH_SIZE) {
    const batch = toInsert.slice(offset, offset + INSERT_BATCH_SIZE);
    const now = new Date();

    const insertedBooks = await db
      .insert(book)
      .values(
        batch.map((entry) => ({
          organizationId: orgId,
          isbn: entry.isbn,
          title: entry.title,
          author: entry.author,
          publisher: "Project Gutenberg",
          edition: null,
          category: entry.category,
          description: entry.description,
          coverImageUrl: entry.coverImageUrl,
          totalCopies: 1,
          availableCopies: 1,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning({ id: book.id });

    await db.insert(bookCopy).values(
      insertedBooks.map((inserted) => ({
        organizationId: orgId,
        bookId: inserted.id,
        accessionNumber: `BK-${inserted.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`,
        condition: "NEW",
        status: "AVAILABLE",
        location: "Main Shelf",
        createdAt: now,
        updatedAt: now,
      })),
    );

    insertedCount += insertedBooks.length;
    console.log(`  inserted ${insertedCount}/${toInsert.length} books...`);
  }

  const finalTotal = existingCount + insertedCount;
  const finalWithCover = toInsert.filter((entry) => !!entry.coverImageUrl).length;

  console.log("\nLibrary seeding complete.");
  console.log(`  Added books: ${insertedCount}`);
  console.log(`  Added with cover URLs: ${finalWithCover}/${insertedCount}`);
  console.log(`  Total books now: ${finalTotal}`);
}

seedLibraryBooks()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Library seed failed:", error);
    process.exit(1);
  });

