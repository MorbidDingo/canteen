import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  book,
  bookCopy,
  bookIssuance,
  child,
  libraryAppIssueRequest,
  librarySetting,
  parentControl,
} from "@/lib/db/schema";
import {
  AccessDeniedError,
  requireLinkedAccount,
} from "@/lib/auth-server";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

const ACTIVE_ISSUANCE_STATUSES = ["ISSUED", "OVERDUE", "RETURN_PENDING"] as const;

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await requireLinkedAccount();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const session = access.session;
  const organizationId = access.activeOrganizationId!;
  const now = new Date();

  let body: { childId?: string; bookId?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const childId = body.childId?.trim();
  const bookId = body.bookId?.trim();
  const notes = body.notes?.trim() || null;

  if (!childId || !bookId) {
    return NextResponse.json({ error: "childId and bookId are required" }, { status: 400 });
  }

  const childRows = await db
    .select({ id: child.id, organizationId: child.organizationId })
    .from(child)
    .where(
      and(
        eq(child.id, childId),
        eq(child.parentId, session.user.id),
        or(eq(child.organizationId, organizationId), isNull(child.organizationId)),
      ),
    )
    .limit(1);

  const childRow = childRows[0];
  if (!childRow) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  if (!childRow.organizationId) {
    await db
      .update(child)
      .set({ organizationId, updatedAt: now })
      .where(eq(child.id, childId));
  }

  const pendingScopeCondition =
    session.user.role === "GENERAL"
      ? and(
          eq(libraryAppIssueRequest.organizationId, organizationId),
          eq(libraryAppIssueRequest.parentId, session.user.id),
          eq(libraryAppIssueRequest.status, "REQUESTED"),
        )
      : and(
          eq(libraryAppIssueRequest.organizationId, organizationId),
          eq(libraryAppIssueRequest.childId, childId),
          eq(libraryAppIssueRequest.status, "REQUESTED"),
        );

  await db
    .update(libraryAppIssueRequest)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(
      and(
        pendingScopeCondition,
        sql`${libraryAppIssueRequest.expiresAt} <= ${now}`,
      ),
    );

  const [bookRows, controlRows, settingRows, activeIssueCountRows, overdueRows, activePendingRows, activeSameBookRows] = await Promise.all([
    db
      .select({
        id: book.id,
        title: book.title,
        author: book.author,
        category: book.category,
        availableCopies: book.availableCopies,
      })
      .from(book)
      .where(and(eq(book.id, bookId), eq(book.organizationId, organizationId)))
      .limit(1),
    db
      .select({
        blockedBookCategories: parentControl.blockedBookCategories,
        blockedBookAuthors: parentControl.blockedBookAuthors,
        blockedBookIds: parentControl.blockedBookIds,
      })
      .from(parentControl)
      .where(eq(parentControl.childId, childId))
      .limit(1),
    db
      .select({ value: librarySetting.value })
      .from(librarySetting)
      .where(
        and(
          eq(librarySetting.organizationId, organizationId),
          eq(librarySetting.key, "max_books_per_student"),
        ),
      )
      .limit(1),
    db
      .select({ count: sql<number>`count(*)` })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .where(
        and(
          eq(bookIssuance.childId, childId),
          eq(bookCopy.organizationId, organizationId),
          inArray(bookIssuance.status, [...ACTIVE_ISSUANCE_STATUSES]),
        ),
      ),
    db
      .select({ id: bookIssuance.id })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .where(
        and(
          eq(bookIssuance.childId, childId),
          eq(bookCopy.organizationId, organizationId),
          or(
            eq(bookIssuance.status, "OVERDUE"),
            and(eq(bookIssuance.status, "ISSUED"), sql`${bookIssuance.dueDate} < ${now}`),
          ),
        ),
      )
      .limit(1),
    db
      .select({
        id: libraryAppIssueRequest.id,
        childId: libraryAppIssueRequest.childId,
        bookId: libraryAppIssueRequest.bookId,
        status: libraryAppIssueRequest.status,
        expiresAt: libraryAppIssueRequest.expiresAt,
      })
      .from(libraryAppIssueRequest)
      .where(
        and(
          pendingScopeCondition,
          sql`${libraryAppIssueRequest.expiresAt} > ${now}`,
        ),
      )
      .orderBy(desc(libraryAppIssueRequest.createdAt))
      .limit(1),
    db
      .select({ id: bookIssuance.id })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .where(
        and(
          eq(bookIssuance.childId, childId),
          eq(bookCopy.bookId, bookId),
          eq(bookCopy.organizationId, organizationId),
          inArray(bookIssuance.status, [...ACTIVE_ISSUANCE_STATUSES]),
        ),
      )
      .limit(1),
  ]);

  const selectedBook = bookRows[0];
  if (!selectedBook) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const control = controlRows[0];
  const blockedBookIds = new Set(parseJsonArray(control?.blockedBookIds ?? null));
  const blockedBookCategories = new Set(parseJsonArray(control?.blockedBookCategories ?? null));
  const blockedBookAuthors = new Set(
    parseJsonArray(control?.blockedBookAuthors ?? null).map((item) => item.trim().toLowerCase()),
  );

  if (
    blockedBookIds.has(selectedBook.id) ||
    blockedBookCategories.has(selectedBook.category) ||
    blockedBookAuthors.has(selectedBook.author.trim().toLowerCase())
  ) {
    return NextResponse.json(
      { error: "This book is blocked by parent controls for this child" },
      { status: 403 },
    );
  }

  if (activeSameBookRows[0]) {
    return NextResponse.json(
      { error: "This child already has an active issuance for this book" },
      { status: 409 },
    );
  }

  const activePending = activePendingRows[0];
  if (activePending && activePending.bookId === bookId) {
    return NextResponse.json({
      success: true,
      alreadyPending: true,
      request: {
        id: activePending.id,
        status: activePending.status,
        expiresAt: activePending.expiresAt,
      },
    });
  }

  if (activePending) {
    return NextResponse.json(
      {
        error:
          session.user.role === "GENERAL"
            ? "Only one active issue request is allowed at a time for this account. Cancel the existing request first."
            : "Only one active issue request is allowed per child at a time. Cancel the existing request first.",
        existingRequest: {
          id: activePending.id,
          childId: activePending.childId,
          bookId: activePending.bookId,
          expiresAt: activePending.expiresAt,
        },
      },
      { status: 409 },
    );
  }

  if (selectedBook.availableCopies <= 0) {
    return NextResponse.json(
      { error: "No copies available. Try another title or check again later." },
      { status: 409 },
    );
  }

  if (overdueRows[0]) {
    return NextResponse.json(
      { error: "This child has overdue books. Clear overdue first." },
      { status: 409 },
    );
  }

  const maxBooksPerStudent = parseInt(settingRows[0]?.value ?? "3", 10) || 3;
  const activeIssueCount = Number(activeIssueCountRows[0]?.count ?? 0);
  if (activeIssueCount >= maxBooksPerStudent) {
    return NextResponse.json(
      {
        error: `Issue limit reached. Maximum ${maxBooksPerStudent} active books allowed.`,
      },
      { status: 409 },
    );
  }

  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const insertedRows = await db
    .insert(libraryAppIssueRequest)
    .values({
      organizationId,
      parentId: session.user.id,
      childId,
      bookId,
      status: "REQUESTED",
      expiresAt,
      notes,
    })
    .returning({
      id: libraryAppIssueRequest.id,
      status: libraryAppIssueRequest.status,
      requestedAt: libraryAppIssueRequest.createdAt,
      expiresAt: libraryAppIssueRequest.expiresAt,
    });

  const created = insertedRows[0];

  return NextResponse.json({
    success: true,
    request: created,
    book: {
      id: selectedBook.id,
      title: selectedBook.title,
      author: selectedBook.author,
      category: selectedBook.category,
    },
    kioskInstruction:
      "Go to library kiosk, tap student card, and librarian confirms this pending request to issue.",
  });
}

