import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookFavourite } from "@/lib/db/schema";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { and, eq } from "drizzle-orm";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bookId =
    typeof body === "object" && body !== null && "bookId" in body
      ? String((body as { bookId: unknown }).bookId)
      : null;

  if (!bookId?.trim()) {
    return NextResponse.json({ error: "bookId is required" }, { status: 400 });
  }

  // Verify the book belongs to this org
  const [bookRow] = await db
    .select({ id: book.id })
    .from(book)
    .where(and(eq(book.id, bookId), eq(book.organizationId, organizationId)))
    .limit(1);

  if (!bookRow) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  // Toggle: check if already favourited
  const [existing] = await db
    .select({ id: bookFavourite.id })
    .from(bookFavourite)
    .where(
      and(
        eq(bookFavourite.bookId, bookId),
        eq(bookFavourite.parentId, session.user.id),
        eq(bookFavourite.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .delete(bookFavourite)
      .where(
        and(
          eq(bookFavourite.bookId, bookId),
          eq(bookFavourite.parentId, session.user.id),
          eq(bookFavourite.organizationId, organizationId),
        ),
      );
    return NextResponse.json({ isFavourited: false });
  }

  await db.insert(bookFavourite).values({
    bookId,
    parentId: session.user.id,
    organizationId,
  });

  return NextResponse.json({ isFavourited: true });
}
