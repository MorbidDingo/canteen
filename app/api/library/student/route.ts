import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, bookIssuance, bookCopy, book } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

// POST /api/library/student — look up child by RFID, return issued books
export async function POST(request: NextRequest) {
  try {
    const { rfidCardId } = (await request.json()) as { rfidCardId: string };

    if (!rfidCardId) {
      return NextResponse.json(
        { success: false, reason: "Missing RFID card ID" },
        { status: 400 }
      );
    }

    // Look up child by RFID
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