export async function DELETE(request: NextRequest) {
  let access;
  try {
    access = await requireLinkedAccount();
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }

  const session = access.session;
  const organizationId = access.activeOrganizationId!;
  const now = new Date();

  const requestIdFromQuery = request.nextUrl.searchParams.get("requestId")?.trim();
  let requestId = requestIdFromQuery ?? "";

  if (!requestId) {
    try {
      const body = (await request.json()) as { requestId?: string };
      requestId = body.requestId?.trim() ?? "";
    } catch {
      requestId = "";
    }
  }

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }

  const requestRows = await db
    .select({
      id: libraryAppIssueRequest.id,
      status: libraryAppIssueRequest.status,
      expiresAt: libraryAppIssueRequest.expiresAt,
      childId: libraryAppIssueRequest.childId,
      bookId: libraryAppIssueRequest.bookId,
    })
    .from(libraryAppIssueRequest)
    .where(
      and(
        eq(libraryAppIssueRequest.id, requestId),
        eq(libraryAppIssueRequest.organizationId, organizationId),
        eq(libraryAppIssueRequest.parentId, session.user.id),
      ),
    )
    .limit(1);

  const existing = requestRows[0];
  if (!existing) {
    return NextResponse.json({ error: "Issue request not found" }, { status: 404 });
  }

  if (existing.status !== "REQUESTED") {
    return NextResponse.json(
      { error: `Only pending requests can be cancelled (current status: ${existing.status})` },
      { status: 409 },
    );
  }

  const nextStatus = existing.expiresAt <= now ? "EXPIRED" : "CANCELLED";
  await db
    .update(libraryAppIssueRequest)
    .set({ status: nextStatus, updatedAt: now })
    .where(eq(libraryAppIssueRequest.id, existing.id));

  return NextResponse.json({
    success: true,
    requestId: existing.id,
    status: nextStatus,
  });
}
