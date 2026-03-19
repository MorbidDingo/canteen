import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { runParallelForEach, type RowProgressLog } from "@/lib/bulk-upload-engine";
import type { BookCategory, BookCopyCondition } from "@/lib/constants";
import * as XLSX from "xlsx";

type RowData = {
  title: string;
  author: string;
  isbn: string | null;
  publisher: string | null;
  edition: string | null;
  category: string;
  accessionNumber: string;
  condition: string;
  location: string | null;
};

type UploadResult = {
  row: number;
  title: string;
  accessionNumber: string;
  status: "created" | "skipped" | "error";
  message: string;
  bookCreated: boolean;
};

const VALID_CATEGORIES = new Set([
  "FICTION",
  "NON_FICTION",
  "TEXTBOOK",
  "REFERENCE",
  "PERIODICAL",
  "GENERAL",
]);
const VALID_CONDITIONS = new Set(["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"]);

const MAX_ROWS = 5000;
const BOOK_CREATE_CONCURRENCY = 24;
const COPY_CREATE_CONCURRENCY = 48;

function normalizeCategory(val: string): string {
  const upper = val.toUpperCase().replace(/[\s-]+/g, "_");
  if (VALID_CATEGORIES.has(upper)) return upper;
  if (upper === "NONFICTION" || upper === "NON_FICTION") return "NON_FICTION";
  return "GENERAL";
}

function normalizeCondition(val: string): string {
  const upper = val.toUpperCase().trim();
  if (VALID_CONDITIONS.has(upper)) return upper;
  return "NEW";
}

function normalizeRows(rawRows: Record<string, unknown>[]): RowData[] {
  return rawRows.map((raw) => {
    const n: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      n[key.trim().toLowerCase().replace(/[\s_-]+/g, "")] = String(value ?? "").trim();
    }

    return {
      title: n["title"] || n["bookname"] || n["booktitle"] || n["name"] || "",
      author: n["author"] || n["writer"] || n["authorname"] || "",
      isbn: n["isbn"] || n["isbn10"] || n["isbn13"] || null,
      publisher: n["publisher"] || n["pub"] || null,
      edition: n["edition"] || null,
      category: normalizeCategory(n["category"] || n["genre"] || n["type"] || "GENERAL"),
      accessionNumber: n["accessionnumber"] || n["accession"] || n["barcode"] || n["copyid"] || "",
      condition: normalizeCondition(n["condition"] || n["state"] || "NEW"),
      location: n["location"] || n["shelf"] || n["shelflocation"] || null,
    };
  });
}

function validateRows(rows: RowData[]) {
  const errors: { row: number; error: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.title) errors.push({ row: i + 2, error: "Title is required" });
    if (!row.author) errors.push({ row: i + 2, error: "Author is required" });
    if (!row.accessionNumber) errors.push({ row: i + 2, error: "Accession number is required" });
  }
  return errors;
}

function isStreamRequested(request: NextRequest): boolean {
  const mode = request.nextUrl.searchParams.get("mode");
  return mode === "stream";
}

