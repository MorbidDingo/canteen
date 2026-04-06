import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  child,
  book,
  bookCopy,
  bookIssuance,
  librarySetting,
  libraryAppIssueRequest,
} from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";
import { LIBRARY_SETTINGS_DEFAULTS } from "@/lib/constants";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { resolveChildByRfid } from "@/lib/rfid-access";

const ACTIVE_ISSUANCE_STATUSES = ["ISSUED", "OVERDUE", "RETURN_PENDING"] as const;

async function getSetting(key: string, organizationId: string): Promise<string> {
  const rows = await db
    .select({ value: librarySetting.value })
    .from(librarySetting)
    .where(and(eq(librarySetting.key, key), eq(librarySetting.organizationId, organizationId)))
    .limit(1);
  return rows[0]?.value ?? LIBRARY_SETTINGS_DEFAULTS[key] ?? "";
}

// POST /api/lib-operator/issue - operator-initiated book issue
export async function POST(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "LIB_OPERATOR"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Library control endpoints are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  try {
    const organizationId = access.activeOrganizationId!;
    const body = await request.json();
    const { rfidCardId, scanInput } = body as {
      rfidCardId: string;
      scanInput: string;
    };

    if (!rfidCardId || !scanInput) {
      return NextResponse.json(
        { success: false, reason: "Missing RFID card or book scan input" },
        { status: 400 },
      );
    }

    // 1. Resolve child by RFID in this organization
    const resolved = await resolveChildByRfid(rfidCardId, organizationId);
    if (!resolved) {
      return NextResponse.json(
        { success: false, reason: "Unknown card." },
        { status: 200 },
      );
    }

    const [studentChild] = await db
      .select()
      .from(child)
      .where(and(eq(child.id, resolved.child.id), eq(child.organizationId, organizationId)))
      .limit(1);

    if (!studentChild) {
      return NextResponse.json(
        { success: false, reason: "Unknown card." },
        { status: 200 },
      );
    }

    // 2. Check max books per student
    const maxBooks = parseInt(await getSetting("max_books_per_student", organizationId), 10) || 3;

    const activeIssuances = await db
      .select({ id: bookIssuance.id, dueDate: bookIssuance.dueDate, status: bookIssuance.status })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .where(
        and(
          eq(bookIssuance.childId, studentChild.id),
          eq(bookCopy.organizationId, organizationId),
          inArray(bookIssuance.status, [...ACTIVE_ISSUANCE_STATUSES]),
        ),
      );

    if (activeIssuances.length >= maxBooks) {
      return NextResponse.json(
        { success: false, reason: `Student already has ${activeIssuances.length} books (max ${maxBooks}).` },
        { status: 200 },
      );
    }

    // 3. Check overdue
    const blockIfOverdue = await getSetting("block_issue_if_overdue", organizationId);
    if (blockIfOverdue === "true") {
      const now = new Date();
      const hasOverdue = activeIssuances.some(
        (i) => i.status === "OVERDUE" || (i.status === "ISSUED" && new Date(i.dueDate) < now),
      );
      if (hasOverdue) {
        return NextResponse.json(
          { success: false, reason: "Student has overdue books. They must be returned first." },
          { status: 200 },
        );
      }
    }

    // 4. Resolve book copy
    let resolvedCopy: typeof bookCopy.$inferSelect | null = null;
    let resolvedBook: typeof book.$inferSelect | null = null;

    const copyByAccession = await db
      .select()
      .from(bookCopy)
      .where(and(eq(bookCopy.accessionNumber, scanInput), eq(bookCopy.organizationId, organizationId)))
      .limit(1);

    if (copyByAccession.length > 0) {
      resolvedCopy = copyByAccession[0];
      const books = await db
        .select()
        .from(book)
        .where(and(eq(book.id, resolvedCopy.bookId), eq(book.organizationId, organizationId)))
        .limit(1);
      resolvedBook = books[0] ?? null;
    } else {
      const booksByIsbn = await db
        .select()
        .from(book)
        .where(and(eq(book.isbn, scanInput), eq(book.organizationId, organizationId)))
        .limit(1);

      if (booksByIsbn.length > 0) {
        resolvedBook = booksByIsbn[0];
        const availableCopies = await db
          .select()
          .from(bookCopy)
          .where(
            and(
              eq(bookCopy.bookId, resolvedBook.id),
              eq(bookCopy.organizationId, organizationId),
              eq(bookCopy.status, "AVAILABLE"),
            ),
          )
          .limit(1);

        if (availableCopies.length > 0) {
          resolvedCopy = availableCopies[0];
        } else {
          return NextResponse.json(
            { success: false, reason: `All copies of "${resolvedBook.title}" are currently issued.` },
            { status: 200 },
          );
        }
      }
    }

    if (!resolvedCopy || !resolvedBook) {
      return NextResponse.json(
        { success: false, reason: "Book not found." },
        { status: 200 },
      );
    }

    if (resolvedCopy.status !== "AVAILABLE") {
      return NextResponse.json(
        { success: false, reason: `Copy is not available (status: ${resolvedCopy.status}).` },
        { status: 200 },
      );
    }

    // 5. Check duplicate active issuance of same book for this child
    if (activeIssuances.length > 0) {
      const alreadyIssued = await db
        .select({ id: bookIssuance.id })
        .from(bookIssuance)
        .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
        .where(
          and(
            eq(bookIssuance.childId, studentChild.id),
            eq(bookCopy.bookId, resolvedBook.id),
            eq(bookCopy.organizationId, organizationId),
            inArray(bookIssuance.status, [...ACTIVE_ISSUANCE_STATUSES]),
          ),
        )
        .limit(1);

      if (alreadyIssued.length > 0) {
        return NextResponse.json(
          { success: false, reason: `Student already has a copy of "${resolvedBook.title}".` },
          { status: 200 },
        );
      }
    }

    // 6. Create issuance
    const issueDurationDays = parseInt(await getSetting("issue_duration_days", organizationId), 10) || 7;
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + issueDurationDays);

    const issuanceId = crypto.randomUUID();

    // Check for a pending app request for this child+book.
    // If one exists, availableCopies was already decremented at request time, so skip decrement here.
    const pendingRequestRows = await db
      .select({ id: libraryAppIssueRequest.id })
      .from(libraryAppIssueRequest)
      .where(
        and(
          eq(libraryAppIssueRequest.organizationId, organizationId),
          eq(libraryAppIssueRequest.childId, studentChild.id),
          eq(libraryAppIssueRequest.bookId, resolvedBook!.id),
          eq(libraryAppIssueRequest.status, "REQUESTED"),
          sql`${libraryAppIssueRequest.expiresAt} > ${now}`
        )
      )
      .limit(1);
    const pendingAppRequestId = pendingRequestRows[0]?.id ?? null;

    try {
      await db.transaction(async (tx) => {
        const inTxnActive = await tx
          .select({ id: bookIssuance.id })
          .from(bookIssuance)
          .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
          .where(
            and(
              eq(bookIssuance.childId, studentChild.id),
              eq(bookCopy.organizationId, organizationId),
              inArray(bookIssuance.status, [...ACTIVE_ISSUANCE_STATUSES]),
            ),
          );

        if (inTxnActive.length >= maxBooks) {
          throw new Error("ISSUE_LIMIT_REACHED");
        }

        const alreadyIssuedSameBook = await tx
          .select({ id: bookIssuance.id })
          .from(bookIssuance)
          .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
          .where(
            and(
              eq(bookIssuance.childId, studentChild.id),
              eq(bookCopy.bookId, resolvedBook.id),
              eq(bookCopy.organizationId, organizationId),
              inArray(bookIssuance.status, [...ACTIVE_ISSUANCE_STATUSES]),
            ),
          )
          .limit(1);

        if (alreadyIssuedSameBook.length > 0) {
          throw new Error("DUPLICATE_BOOK");
        }

        const [copyUpdate] = await tx
          .update(bookCopy)
          .set({ status: "ISSUED", updatedAt: now })
          .where(
            and(
              eq(bookCopy.id, resolvedCopy!.id),
              eq(bookCopy.organizationId, organizationId),
              eq(bookCopy.status, "AVAILABLE"),
            ),
          )
          .returning({ id: bookCopy.id });

        if (!copyUpdate) {
          throw new Error("COPY_NOT_AVAILABLE");
        }

        await tx.insert(bookIssuance).values({
          id: issuanceId,
          bookCopyId: resolvedCopy!.id,
          childId: studentChild.id,
          issuedAt: now,
          dueDate,
          status: "ISSUED",
          issuedBy: access.actorUserId,
        });

        if (!pendingAppRequestId) {
          await tx
            .update(book)
            .set({
              availableCopies: sql`GREATEST(${book.availableCopies} - 1, 0)`,
              updatedAt: now,
            })
            .where(and(eq(book.id, resolvedBook!.id), eq(book.organizationId, organizationId)));
        }
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "ISSUE_LIMIT_REACHED") {
          return NextResponse.json(
            { success: false, reason: `Student already reached max allowed books (${maxBooks}).` },
            { status: 200 },
          );
        }

        if (error.message === "DUPLICATE_BOOK") {
          return NextResponse.json(
            { success: false, reason: `Student already has a copy of "${resolvedBook.title}".` },
            { status: 200 },
          );
        }

        if (error.message === "COPY_NOT_AVAILABLE") {
          return NextResponse.json(
            { success: false, reason: "This copy was just issued by another transaction. Try again." },
            { status: 409 },
          );
        }
      }
      throw error;
    }

    broadcast("library-updated");

    if (pendingAppRequestId) {
      await db
        .update(libraryAppIssueRequest)
        .set({
          status: "CONFIRMED",
          confirmedAt: now,
          issuanceId,
          updatedAt: now,
        })
        .where(eq(libraryAppIssueRequest.id, pendingAppRequestId));
    }

    notifyParentForChild({
      childId: studentChild.id,
      type: "LIBRARY_ISSUE",
      title: "Book issued",
      message: `"${resolvedBook.title}" (${resolvedCopy.accessionNumber}) has been issued to ${studentChild.name}. Due: ${dueDate.toLocaleDateString()}.`,
      metadata: {
        issuanceId,
        bookTitle: resolvedBook.title,
        author: resolvedBook.author,
        accessionNumber: resolvedCopy.accessionNumber,
        dueDate: dueDate.toISOString(),
      },
    }).catch(() => {});

    await logAudit({
      organizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole || "LIB_OPERATOR",
      action: AUDIT_ACTIONS.BOOK_ISSUED,
      details: {
        organizationId,
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
      { status: 500 },
    );
  }
}
