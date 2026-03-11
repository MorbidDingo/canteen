import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy } from "@/lib/db/schema";
import { eq, or, ilike, sql, count } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import type { BookCategory } from "@/lib/constants";

// GET — list/search books with copy counts
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || !["MANAGEMENT", "LIB_OPERATOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const category = searchParams.get("category")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));
  const offset = (page - 1) * limit;

  const conditions = [];

  if (q && q.length >= 2) {
    conditions.push(
      or(
        ilike(book.title, `%${q}%`),
        ilike(book.author, `%${q}%`),
        ilike(book.isbn, `%${q}%`),
      ),
    );
  }

  if (category) {
    conditions.push(eq(book.category, category as BookCategory));
  }

  const where = conditions.length > 0
    ? conditions.length === 1
      ? conditions[0]
      : sql`${conditions[0]} AND ${conditions[1]}`
    : undefined;

  const [books, [total]] = await Promise.all([
    db
      .select()
      .from(book)
      .where(where)
      .orderBy(book.title)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(book)
      .where(where),
  ]);

  return NextResponse.json({
    books,
    pagination: {
      page,
      limit,
      total: total?.count ?? 0,
      totalPages: Math.ceil((total?.count ?? 0) / limit),
    },
  });
}

// POST — create a new book
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || !["MANAGEMENT", "LIB_OPERATOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { title, author, isbn, publisher, edition, category, description } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!author?.trim()) {
      return NextResponse.json({ error: "Author is required" }, { status: 400 });
    }

    // Check duplicate ISBN if provided
    if (isbn?.trim()) {
      const [existing] = await db
        .select({ id: book.id })
        .from(book)
        .where(eq(book.isbn, isbn.trim()))
        .limit(1);
      if (existing) {
        return NextResponse.json(
          { error: `A book with ISBN ${isbn.trim()} already exists` },
          { status: 409 },
        );
      }
    }

    const [created] = await db
      .insert(book)
      .values({
        title: title.trim(),
        author: author.trim(),
        isbn: isbn?.trim() || null,
        publisher: publisher?.trim() || null,
        edition: edition?.trim() || null,
        category: category || "GENERAL",
        description: description?.trim() || null,
        totalCopies: 0,
        availableCopies: 0,
      })
      .returning();

    await logAudit({
      userId: session.user.id,
      userRole: session.user.role,
      action: AUDIT_ACTIONS.BOOK_CREATED,
      details: { bookId: created.id, title: created.title, isbn: created.isbn },
      request,
    });

    return NextResponse.json({ book: created }, { status: 201 });
  } catch (error) {
    console.error("Create book error:", error);
    return NextResponse.json({ error: "Failed to create book" }, { status: 500 });
  }
}
