import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  child,
  book,
  bookCopy,
  bookIssuance,
  librarySetting,
} from "@/lib/db/schema";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { broadcast } from "@/lib/sse";
import { LIBRARY_SETTINGS_DEFAULTS } from "@/lib/constants";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

async function getSetting(key: string): Promise<string> {
  const rows = await db
    .select({ value: librarySetting.value })
    .from(librarySetting)
    .where(eq(librarySetting.key, key))
    .limit(1);
  return rows[0]?.value ?? LIBRARY_SETTINGS_DEFAULTS[key] ?? "";
}

// POST /api/library/issue — issue a book copy to a child (RFID + accession#/ISBN)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rfidCardId, scanInput } = body as {
      rfidCardId: string;
      scanInput: string;
    };

    // ── Basic validation ──────────────────────────────
    if (!rfidCardId || !scanInput) {
      return NextResponse.json(
        { success: false, reason: "Missing RFID card or book scan input" },
        { status: 400 }
      );
    }

    // ── 1. Check self-service is allowed ──────────────
    const allowSelfService = await getSetting("allow_self_service_issue");
    if (allowSelfService === "false") {
      return NextResponse.json(
        { success: false, reason: "Self-service issue is disabled. Please visit the library desk." },
        { status: 200 }
      );
    }

    // ── 2. Look up child by RFID ─────────────────────
    const children = await db
      .select()
      .from(child)
      .where(eq(child.rfidCardId, rfidCardId))
      .limit(1);

    if (children.length === 0) {
      return NextResponse.json(
        { success: false, reason: "Unknown card. Please ask the school office to register your card." },
        { status: 200 }
      );
    }

    const studentChild = children[0];

    // ── 3. Check max books per student ────────────────
    const maxBooksStr = await getSetting("max_books_per_student");
    const maxBooks = parseInt(maxBooksStr, 10) || 3;

    const activeIssuances = await db
      .select({ id: bookIssuance.id, dueDate: bookIssuance.dueDate, status: bookIssuance.status })
      .from(bookIssuance)
      .where(
        and(
          eq(bookIssuance.childId, studentChild.id),
          inArray(bookIssuance.status, ["ISSUED", "RETURN_PENDING"])
        )
      );

    if (activeIssuances.length >= maxBooks) {
      return NextResponse.json(
        { success: false, reason: `You already have ${activeIssuances.length} books issued (max ${maxBooks}). Please return a book first.` },
        { status: 200 }
      );
    }

    // ── 4. Check if student has overdue books ─────────
    const blockIfOverdue = await getSetting("block_issue_if_overdue");
    if (blockIfOverdue === "true") {
      const now = new Date();
      const hasOverdue = activeIssuances.some(
        (i) => i.status === "ISSUED" && new Date(i.dueDate) < now
      );
      if (hasOverdue) {
        return NextResponse.json(
          { success: false, reason: "You have overdue books. Please return them before issuing new ones." },
          { status: 200 }
        );
      }
    }

    // ── 5. Resolve book copy from scan input ──────────
    // Try accession number first, then ISBN
    let resolvedCopy: typeof bookCopy.$inferSelect | null = null;
    let resolvedBook: typeof book.$inferSelect | null = null;

    // Try accession number (exact match)
    const copyByAccession = await db
      .select()
      .from(bookCopy)
      .where(eq(bookCopy.accessionNumber, scanInput))
      .limit(1);

    if (copyByAccession.length > 0) {
      resolvedCopy = copyByAccession[0];
      const books = await db
        .select()
        .from(book)
        .where(eq(book.id, resolvedCopy.bookId))
        .limit(1);
      resolvedBook = books[0] ?? null;
    } else {
      // Try ISBN — find a book, then pick first available copy
      const booksByIsbn = await db
        .select()
        .from(book)
        .where(eq(book.isbn, scanInput))
        .limit(1);

      if (booksByIsbn.length > 0) {
        resolvedBook = booksByIsbn[0];
        const availableCopies = await db
          .select()
          .from(bookCopy)
          .where(
            and(
              eq(bookCopy.bookId, resolvedBook.id),
              eq(bookCopy.status, "AVAILABLE")
            )
          )
          .limit(1);

        if (availableCopies.length > 0) {
          resolvedCopy = availableCopies[0];
        } else {
          return NextResponse.json(
            { success: false, reason: `All copies of "${resolvedBook.title}" are currently issued.` },
            { status: 200 }
          );
        }
      }
    }

    if (!resolvedCopy || !resolvedBook) {
      return NextResponse.json(
        { success: false, reason: "Book not found. Please check the barcode/ISBN and try again." },
        { status: 200 }
      );
    }

    // ── 6. Verify copy is available ───────────────────
    if (resolvedCopy.status !== "AVAILABLE") {
      return NextResponse.json(
        { success: false, reason: `This copy is not available (status: ${resolvedCopy.status}).` },
        { status: 200 }
      );
    }

    // ── 7. Check student doesn't already have this book
    const alreadyIssued = activeIssuances.length > 0
      ? await db
          .select({ id: bookIssuance.id })
          .from(bookIssuance)
          .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
          .where(
            and(
              eq(bookIssuance.childId, studentChild.id),
              eq(bookCopy.bookId, resolvedBook.id),
              inArray(bookIssuance.status, ["ISSUED", "RETURN_PENDING"])
            )
          )
          .limit(1)
      : [];

    if (alreadyIssued.length > 0) {
      return NextResponse.json(
        { success: false, reason: `You already have a copy of "${resolvedBook.title}" issued.` },
        { status: 200 }
      );
    }

    // ── 8. Calculate due date ─────────────────────────
    const issueDurationStr = await getSetting("issue_duration_days");
    const issueDurationDays = parseInt(issueDurationStr, 10) || 7;
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + issueDurationDays);

    // ── 9. Create issuance, update copy & book ────────
    const issuanceId = crypto.randomUUID();

    await db.insert(bookIssuance).values({
      id: issuanceId,
      bookCopyId: resolvedCopy.id,
      childId: studentChild.id,
      issuedAt: now,
      dueDate,
      status: "ISSUED",
      issuedBy: "SELF_SERVICE",
    });

    await db
      .update(bookCopy)
      .set({ status: "ISSUED", updatedAt: now })
      .where(eq(bookCopy.id, resolvedCopy.id));

    await db
      .update(book)
      .set({
        availableCopies: sql`${book.availableCopies} - 1`,
        updatedAt: now,
      })
      .where(eq(book.id, resolvedBook.id));

    // ── 10. Broadcast SSE ─────────────────────────────
    broadcast("library-updated");

    await logAudit({
      userId: studentChild.id,
      userRole: "STUDENT",
      action: AUDIT_ACTIONS.BOOK_ISSUED,
      details: {
        issuanceId,
        bookTitle: resolvedBook.title,
        accessionNumber: resolvedCopy.accessionNumber,
        childName: studentChild.name,
        childId: studentChild.id,
        source: "kiosk",
      },
    });

    return NextResponse.json({
      success: true,
      issuance: {
        id: issuanceId,
        bookTitle: resolvedBook.title,
        bookAuthor: resolvedBook.author,
        accessionNumber: resolvedCopy.accessionNumber,
        issuedAt: now.toISOString(),
        dueDate: dueDate.toISOString(),
        childName: studentChild.name,
        className: studentChild.className,
      },
    });
  } catch (error) {
    console.error("[Library Issue] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
