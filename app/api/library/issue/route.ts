import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  child,
  book,
  bookCopy,
  bookIssuance,
  librarySetting,
  parentControl,
  libraryAppIssueRequest,
} from "@/lib/db/schema";
import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { broadcast } from "@/lib/sse";
import { LIBRARY_SETTINGS_DEFAULTS } from "@/lib/constants";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { notifyParentForChild } from "@/lib/parent-notifications";
import { resolveChildByRfid } from "@/lib/rfid-access";
import { resolveOrganizationDeviceFromRequest, touchOrganizationDevice } from "@/lib/device-context";

async function getSetting(key: string, organizationId: string): Promise<string> {
  const rows = await db
    .select({ value: librarySetting.value })
    .from(librarySetting)
    .where(and(eq(librarySetting.key, key), eq(librarySetting.organizationId, organizationId)))
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
    const requestOrgId =
      request.headers.get("x-organization-id")?.trim() ||
      request.headers.get("x-org-id")?.trim() ||
      request.cookies.get("activeOrganizationId")?.value?.trim() ||
      null;

    if (!requestOrgId) {
      return NextResponse.json({ success: false, reason: "Organization context is required" }, { status: 400 });
    }

    const body = await request.json();
    const { rfidCardId, scanInput, preIssueAccepted, deviceCode, appIssueRequestId } = body as {
      rfidCardId: string;
      scanInput?: string;
      preIssueAccepted?: boolean;
      deviceCode?: string;
      appIssueRequestId?: string;
    };

    const resolvedDevice = await resolveOrganizationDeviceFromRequest({
      request,
      organizationId: requestOrgId,
      allowedDeviceTypes: ["LIBRARY"],
      fallbackDeviceCode: deviceCode,
    });

    if (resolvedDevice) {
      await touchOrganizationDevice(resolvedDevice.id, request);
    }

    // ── Basic validation ──────────────────────────────
    if (!rfidCardId || (!scanInput && !preIssueAccepted && !appIssueRequestId)) {
      return NextResponse.json(
        { success: false, reason: "Missing RFID card or book scan input" },
        { status: 400 }
      );
    }

    // ── 1. Check self-service is allowed ──────────────
    const allowSelfService = await getSetting("allow_self_service_issue", requestOrgId);
    if (allowSelfService === "false") {
      return NextResponse.json(
        { success: false, reason: "Self-service issue is disabled. Please visit the library desk." },
        { status: 200 }
      );
    }

    // ── 2. Look up child by RFID ─────────────────────
    const resolved = await resolveChildByRfid(rfidCardId, requestOrgId);
    if (!resolved) {
      return NextResponse.json(
        { success: false, reason: "Unknown card. Please ask the school office to register your card." },
        { status: 200 }
      );
    }

    const children = await db
      .select()
      .from(child)
      .where(and(eq(child.id, resolved.child.id), eq(child.organizationId, requestOrgId)))
      .limit(1);

    if (children.length === 0) {
      return NextResponse.json(
        { success: false, reason: "Unknown card. Please ask the school office to register your card." },
        { status: 200 }
      );
    }

    const studentChild = children[0];
    const now = new Date();

    await db
      .update(libraryAppIssueRequest)
      .set({
        status: "EXPIRED",
        updatedAt: now,
      })
      .where(
        and(
          eq(libraryAppIssueRequest.organizationId, requestOrgId),
          eq(libraryAppIssueRequest.childId, studentChild.id),
          eq(libraryAppIssueRequest.status, "REQUESTED"),
          sql`${libraryAppIssueRequest.expiresAt} <= ${now}`
        )
      );

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
    const maxBooksStr = await getSetting("max_books_per_student", requestOrgId);
    const maxBooks = parseInt(maxBooksStr, 10) || 3;

    const activeIssuances = await db
      .select({ id: bookIssuance.id, dueDate: bookIssuance.dueDate, status: bookIssuance.status })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .where(
        and(
          eq(bookIssuance.childId, studentChild.id),
          eq(bookCopy.organizationId, requestOrgId),
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
    const blockIfOverdue = await getSetting("block_issue_if_overdue", requestOrgId);
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
    let confirmedAppIssueRequestId: string | null = null;

    if (appIssueRequestId) {
      const requestRows = await db
        .select({
          id: libraryAppIssueRequest.id,
          bookId: libraryAppIssueRequest.bookId,
        })
        .from(libraryAppIssueRequest)
        .where(
          and(
            eq(libraryAppIssueRequest.id, appIssueRequestId),
            eq(libraryAppIssueRequest.organizationId, requestOrgId),
            eq(libraryAppIssueRequest.childId, studentChild.id),
            eq(libraryAppIssueRequest.status, "REQUESTED"),
            sql`${libraryAppIssueRequest.expiresAt} > ${now}`
          )
        )
        .limit(1);

      const activeRequest = requestRows[0];
      if (!activeRequest) {
        return NextResponse.json(
          { success: false, reason: "Pending app issue request not found or expired." },
          { status: 200 }
        );
      }

      confirmedAppIssueRequestId = activeRequest.id;

      const books = await db
        .select()
        .from(book)
        .where(and(eq(book.id, activeRequest.bookId), eq(book.organizationId, requestOrgId)))
        .limit(1);

      resolvedBook = books[0] ?? null;
      if (!resolvedBook) {
        return NextResponse.json(
          { success: false, reason: "Requested app book is no longer available." },
          { status: 200 }
        );
      }

      const availableCopies = await db
        .select()
        .from(bookCopy)
        .where(
          and(
            eq(bookCopy.bookId, resolvedBook.id),
            eq(bookCopy.organizationId, requestOrgId),
            eq(bookCopy.status, "AVAILABLE")
          )
        )
        .limit(1);

      if (availableCopies.length === 0) {
        return NextResponse.json(
          {
            success: false,
            reason: `All copies of "${resolvedBook.title}" are currently issued.`,
          },
          { status: 200 }
        );
      }

      resolvedCopy = availableCopies[0];
    }

    if (activePreIssueBookId && !preIssueAccepted && scanInput) {
      const preIssueBookRows = await db
        .select({ title: book.title })
        .from(book)
        .where(and(eq(book.id, activePreIssueBookId), eq(book.organizationId, requestOrgId)))
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
        .where(and(eq(book.id, activePreIssueBookId), eq(book.organizationId, requestOrgId)))
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
          and(
            eq(bookCopy.bookId, resolvedBook.id),
            eq(bookCopy.organizationId, requestOrgId),
            eq(bookCopy.status, "AVAILABLE")
          )
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
        .where(and(eq(bookCopy.accessionNumber, scanInput ?? ""), eq(bookCopy.organizationId, requestOrgId)))
        .limit(1);

      if (copyByAccession.length > 0) {
        resolvedCopy = copyByAccession[0];
        const books = await db
          .select()
          .from(book)
          .where(and(eq(book.id, resolvedCopy.bookId), eq(book.organizationId, requestOrgId)))
          .limit(1);
        resolvedBook = books[0] ?? null;
      }

      if (!resolvedBook || !resolvedCopy) {
        // Try ISBN — find a book, then pick first available copy
        const booksByIsbn = await db
          .select()
          .from(book)
          .where(and(eq(book.isbn, scanInput ?? ""), eq(book.organizationId, requestOrgId)))
          .limit(1);

        if (booksByIsbn.length > 0) {
          resolvedBook = booksByIsbn[0];
          const availableCopies = await db
            .select()
            .from(bookCopy)
            .where(
              and(
                eq(bookCopy.bookId, resolvedBook.id),
                eq(bookCopy.organizationId, requestOrgId),
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
              eq(bookCopy.organizationId, requestOrgId),
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
    const issueDurationStr = await getSetting("issue_duration_days", requestOrgId);
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
      deviceId: resolvedDevice?.id ?? null,
      issuedBy: "SELF_SERVICE",
    });

    await db
      .update(bookCopy)
      .set({ status: "ISSUED", updatedAt: now })
      .where(and(eq(bookCopy.id, resolvedCopy.id), eq(bookCopy.organizationId, requestOrgId)));

    await db
      .update(book)
      .set({
        availableCopies: sql`${book.availableCopies} - 1`,
        updatedAt: now,
      })
      .where(and(eq(book.id, resolvedBook.id), eq(book.organizationId, requestOrgId)));

    let finalizedAppIssueRequestId: string | null = confirmedAppIssueRequestId;
    if (!finalizedAppIssueRequestId) {
      const matchingPendingRows = await db
        .select({ id: libraryAppIssueRequest.id })
        .from(libraryAppIssueRequest)
        .where(
          and(
            eq(libraryAppIssueRequest.organizationId, requestOrgId),
            eq(libraryAppIssueRequest.childId, studentChild.id),
            eq(libraryAppIssueRequest.bookId, resolvedBook.id),
            eq(libraryAppIssueRequest.status, "REQUESTED"),
            sql`${libraryAppIssueRequest.expiresAt} > ${now}`
          )
        )
        .orderBy(desc(libraryAppIssueRequest.createdAt))
        .limit(1);

      finalizedAppIssueRequestId = matchingPendingRows[0]?.id ?? null;
    }

    if (finalizedAppIssueRequestId) {
      await db
        .update(libraryAppIssueRequest)
        .set({
          status: "CONFIRMED",
          confirmedAt: now,
          issuanceId,
          confirmedDeviceId: resolvedDevice?.id ?? null,
          updatedAt: now,
        })
        .where(eq(libraryAppIssueRequest.id, finalizedAppIssueRequestId));
    }

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
        appIssueRequestId: finalizedAppIssueRequestId,
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
        appIssueRequestId: finalizedAppIssueRequestId,
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
        appIssueRequestId: finalizedAppIssueRequestId,
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
