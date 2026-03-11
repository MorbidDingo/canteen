import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  child,
  book,
  bookCopy,
  bookIssuance,
  librarySetting,
} from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
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

// POST /api/lib-operator/issue — operator-initiated book issue
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "LIB_OPERATOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { rfidCardId, scanInput } = body as {
      rfidCardId: string;
      scanInput: string;
    };

    if (!rfidCardId || !scanInput) {
      return NextResponse.json(
        { success: false, reason: "Missing RFID card or book scan input" },
        { status: 400 }
      );
    }

    // ── 1. Look up child by RFID ─────────────────────
    const children = await db
      .select()
      .from(child)
      .where(eq(child.rfidCardId, rfidCardId))
      .limit(1);

    if (children.length === 0) {
      return NextResponse.json(
        { success: false, reason: "Unknown card." },
        { status: 200 }
      );
    }

    const studentChild = children[0];

    // ── 2. Check max books per student ────────────────
    const maxBooks = parseInt(await getSetting("max_books_per_student"), 10) || 3;

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
        { success: false, reason: `Student already has ${activeIssuances.length} books (max ${maxBooks}).` },
        { status: 200 }
      );
    }

    // ── 3. Check overdue ─────────────────────────────
    const blockIfOverdue = await getSetting("block_issue_if_overdue");
    if (blockIfOverdue === "true") {
      const now = new Date();
      const hasOverdue = activeIssuances.some(
        (i) => i.status === "ISSUED" && new Date(i.dueDate) < now
      );
      if (hasOverdue) {
        return NextResponse.json(
          { success: false, reason: "Student has overdue books. They must be returned first." },
          { status: 200 }
        );
      }
    }

    // ── 4. Resolve book copy ─────────────────────────
    let resolvedCopy: typeof bookCopy.$inferSelect | null = null;
    let resolvedBook: typeof book.$inferSelect | null = null;

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
        { success: false, reason: "Book not found." },
        { status: 200 }
      );
    }

    if (resolvedCopy.status !== "AVAILABLE") {
      return NextResponse.json(
        { success: false, reason: `Copy is not available (status: ${resolvedCopy.status}).` },
        { status: 200 }
      );
    }

    // ── 5. Check duplicate ───────────────────────────
    if (activeIssuances.length > 0) {
      const alreadyIssued = await db
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
        .limit(1);

      if (alreadyIssued.length > 0) {
        return NextResponse.json(
          { success: false, reason: `Student already has a copy of "${resolvedBook.title}".` },
          { status: 200 }
        );
      }
    }

    // ── 6. Create issuance ───────────────────────────
    const issueDurationDays = parseInt(await getSetting("issue_duration_days"), 10) || 7;
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + issueDurationDays);

    const issuanceId = crypto.randomUUID();

    await db.insert(bookIssuance).values({
      id: issuanceId,
      bookCopyId: resolvedCopy.id,
      childId: studentChild.id,
      issuedAt: now,
      dueDate,
      status: "ISSUED",
      issuedBy: session.user.id,
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

    broadcast("library-updated");

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.BOOK_ISSUED,
      details: {
        issuanceId,
        bookTitle: resolvedBook.title,
        accessionNumber: resolvedCopy.accessionNumber,
        childName: studentChild.name,
        childId: studentChild.id,
        source: "operator",
      },
      request,
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
    console.error("[Lib Operator Issue] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
