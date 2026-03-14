import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  child,
  book,
  bookCopy,
  bookIssuance,
  librarySetting,
  parentControl,
} from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { broadcast } from "@/lib/sse";
import { LIBRARY_SETTINGS_DEFAULTS } from "@/lib/constants";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { notifyParentForChild } from "@/lib/parent-notifications";

async function getSetting(key: string): Promise<string> {
  const rows = await db
    .select({ value: librarySetting.value })
    .from(librarySetting)
    .where(eq(librarySetting.key, key))
    .limit(1);
  return rows[0]?.value ?? LIBRARY_SETTINGS_DEFAULTS[key] ?? "";
}

function safeParseJSON(val: string | null): string[] {
  if (!val) return [];
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}

// POST /api/library/issue — issue a book copy to a child (RFID + accession#/ISBN)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rfidCardId, scanInput, preIssueAccepted } = body as {
      rfidCardId: string;
      scanInput?: string;
      preIssueAccepted?: boolean;
    };

    // ── Basic validation ──────────────────────────────
    if (!rfidCardId || (!scanInput && !preIssueAccepted)) {
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
    const now = new Date();

    const controlRows = await db
      .select({
        blockedBookCategories: parentControl.blockedBookCategories,
        blockedBookAuthors: parentControl.blockedBookAuthors,
        blockedBookIds: parentControl.blockedBookIds,
        preIssueBookId: parentControl.preIssueBookId,
        preIssueExpiresAt: parentControl.preIssueExpiresAt,
        preIssueDeclinedUntil: parentControl.preIssueDeclinedUntil,
      })
      .from(parentControl)
      .where(eq(parentControl.childId, studentChild.id))
      .limit(1);

    const control = controlRows[0] ?? null;

    if (control?.preIssueDeclinedUntil && new Date(control.preIssueDeclinedUntil) > now) {
      return NextResponse.json(
        {
          success: false,
          reason:
            "You cannot issue a book right now. Please try again after 12 hours.",
          blockedUntil: control.preIssueDeclinedUntil,
        },
        { status: 200 }
      );
    }

    let activePreIssueBookId: string | null = null;
    if (control?.preIssueBookId && control.preIssueExpiresAt) {
      if (new Date(control.preIssueExpiresAt) > now) {
        activePreIssueBookId = control.preIssueBookId;
      } else {
        await db
          .update(parentControl)
          .set({ preIssueBookId: null, preIssueExpiresAt: null, updatedAt: now })
          .where(eq(parentControl.childId, studentChild.id));
      }
    }

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

    if (activePreIssueBookId && !preIssueAccepted && scanInput) {
      const preIssueBookRows = await db
        .select({ title: book.title })
        .from(book)
        .where(eq(book.id, activePreIssueBookId))
        .limit(1);

      const preIssueTitle = preIssueBookRows[0]?.title ?? "requested book";
      return NextResponse.json(
        {
          success: false,
          reason: `Parent requested pre-issue for \"${preIssueTitle}\". Please respond to that first.`,
        },
        { status: 200 }
      );
    }

    if (activePreIssueBookId && preIssueAccepted) {
      const books = await db
        .select()
        .from(book)
        .where(eq(book.id, activePreIssueBookId))
        .limit(1);
      resolvedBook = books[0] ?? null;

      if (!resolvedBook) {
        return NextResponse.json(
          { success: false, reason: "Requested pre-issue book is no longer available." },
          { status: 200 }
        );
      }

      const availableCopies = await db
        .select()
        .from(bookCopy)
        .where(
          and(eq(bookCopy.bookId, resolvedBook.id), eq(bookCopy.status, "AVAILABLE"))
        )
        .limit(1);

      if (availableCopies.length === 0) {
        return NextResponse.json(
          {
            success: false,
            reason: `All copies of \"${resolvedBook.title}\" are currently issued.`,
          },
          { status: 200 }
        );
      }

      resolvedCopy = availableCopies[0];
    }

    if (!resolvedBook || !resolvedCopy) {
      // Try accession number (exact match)
      const copyByAccession = await db
        .select()
        .from(bookCopy)
        .where(eq(bookCopy.accessionNumber, scanInput ?? ""))
        .limit(1);

      if (copyByAccession.length > 0) {
        resolvedCopy = copyByAccession[0];
        const books = await db
          .select()
          .from(book)
          .where(eq(book.id, resolvedCopy.bookId))
          .limit(1);
        resolvedBook = books[0] ?? null;
      }

      if (!resolvedBook || !resolvedCopy) {
        // Try ISBN — find a book, then pick first available copy
        const booksByIsbn = await db
          .select()
          .from(book)
          .where(eq(book.isbn, scanInput ?? ""))
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
    }

    if (!resolvedCopy || !resolvedBook) {
      return NextResponse.json(
        { success: false, reason: "Book not found. Please check the barcode/ISBN and try again." },
        { status: 200 }
      );
    }

    const blockedBookCategories = safeParseJSON(control?.blockedBookCategories ?? null);
    const blockedBookAuthors = safeParseJSON(control?.blockedBookAuthors ?? null).map((a) =>
      a.trim().toLowerCase()
    );
    const blockedBookIds = safeParseJSON(control?.blockedBookIds ?? null);

    if (blockedBookIds.includes(resolvedBook.id)) {
      const reason = `Blocked book attempt: ${resolvedBook.title} is blocked by parent controls.`;
      await notifyParentForChild({
        childId: studentChild.id,
        type: "BLOCKED_BOOK_ATTEMPT",
        title: `${studentChild.name} had a blocked book attempt`,
        message: reason,
        metadata: {
          bookId: resolvedBook.id,
          title: resolvedBook.title,
          author: resolvedBook.author,
          category: resolvedBook.category,
        },
      });
      return NextResponse.json(
        { success: false, reason },
        { status: 200 }
      );
    }

    if (blockedBookCategories.includes(resolvedBook.category)) {
      const reason = `Blocked book attempt: ${resolvedBook.title} category (${resolvedBook.category}) is blocked by parent controls.`;
      await notifyParentForChild({
        childId: studentChild.id,
        type: "BLOCKED_BOOK_ATTEMPT",
        title: `${studentChild.name} had a blocked book attempt`,
        message: reason,
        metadata: {
          bookId: resolvedBook.id,
          title: resolvedBook.title,
          author: resolvedBook.author,
          category: resolvedBook.category,
        },
      });
      return NextResponse.json(
        { success: false, reason },
        { status: 200 }
      );
    }

    if (blockedBookAuthors.includes((resolvedBook.author || "").trim().toLowerCase())) {
      const reason = `Blocked book attempt: ${resolvedBook.title} by ${resolvedBook.author} is blocked by parent controls.`;
      await notifyParentForChild({
        childId: studentChild.id,
        type: "BLOCKED_BOOK_ATTEMPT",
        title: `${studentChild.name} had a blocked book attempt`,
        message: reason,
        metadata: {
          bookId: resolvedBook.id,
          title: resolvedBook.title,
          author: resolvedBook.author,
          category: resolvedBook.category,
        },
      });
      return NextResponse.json(
        { success: false, reason },
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

    if (activePreIssueBookId && resolvedBook.id === activePreIssueBookId) {
      await db
        .update(parentControl)
        .set({
          preIssueBookId: null,
          preIssueExpiresAt: null,
          preIssueDeclinedUntil: null,
          updatedAt: now,
        })
        .where(eq(parentControl.childId, studentChild.id));
    }

    // ── 10. Broadcast SSE ─────────────────────────────
    broadcast("library-updated");

    await notifyParentForChild({
      childId: studentChild.id,
      type: "LIBRARY_ISSUE",
      title: `${studentChild.name} issued a library book`,
      message: `Issued: ${resolvedBook.title} (${resolvedCopy.accessionNumber}).`,
      metadata: {
        issuanceId,
        bookId: resolvedBook.id,
        bookTitle: resolvedBook.title,
        bookAuthor: resolvedBook.author,
        accessionNumber: resolvedCopy.accessionNumber,
        dueDate: dueDate.toISOString(),
      },
    });

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