async function processUpload(
  request: NextRequest,
  emit?: (log: RowProgressLog, processed: number, total: number) => void,
  emitStage?: (stage: string, message: string, progress?: number) => void,
) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "LIB_OPERATOR"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return {
        response: NextResponse.json({ error: error.message, code: error.code }, { status: error.status }),
      };
    }
    throw error;
  }

  const organizationId = access.activeOrganizationId!;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return { response: NextResponse.json({ error: "No file uploaded" }, { status: 400 }) };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  emitStage?.("parsing", "Reading workbook", 10);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { response: NextResponse.json({ error: "Empty workbook" }, { status: 400 }) };
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName]);

  if (rawRows.length === 0) {
    return { response: NextResponse.json({ error: "No data rows found" }, { status: 400 }) };
  }

  if (rawRows.length > MAX_ROWS) {
    return {
      response: NextResponse.json(
        { error: `Maximum ${MAX_ROWS} rows allowed per upload` },
        { status: 400 },
      ),
    };
  }

  emitStage?.("parsing", "Workbook parsed", 100);
  emitStage?.("validating", "Validating rows and required fields", 10);
  const rows = normalizeRows(rawRows);
  rawRows.length = 0;
  const validationErrors = validateRows(rows);
  if (validationErrors.length > 0) {
    return {
      response: NextResponse.json({ error: "Validation errors", errors: validationErrors }, { status: 400 }),
    };
  }
  emitStage?.("validating", "Validation completed", 100);

  emitStage?.("preloading", "Loading existing books and copies", 10);
  const total = rows.length;
  let processed = 0;

  const accessionNumbers = [...new Set(rows.map((r) => r.accessionNumber))];
  const existingCopies = accessionNumbers.length
    ? await db
        .select({ accessionNumber: bookCopy.accessionNumber })
        .from(bookCopy)
        .where(and(inArray(bookCopy.accessionNumber, accessionNumbers), eq(bookCopy.organizationId, organizationId)))
    : [];
  const existingAccessions = new Set(existingCopies.map((c) => c.accessionNumber));

  const isbnList = [...new Set(rows.map((r) => r.isbn).filter(Boolean))] as string[];
  const isbnToBookId = new Map<string, string>();

  if (isbnList.length > 0) {
    const booksByIsbn = await db
      .select({ id: book.id, isbn: book.isbn })
      .from(book)
      .where(and(inArray(book.isbn, isbnList), eq(book.organizationId, organizationId)));
    for (const b of booksByIsbn) {
      if (b.isbn) isbnToBookId.set(b.isbn, b.id);
    }
  }
  emitStage?.("preloading", "Preload complete", 100);

  const titleAuthorKeys = [...new Set(rows.map((r) => `${r.title}|||${r.author}`.toLowerCase()))];
  const titleAuthorToBookId = new Map<string, string>();

  let matchProcessed = 0;
  let matchProgressSent = -1;
  emitStage?.("matching-books", "Matching books by ISBN/title/author (0%)", 0);
  await runParallelForEach(titleAuthorKeys, BOOK_CREATE_CONCURRENCY, async (key) => {
    const [title, author] = key.split("|||");
    const found = await db
      .select({ id: book.id, title: book.title, author: book.author })
      .from(book)
      .where(
        and(
          eq(book.organizationId, organizationId),
          sql`lower(${book.title}) = ${title}`,
          sql`lower(${book.author}) = ${author}`,
        ),
      )
      .limit(1);
    if (found[0]) {
      titleAuthorToBookId.set(key, found[0].id);
    }

    matchProcessed += 1;
    const pct = titleAuthorKeys.length > 0 ? Math.round((matchProcessed / titleAuthorKeys.length) * 100) : 100;
    if (pct !== matchProgressSent) {
      matchProgressSent = pct;
      emitStage?.("matching-books", `Matching books by ISBN/title/author (${pct}%)`, pct);
    }
  });

  const results: UploadResult[] = new Array(rows.length);
  const affectedBookIds = new Set<string>();

  let createProgressSent = -1;
  emitStage?.("creating-copies", "Creating books and copies (0%)", 0);
  await runParallelForEach(rows, COPY_CREATE_CONCURRENCY, async (row, idx) => {
    if (existingAccessions.has(row.accessionNumber)) {
      const res: UploadResult = {
        row: idx + 2,
        title: row.title,
        accessionNumber: row.accessionNumber,
        status: "skipped",
        message: `Accession number ${row.accessionNumber} already exists`,
        bookCreated: false,
      };
      results[idx] = res;
      processed += 1;
      const pct = Math.round((processed / total) * 100);
      if (pct !== createProgressSent) {
        createProgressSent = pct;
        emitStage?.("creating-copies", `Creating books and copies (${pct}%)`, pct);
      }
      emit?.({ row: res.row, status: res.status, message: res.message }, processed, total);
      return;
    }

    try {
      let bookId: string | null = null;
      let bookCreated = false;

      if (row.isbn && isbnToBookId.has(row.isbn)) {
        bookId = isbnToBookId.get(row.isbn)!;
      }

      if (!bookId) {
        const key = `${row.title}|||${row.author}`.toLowerCase();
        if (titleAuthorToBookId.has(key)) {
          bookId = titleAuthorToBookId.get(key)!;
        }
      }

      if (!bookId) {
        const [newBook] = await db
          .insert(book)
          .values({
            organizationId,
            title: row.title,
            author: row.author,
            isbn: row.isbn,
            publisher: row.publisher,
            edition: row.edition,
            category: row.category as BookCategory,
            totalCopies: 0,
            availableCopies: 0,
          })
          .returning({ id: book.id });
        bookId = newBook.id;
        bookCreated = true;

        if (row.isbn) isbnToBookId.set(row.isbn, bookId);
        titleAuthorToBookId.set(`${row.title}|||${row.author}`.toLowerCase(), bookId);
      }

      await db.insert(bookCopy).values({
        organizationId,
        bookId,
        accessionNumber: row.accessionNumber,
        condition: row.condition as BookCopyCondition,
        status: "AVAILABLE",
        location: row.location,
      });

      existingAccessions.add(row.accessionNumber);
      affectedBookIds.add(bookId);

      const res: UploadResult = {
        row: idx + 2,
        title: row.title,
        accessionNumber: row.accessionNumber,
        status: "created",
        message: bookCreated ? "Book and copy created" : "Copy added to existing book",
        bookCreated,
      };
      results[idx] = res;
      processed += 1;
      const pct = Math.round((processed / total) * 100);
      if (pct !== createProgressSent) {
        createProgressSent = pct;
        emitStage?.("creating-copies", `Creating books and copies (${pct}%)`, pct);
      }
      emit?.({ row: res.row, status: res.status, message: res.message }, processed, total);
    } catch (error) {
      const res: UploadResult = {
        row: idx + 2,
        title: row.title,
        accessionNumber: row.accessionNumber,
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        bookCreated: false,
      };
      results[idx] = res;
      processed += 1;
      const pct = Math.round((processed / total) * 100);
      if (pct !== createProgressSent) {
        createProgressSent = pct;
        emitStage?.("creating-copies", `Creating books and copies (${pct}%)`, pct);
      }
      emit?.({ row: res.row, status: res.status, message: res.message }, processed, total);
    }
  });

  if (affectedBookIds.size > 0) {
    emitStage?.("recounting", "Recounting book availability (0%)", 0);
    const ids = Array.from(affectedBookIds);
    // Aggregate in SQL to avoid loading every copy row for affected books into memory.
    const groupedCounts = await db
      .select({
        bookId: bookCopy.bookId,
        total: sql<number>`count(*) filter (where ${bookCopy.status} <> 'RETIRED')`,
        available: sql<number>`count(*) filter (where ${bookCopy.status} = 'AVAILABLE')`,
      })
      .from(bookCopy)
      .where(and(inArray(bookCopy.bookId, ids), eq(bookCopy.organizationId, organizationId)))
      .groupBy(bookCopy.bookId);

    const countMap = new Map<string, { total: number; available: number }>();
    for (const row of groupedCounts) {
      countMap.set(row.bookId, {
        total: Number(row.total) || 0,
        available: Number(row.available) || 0,
      });
    }

    let recountProcessed = 0;
    let recountProgressSent = -1;
    await runParallelForEach(ids, BOOK_CREATE_CONCURRENCY, async (id) => {
      const counts = countMap.get(id) ?? { total: 0, available: 0 };
      await db
        .update(book)
        .set({ totalCopies: counts.total, availableCopies: counts.available, updatedAt: new Date() })
        .where(and(eq(book.id, id), eq(book.organizationId, organizationId)));

      recountProcessed += 1;
      const pct = Math.round((recountProcessed / ids.length) * 100);
      if (pct !== recountProgressSent) {
        recountProgressSent = pct;
        emitStage?.("recounting", `Recounting book availability (${pct}%)`, pct);
      }
    });
  } else {
    emitStage?.("recounting", "No recount required", 100);
  }

  const summary = {
    total: rows.length,
    created: results.filter((r) => r?.status === "created").length,
    skipped: results.filter((r) => r?.status === "skipped").length,
    errors: results.filter((r) => r?.status === "error").length,
    booksCreated: results.filter((r) => r?.bookCreated).length,
    copiesAdded: results.filter((r) => r?.status === "created").length,
  };

  emitStage?.("finalizing", "Writing audit and preparing response", 40);
  await logAudit({
    userId: access.actorUserId,
    userRole: access.membershipRole || access.session.user.role,
    action: AUDIT_ACTIONS.LIBRARY_BULK_UPLOAD,
    details: {
      organizationId,
      ...summary,
      bookConcurrency: BOOK_CREATE_CONCURRENCY,
      copyConcurrency: COPY_CREATE_CONCURRENCY,
    },
    request,
  });
  emitStage?.("finalizing", "Finalizing complete", 100);

  return { payload: { results, summary } };
}

export async function POST(request: NextRequest) {
  if (!isStreamRequested(request)) {
    try {
      const out = await processUpload(request);
      if (out.response) return out.response;
      return NextResponse.json(out.payload);
    } catch (error) {
      console.error("Library bulk upload error:", error);
      return NextResponse.json({ error: "Failed to process upload" }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("start", { message: "Upload started" });
        const out = await processUpload(
          request,
          (log, processed, total) => {
          send("row", { ...log, processed, total });
          },
          (stage, message, progress) => {
            send("stage", { stage, message, progress });
          },
        );

        if (out.response) {
          const text = await out.response.text();
          send("error", { message: text });
          controller.close();
          return;
        }

        send("done", out.payload);
      } catch (error) {
        send("error", { message: error instanceof Error ? error.message : "Upload failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
