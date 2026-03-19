import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// POST /api/lib-operator/lookup-book — look up book by accession# or ISBN
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
    const { scanInput } = (await request.json()) as { scanInput: string };

    if (!scanInput) {
      return NextResponse.json(
        { success: false, reason: "Missing scan input" },
        { status: 400 }
      );
    }

    // Try accession number first
    const copies = await db
      .select()
      .from(bookCopy)
      .where(eq(bookCopy.accessionNumber, scanInput))
      .limit(1);

    if (copies.length > 0) {
      const copy = copies[0];
      const books = await db
        .select()
        .from(book)
        .where(eq(book.id, copy.bookId))
        .limit(1);

      return NextResponse.json({
        success: true,
        book: books[0] ?? null,
        copy,
      });
    }

    // Try ISBN
    const booksByIsbn = await db
      .select()
      .from(book)
      .where(eq(book.isbn, scanInput))
      .limit(1);

    if (booksByIsbn.length > 0) {
      const matchedBook = booksByIsbn[0];
      // Get first available copy
      const availableCopies = await db
        .select()
        .from(bookCopy)
        .where(
          eq(bookCopy.bookId, matchedBook.id)
        )
        .limit(10);

      return NextResponse.json({
        success: true,
        book: matchedBook,
        copy: availableCopies.find((c) => c.status === "AVAILABLE") ?? availableCopies[0] ?? null,
        allCopies: availableCopies,
      });
    }

    return NextResponse.json(
      { success: false, reason: "Book not found." },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Lib Operator Lookup Book] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
