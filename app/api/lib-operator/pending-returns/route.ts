import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, book, bookCopy, bookIssuance } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// GET /api/lib-operator/pending-returns — list RETURN_PENDING issuances
export async function GET() {
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
    const pendingIssuances = await db
      .select({
        id: bookIssuance.id,
        issuedAt: bookIssuance.issuedAt,
        dueDate: bookIssuance.dueDate,
        updatedAt: bookIssuance.updatedAt,
        fineAmount: bookIssuance.fineAmount,
        bookCopyId: bookIssuance.bookCopyId,
        accessionNumber: bookCopy.accessionNumber,
        bookTitle: book.title,
        bookAuthor: book.author,
        childName: child.name,
        childClassName: child.className,
        childSection: child.section,
      })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .innerJoin(book, eq(bookCopy.bookId, book.id))
      .innerJoin(child, eq(bookIssuance.childId, child.id))
      .where(eq(bookIssuance.status, "RETURN_PENDING"));

    return NextResponse.json({ success: true, pendingReturns: pendingIssuances });
  } catch (error) {
    console.error("[Lib Operator Pending Returns] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
