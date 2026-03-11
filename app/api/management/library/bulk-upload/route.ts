import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import type { BookCategory, BookCopyCondition } from "@/lib/constants";
import * as XLSX from "xlsx";

interface RowData {
  title: string;
  author: string;
  isbn: string | null;
  publisher: string | null;
  edition: string | null;
  category: string;
  accessionNumber: string;
  condition: string;
  location: string | null;
}

const VALID_CATEGORIES = new Set([
  "FICTION", "NON_FICTION", "TEXTBOOK", "REFERENCE", "PERIODICAL", "GENERAL",
]);
const VALID_CONDITIONS = new Set(["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"]);

function normalizeCategory(val: string): string {
  const upper = val.toUpperCase().replace(/[\s-]+/g, "_");
  if (VALID_CATEGORIES.has(upper)) return upper;
  // Common aliases
  if (upper === "NONFICTION" || upper === "NON_FICTION") return "NON_FICTION";
  return "GENERAL";
}

function normalizeCondition(val: string): string {
  const upper = val.toUpperCase().trim();
  if (VALID_CONDITIONS.has(upper)) return upper;
  return "NEW";
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || !["MANAGEMENT", "LIB_OPERATOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "Empty workbook" }, { status: 400 });
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName],
    );

    if (rawRows.length === 0) {
      return NextResponse.json({ error: "No data rows found" }, { status: 400 });
    }

    if (rawRows.length > 1000) {
      return NextResponse.json(
        { error: "Maximum 1000 rows allowed per upload" },
        { status: 400 },
      );
    }

    // Normalize column names — flexible detection with aliases
    const rows: RowData[] = rawRows.map((raw) => {
      const n: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) {
        n[key.trim().toLowerCase().replace(/[\s_-]+/g, "")] = String(value ?? "").trim();
      }

      return {
        title:
          n["title"] || n["bookname"] || n["booktitle"] || n["name"] || "",
        author:
          n["author"] || n["writer"] || n["authorname"] || "",
        isbn:
          n["isbn"] || n["isbn10"] || n["isbn13"] || null,
        publisher:
          n["publisher"] || n["pub"] || null,
        edition:
          n["edition"] || null,
        category: normalizeCategory(
          n["category"] || n["genre"] || n["type"] || "GENERAL",
        ),
        accessionNumber:
          n["accessionnumber"] || n["accession"] || n["barcode"] || n["copyid"] || "",
        condition: normalizeCondition(
          n["condition"] || n["state"] || "NEW",
        ),
        location:
          n["location"] || n["shelf"] || n["shelflocation"] || null,
      };
    });

    // Validate mandatory fields
    const errors: { row: number; error: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.title) errors.push({ row: i + 2, error: "Title is required" });
      if (!row.author) errors.push({ row: i + 2, error: "Author is required" });
      if (!row.accessionNumber)
        errors.push({ row: i + 2, error: "Accession number is required" });
    }
    if (errors.length > 0) {
      return NextResponse.json({ error: "Validation errors", errors }, { status: 400 });
    }

    // Check which accession numbers already exist
    const existingAccessions = new Set<string>();
    for (const row of rows) {
      const [found] = await db
        .select({ id: bookCopy.id })
        .from(bookCopy)
        .where(eq(bookCopy.accessionNumber, row.accessionNumber))
        .limit(1);
      if (found) existingAccessions.add(row.accessionNumber);
    }

    // Track books by ISBN and by title+author for dedup within batch
    const isbnToBookId = new Map<string, string>();
    const titleAuthorToBookId = new Map<string, string>();

    // Pre-load books by ISBN
    const isbns = [...new Set(rows.map((r) => r.isbn).filter(Boolean))] as string[];
    for (const isbn of isbns) {
      const [found] = await db
        .select({ id: book.id })
        .from(book)
        .where(eq(book.isbn, isbn))
        .limit(1);
      if (found) isbnToBookId.set(isbn, found.id);
    }

    const results: {
      row: number;
      title: string;
      accessionNumber: string;
      status: "created" | "skipped" | "error";
      message: string;
      bookCreated: boolean;
    }[] = [];

    let booksCreated = 0;
    let copiesAdded = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Skip if accession number already exists
      if (existingAccessions.has(row.accessionNumber)) {
        results.push({
          row: i + 2,
          title: row.title,
          accessionNumber: row.accessionNumber,
          status: "skipped",
          message: `Accession number ${row.accessionNumber} already exists`,
          bookCreated: false,
        });
        continue;
      }

      try {
        let bookId: string | null = null;
        let bookCreated = false;

        // Try to find existing book by ISBN
        if (row.isbn && isbnToBookId.has(row.isbn)) {
          bookId = isbnToBookId.get(row.isbn)!;
        }

        // Try by title+author
        if (!bookId) {
          const key = `${row.title.toLowerCase()}|||${row.author.toLowerCase()}`;
          if (titleAuthorToBookId.has(key)) {
            bookId = titleAuthorToBookId.get(key)!;
          } else {
            // Check DB
            const [found] = await db
              .select({ id: book.id })
              .from(book)
              .where(
                and(
                  eq(book.title, row.title),
                  eq(book.author, row.author),
                ),
              )
              .limit(1);
            if (found) {
              bookId = found.id;
              titleAuthorToBookId.set(key, found.id);
            }
          }
        }

        // Create book if not found
        if (!bookId) {
          const [newBook] = await db
            .insert(book)
            .values({
              title: row.title,
              author: row.author,
              isbn: row.isbn,
              publisher: row.publisher,
              edition: row.edition,
              category: row.category as BookCategory,
              totalCopies: 0,
              availableCopies: 0,
            })
            .returning();

          bookId = newBook.id;
          bookCreated = true;
          booksCreated++;

          if (row.isbn) isbnToBookId.set(row.isbn, bookId);
          const key = `${row.title.toLowerCase()}|||${row.author.toLowerCase()}`;
          titleAuthorToBookId.set(key, bookId);
        }

        // Create the copy
        await db.insert(bookCopy).values({
          bookId,
          accessionNumber: row.accessionNumber,
          condition: row.condition as BookCopyCondition,
          status: "AVAILABLE",
          location: row.location,
        });

        copiesAdded++;
        existingAccessions.add(row.accessionNumber);

        // Update cached counts
        const allCopies = await db
          .select({ status: bookCopy.status })
          .from(bookCopy)
          .where(eq(bookCopy.bookId, bookId));

        const total = allCopies.filter((c) => c.status !== "RETIRED").length;
        const available = allCopies.filter((c) => c.status === "AVAILABLE").length;

        await db
          .update(book)
          .set({ totalCopies: total, availableCopies: available, updatedAt: new Date() })
          .where(eq(book.id, bookId));

        results.push({
          row: i + 2,
          title: row.title,
          accessionNumber: row.accessionNumber,
          status: "created",
          message: bookCreated
            ? "Book & copy created"
            : "Copy added to existing book",
          bookCreated,
        });
      } catch (err) {
        console.error(`Library bulk upload row ${i + 2} error:`, err);
        results.push({
          row: i + 2,
          title: row.title,
          accessionNumber: row.accessionNumber,
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
          bookCreated: false,
        });
      }
    }

    const summary = {
      total: rows.length,
      created: results.filter((r) => r.status === "created").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      booksCreated,
      copiesAdded,
    };

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.LIBRARY_BULK_UPLOAD,
      details: summary,
      request,
    });

    return NextResponse.json({ results, summary });
  } catch (error) {
    console.error("Library bulk upload error:", error);
    return NextResponse.json({ error: "Failed to process upload" }, { status: 500 });
  }
}
