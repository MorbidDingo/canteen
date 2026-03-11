import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book } from "@/lib/db/schema";
import { or, ilike, sql } from "drizzle-orm";

// GET /api/library/search?q=keyword — search books by title/author/ISBN
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json(
        { success: false, reason: "Search query must be at least 2 characters" },
        { status: 400 }
      );
    }

    const pattern = `%${q}%`;

    const books = await db
      .select({
        id: book.id,
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        publisher: book.publisher,
        edition: book.edition,
        category: book.category,
        description: book.description,
        coverImageUrl: book.coverImageUrl,
        totalCopies: book.totalCopies,
        availableCopies: book.availableCopies,
      })
      .from(book)
      .where(
        or(
          ilike(book.title, pattern),
          ilike(book.author, pattern),
          ilike(book.isbn, pattern)
        )
      )
      .limit(30);

    return NextResponse.json({ success: true, books });
  } catch (error) {
    console.error("[Library Search] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
