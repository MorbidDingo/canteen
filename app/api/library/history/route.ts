import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, bookIssuance, bookCopy, book } from "@/lib/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

// GET /api/library/history?childId=xxx
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch parent's children
  const children = await db
    .select({ id: child.id, name: child.name })
    .from(child)
    .where(eq(child.parentId, session.user.id));

  if (children.length === 0) {
    return NextResponse.json({ children: [], issued: [], history: [], stats: null });
  }

  const childId = request.nextUrl.searchParams.get("childId") || children[0].id;

  // Verify this child belongs to the parent
  if (!children.some((c) => c.id === childId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch all issuances for this child with book details
  const issuances = await db
    .select({
      id: bookIssuance.id,
      status: bookIssuance.status,
      issuedAt: bookIssuance.issuedAt,
      dueDate: bookIssuance.dueDate,
      returnedAt: bookIssuance.returnedAt,
      reissueCount: bookIssuance.reissueCount,
      fineAmount: bookIssuance.fineAmount,
      fineDeducted: bookIssuance.fineDeducted,
      notes: bookIssuance.notes,
      accessionNumber: bookCopy.accessionNumber,
      bookTitle: book.title,
      bookAuthor: book.author,
      bookCategory: book.category,
      bookCoverUrl: book.coverImageUrl,
    })
    .from(bookIssuance)
    .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
    .innerJoin(book, eq(bookCopy.bookId, book.id))
    .where(eq(bookIssuance.childId, childId))
    .orderBy(desc(bookIssuance.issuedAt));

  const activeStatuses = ["ISSUED", "OVERDUE", "RETURN_PENDING"];
  const issued = issuances.filter((i) => activeStatuses.includes(i.status));
  const history = issuances.filter((i) => !activeStatuses.includes(i.status));

  // Summary stats
  const returnedBooks = issuances.filter((i) => i.status === "RETURNED");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthCount = returnedBooks.filter(
    (i) => i.returnedAt && new Date(i.returnedAt) >= monthStart
  ).length;

  // Favorite category
  const categoryCounts: Record<string, number> = {};
  for (const i of returnedBooks) {
    categoryCounts[i.bookCategory] = (categoryCounts[i.bookCategory] || 0) + 1;
  }
  const favoriteCategory =
    Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Check overdue across ALL children (for badge)
  const childIds = children.map((c) => c.id);
  const overdueRecords = await db
    .select({ id: bookIssuance.id, childId: bookIssuance.childId })
    .from(bookIssuance)
    .where(
      and(
        inArray(bookIssuance.childId, childIds),
        eq(bookIssuance.status, "OVERDUE")
      )
    );

  return NextResponse.json({
    children,
    issued,
    history,
    stats: {
      totalBooksRead: returnedBooks.length,
      thisMonthCount,
      favoriteCategory,
    },
    overdueCount: overdueRecords.length,
  });
}
