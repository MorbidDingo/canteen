import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, child, parentControl } from "@/lib/db/schema";
import { or, ilike, eq } from "drizzle-orm";

function safeParseJSON(val: string | null): string[] {
  if (!val) return [];
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}

// GET /api/library/search?q=keyword — search books by title/author/ISBN
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim();
    const rfidCardId = request.nextUrl.searchParams.get("rfidCardId")?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json(
        { success: false, reason: "Search query must be at least 2 characters" },
        { status: 400 }
      );
    }

    const pattern = `%${q}%`;

    let books = await db
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

    if (rfidCardId) {
      const controls = await db
        .select({
          blockedBookCategories: parentControl.blockedBookCategories,
          blockedBookAuthors: parentControl.blockedBookAuthors,
          blockedBookIds: parentControl.blockedBookIds,
          preIssueDeclinedUntil: parentControl.preIssueDeclinedUntil,
        })
        .from(child)
        .leftJoin(parentControl, eq(parentControl.childId, child.id))
        .where(eq(child.rfidCardId, rfidCardId))
        .limit(1);

      if (controls.length > 0) {
        const control = controls[0];
        const blockedBookCategories = new Set(safeParseJSON(control.blockedBookCategories));
        const blockedBookAuthors = new Set(
          safeParseJSON(control.blockedBookAuthors).map((a) => a.trim().toLowerCase())
        );
        const blockedBookIds = new Set(safeParseJSON(control.blockedBookIds));

        const now = new Date();
        const declinedUntil = control.preIssueDeclinedUntil;
        if (declinedUntil && new Date(declinedUntil) > now) {
          return NextResponse.json({
            success: true,
            books: [],
            blocked: true,
            reason: "Book issue is temporarily blocked for 12 hours.",
            blockedUntil: declinedUntil,
          });
        }

        books = books.filter((b) => {
          if (blockedBookIds.has(b.id)) return false;
          if (blockedBookCategories.has(b.category)) return false;
          if (blockedBookAuthors.has((b.author || "").trim().toLowerCase())) return false;
          return true;
        });
      }
    }

    return NextResponse.json({ success: true, books });
  } catch (error) {
    console.error("[Library Search] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
