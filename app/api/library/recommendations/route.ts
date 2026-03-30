import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy, bookIssuance, child, certeSubscription } from "@/lib/db/schema";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { and, count, desc, eq, gte, max, notInArray } from "drizzle-orm";

// GET /api/library/recommendations
// Returns ML-based personalised book recommendations for the parent's children.
export async function GET() {
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
  const userId = session.user.id;
  const orgId = access.activeOrganizationId!;

  // Certe+ gate (same as canteen recommendations)
  const [activeSub] = await db
    .select({ id: certeSubscription.id })
    .from(certeSubscription)
    .where(
      and(
        eq(certeSubscription.parentId, userId),
        eq(certeSubscription.status, "ACTIVE"),
        gte(certeSubscription.endDate, new Date()),
      ),
    )
    .limit(1);

  if (!activeSub) {
    return NextResponse.json(
      { error: "Certe+ subscription required", code: "SUBSCRIPTION_REQUIRED" },
      { status: 403 },
    );
  }

  // Get first child for recommendations
  const children = await db
    .select({ id: child.id, className: child.className })
    .from(child)
    .where(eq(child.parentId, userId));

  if (children.length === 0) {
    return NextResponse.json({ recommendations: [] });
  }

  // Use first child for personalisation
  const targetChild = children[0];

  // Fetch child's reading history (books already read in last 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const readHistory = await db
    .select({
      bookId: book.id,
      category: book.category,
      author: book.author,
    })
    .from(bookIssuance)
    .innerJoin(bookCopy, eq(bookCopy.id, bookIssuance.bookCopyId))
    .innerJoin(book, eq(book.id, bookCopy.bookId))
    .where(
      and(
        eq(bookIssuance.childId, targetChild.id),
        gte(bookIssuance.issuedAt, ninetyDaysAgo),
      ),
    );

  const readBookIds = readHistory.map((r) => r.bookId);

  // Build category and author affinity from reading history
  const categoryCount = new Map<string, number>();
  const authorCount = new Map<string, number>();
  for (const r of readHistory) {
    categoryCount.set(r.category, (categoryCount.get(r.category) ?? 0) + 1);
    const authorKey = r.author.trim().toLowerCase();
    authorCount.set(authorKey, (authorCount.get(authorKey) ?? 0) + 1);
  }

  // Get popular books in the last 30 days (with borrow counts)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const popularRows = await db
    .select({
      bookId: book.id,
      title: book.title,
      author: book.author,
      category: book.category,
      coverImageUrl: book.coverImageUrl,
      availableCopies: max(book.availableCopies).as("availableCopies"),
      borrowCount: count(bookIssuance.id),
    })
    .from(bookIssuance)
    .innerJoin(bookCopy, eq(bookCopy.id, bookIssuance.bookCopyId))
    .innerJoin(book, eq(book.id, bookCopy.bookId))
    .where(
      and(
        eq(book.organizationId, orgId),
        gte(bookIssuance.issuedAt, thirtyDaysAgo),
      ),
    )
    .groupBy(book.id, book.title, book.author, book.category, book.coverImageUrl)
    .orderBy(desc(count(bookIssuance.id)))
    .limit(40);

  // Also fetch some available books not in popular list for variety
  const popularBookIds = popularRows.map((r) => r.bookId);
  const extraRows = await db
    .select({
      bookId: book.id,
      title: book.title,
      author: book.author,
      category: book.category,
      coverImageUrl: book.coverImageUrl,
      availableCopies: book.availableCopies,
    })
    .from(book)
    .where(
      and(
        eq(book.organizationId, orgId),
        popularBookIds.length > 0 ? notInArray(book.id, popularBookIds) : undefined,
      ),
    )
    .orderBy(desc(book.createdAt))
    .limit(20);

  type Candidate = {
    bookId: string;
    title: string;
    author: string;
    category: string;
    coverImageUrl: string | null;
    availableCopies: number;
    borrowCount: number;
  };

  const allCandidates: Candidate[] = [
    ...popularRows,
    ...extraRows.map((r) => ({ ...r, borrowCount: 0 })),
  ];

  // Score candidates using popularity + category/author affinity
  const maxBorrow = Math.max(...allCandidates.map((c) => c.borrowCount), 1);
  const maxCatAffinity = Math.max(...categoryCount.values(), 1);
  const maxAuthorAffinity = Math.max(...authorCount.values(), 1);

  const scored = allCandidates
    .filter(
      (c) =>
        (c.availableCopies ?? 0) > 0 &&
        !readBookIds.includes(c.bookId),
    )
    .map((c) => {
      const popularityScore = c.borrowCount / maxBorrow;
      const categoryScore = (categoryCount.get(c.category) ?? 0) / maxCatAffinity;
      const authorScore =
        (authorCount.get(c.author.trim().toLowerCase()) ?? 0) / maxAuthorAffinity;

      const totalScore =
        popularityScore * 0.4 + categoryScore * 0.35 + authorScore * 0.25;

      const reasons: string[] = [];
      if (categoryScore > 0.5) reasons.push(`You enjoy ${c.category.toLowerCase()} books`);
      if (authorScore > 0.5) reasons.push("Same author you've read before");
      if (popularityScore > 0.6) reasons.push("Trending in your school");
      if (reasons.length === 0) reasons.push("Available now");

      return { ...c, score: totalScore, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return NextResponse.json({
    recommendations: scored.map((r) => ({
      bookId: r.bookId,
      title: r.title,
      author: r.author,
      category: r.category,
      coverImageUrl: r.coverImageUrl,
      availableCopies: r.availableCopies,
      score: Math.round(r.score * 100) / 100,
      reasons: r.reasons,
    })),
    childId: targetChild.id,
  });
}
