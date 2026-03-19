import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, bookIssuance, bookCopy, book, parentControl } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { resolveChildByRfid } from "@/lib/rfid-access";

// POST /api/library/student — look up child by RFID, return issued books
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

    const { rfidCardId } = (await request.json()) as { rfidCardId: string };

    if (!rfidCardId) {
      return NextResponse.json(
        { success: false, reason: "Missing RFID card ID" },
        { status: 400 }
      );
    }

    const resolved = await resolveChildByRfid(rfidCardId, requestOrgId);
    if (!resolved) {
      return NextResponse.json(
        { success: false, reason: "Unknown card. Please ask the school office to register your card." },
        { status: 200 }
      );
    }

    // Look up child by resolved ID
    const children = await db
      .select({
        id: child.id,
        name: child.name,
        className: child.className,
        section: child.section,
        image: child.image,
        preIssueBookId: parentControl.preIssueBookId,
        preIssueExpiresAt: parentControl.preIssueExpiresAt,
        preIssueDeclinedUntil: parentControl.preIssueDeclinedUntil,
      })
      .from(child)
      .leftJoin(parentControl, eq(parentControl.childId, child.id))
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

    let preIssueBook: {
      id: string;
      title: string;
      author: string;
      category: string;
      expiresAt: string;
    } | null = null;

    if (studentChild.preIssueBookId && studentChild.preIssueExpiresAt) {
      const expiresAt = new Date(studentChild.preIssueExpiresAt);
      if (expiresAt <= now) {
        await db
          .update(parentControl)
          .set({
            preIssueBookId: null,
            preIssueExpiresAt: null,
            updatedAt: now,
          })
          .where(eq(parentControl.childId, studentChild.id));
      } else {
        const books = await db
          .select({
            id: book.id,
            title: book.title,
            author: book.author,
            category: book.category,
          })
          .from(book)
          .where(and(eq(book.id, studentChild.preIssueBookId), eq(book.organizationId, requestOrgId)))
          .limit(1);

        if (books.length > 0) {
          preIssueBook = {
            ...books[0],
            expiresAt: expiresAt.toISOString(),
          };
        }
      }
    }

    const issueBlockedUntil =
      studentChild.preIssueDeclinedUntil &&
      new Date(studentChild.preIssueDeclinedUntil) > now
        ? studentChild.preIssueDeclinedUntil.toISOString()
        : null;

    // Get active issuances (ISSUED or RETURN_PENDING)
    const issuances = await db
      .select({
        id: bookIssuance.id,
        issuedAt: bookIssuance.issuedAt,
        dueDate: bookIssuance.dueDate,
        status: bookIssuance.status,
        reissueCount: bookIssuance.reissueCount,
        fineAmount: bookIssuance.fineAmount,
        bookCopyId: bookIssuance.bookCopyId,
        accessionNumber: bookCopy.accessionNumber,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        bookCategory: book.category,
        coverImageUrl: book.coverImageUrl,
      })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .innerJoin(book, eq(bookCopy.bookId, book.id))
      .where(
        and(
          eq(bookIssuance.childId, studentChild.id),
          eq(bookCopy.organizationId, requestOrgId),
          eq(book.organizationId, requestOrgId),
          inArray(bookIssuance.status, ["ISSUED", "RETURN_PENDING"])
        )
      );

    return NextResponse.json({
      success: true,
      child: {
        id: studentChild.id,
        name: studentChild.name,
        className: studentChild.className,
        section: studentChild.section,
        image: studentChild.image,
      },
      preIssueBook,
      issueBlockedUntil,
      issuedBooks: issuances.map((i) => ({
        issuanceId: i.id,
        issuedAt: i.issuedAt,
        dueDate: i.dueDate,
        status: i.status,
        reissueCount: i.reissueCount,
        fineAmount: i.fineAmount,
        accessionNumber: i.accessionNumber,
        bookId: i.bookId,
        title: i.bookTitle,
        author: i.bookAuthor,
        category: i.bookCategory,
        coverImageUrl: i.coverImageUrl,
        isOverdue: i.status === "ISSUED" && new Date(i.dueDate) < new Date(),
      })),
    });
  } catch (error) {
    console.error("[Library Student Lookup] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
