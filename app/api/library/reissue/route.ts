import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  child,
  book,
  bookCopy,
  bookIssuance,
  librarySetting,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { broadcast } from "@/lib/sse";
import { LIBRARY_SETTINGS_DEFAULTS } from "@/lib/constants";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { notifyParentForChild } from "@/lib/parent-notifications";
import { resolveChildByRfid } from "@/lib/rfid-access";

async function getSetting(key: string, organizationId: string): Promise<string> {
  const rows = await db
    .select({ value: librarySetting.value })
    .from(librarySetting)
    .where(and(eq(librarySetting.key, key), eq(librarySetting.organizationId, organizationId)))
    .limit(1);
  return rows[0]?.value ?? LIBRARY_SETTINGS_DEFAULTS[key] ?? "";
}

// POST /api/library/reissue — reissue/extend a book (issuanceId + RFID)
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
    const { rfidCardId, issuanceId } = body as {
      rfidCardId: string;
      issuanceId: string;
    };

    if (!rfidCardId || !issuanceId) {
      return NextResponse.json(
        { success: false, reason: "Missing RFID card or issuance ID" },
        { status: 400 }
      );
    }

    // ── 1. Look up child by RFID ─────────────────────
    const resolved = await resolveChildByRfid(rfidCardId, requestOrgId);
    if (!resolved) {
      return NextResponse.json(
        { success: false, reason: "Unknown card." },
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
        { success: false, reason: "Unknown card." },
        { status: 200 }
      );
    }

    const studentChild = children[0];

    // ── 2. Look up active issuance ───────────────────
    const issuances = await db
      .select({
        id: bookIssuance.id,
        bookCopyId: bookIssuance.bookCopyId,
        childId: bookIssuance.childId,
        dueDate: bookIssuance.dueDate,
        reissueCount: bookIssuance.reissueCount,
      })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .where(
        and(
          eq(bookIssuance.id, issuanceId),
          eq(bookCopy.organizationId, requestOrgId),
          eq(bookIssuance.status, "ISSUED")
        )
      )
      .limit(1);

    if (issuances.length === 0) {
      return NextResponse.json(
        { success: false, reason: "Issuance not found or not in active status." },
        { status: 200 }
      );
    }

    const issuance = issuances[0];

    // ── 3. Verify RFID matches the child ─────────────
    if (issuance.childId !== studentChild.id) {
      return NextResponse.json(
        { success: false, reason: "This book is not issued to you." },
        { status: 200 }
      );
    }

    // ── 4. Check if already overdue ──────────────────
    const now = new Date();
    if (new Date(issuance.dueDate) < now) {
      return NextResponse.json(
        { success: false, reason: "This book is overdue. Please return it first." },
        { status: 200 }
      );
    }

    // ── 5. Check max reissues ────────────────────────
    const maxReissuesStr = await getSetting("max_reissues", requestOrgId);
    const maxReissues = parseInt(maxReissuesStr, 10) || 3;

    if (issuance.reissueCount >= maxReissues) {
      return NextResponse.json(
        { success: false, reason: `Maximum reissues (${maxReissues}) reached. Please return the book.` },
        { status: 200 }
      );
    }

    // ── 6. Extend due date ───────────────────────────
    const reissueDaysStr = await getSetting("reissue_duration_days", requestOrgId);
    const reissueDays = parseInt(reissueDaysStr, 10) || 7;

    const newDueDate = new Date(issuance.dueDate);
    newDueDate.setDate(newDueDate.getDate() + reissueDays);

    await db
      .update(bookIssuance)
      .set({
        dueDate: newDueDate,
        reissueCount: issuance.reissueCount + 1,
        updatedAt: now,
      })
      .where(eq(bookIssuance.id, issuance.id));

    // Get book info for response
    const copies = await db
      .select({ bookId: bookCopy.bookId, accessionNumber: bookCopy.accessionNumber })
      .from(bookCopy)
      .where(and(eq(bookCopy.id, issuance.bookCopyId), eq(bookCopy.organizationId, requestOrgId)))
      .limit(1);

    let bookTitle = "";
    let bookAuthor = "";
    if (copies.length > 0) {
      const books = await db
        .select({ title: book.title, author: book.author })
        .from(book)
        .where(and(eq(book.id, copies[0].bookId), eq(book.organizationId, requestOrgId)))
        .limit(1);
      bookTitle = books[0]?.title ?? "";
      bookAuthor = books[0]?.author ?? "";
    }

    broadcast("library-updated");

    await notifyParentForChild({
      childId: studentChild.id,
      type: "LIBRARY_REISSUE",
      title: `${studentChild.name} reissued a library book`,
      message: `Reissued: ${bookTitle} (${copies[0]?.accessionNumber}).`,
      metadata: {
        issuanceId: issuance.id,
        bookTitle,
        bookAuthor,
        accessionNumber: copies[0]?.accessionNumber,
        reissueCount: issuance.reissueCount + 1,
        newDueDate: newDueDate.toISOString(),
      },
    });

    await logAudit({
      organizationId: requestOrgId,
      userId: studentChild.id,
      userRole: "STUDENT",
      action: AUDIT_ACTIONS.BOOK_REISSUED,
      details: {
        issuanceId: issuance.id,
        bookTitle,
        accessionNumber: copies[0]?.accessionNumber,
        childId: studentChild.id,
        newDueDate: newDueDate.toISOString(),
        reissueCount: issuance.reissueCount + 1,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Book reissued successfully!",
      newDueDate: newDueDate.toISOString(),
      reissueCount: issuance.reissueCount + 1,
      maxReissues,
      bookTitle,
      bookAuthor,
      accessionNumber: copies[0]?.accessionNumber,
    });
  } catch (error) {
    console.error("[Library Reissue] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
