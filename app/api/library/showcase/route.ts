import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  book,
  bookCopy,
  bookFavourite,
  bookFeedback,
  bookIssuance,
  certeSubscription,
  child,
  library,
  libraryAppIssueRequest,
  parentControl,
} from "@/lib/db/schema";
import {
  AccessDeniedError,
  requireLinkedAccount,
} from "@/lib/auth-server";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";

const ACTIVE_ISSUANCE_STATUSES = ["ISSUED", "OVERDUE", "RETURN_PENDING"] as const;
const GOAT_MIN_ISSUES = 3;

type ShelfBook = {
  id: string;
  isbn: string | null;
  title: string;
  author: string;
  category: string;
  description: string | null;
  coverImageUrl: string | null;
  availableCopies: number;
  createdAt: Date;
  hotIssueCount: number;
  mustReadCount: number;
  avgEnjoyment: number;
  recommendationRate: number;
  feedbackCount: number;
  favouriteCount: number;
  isFavourited: boolean;
  isIssued: boolean;
  issuedAt: Date | null;
  issuedStatus: string | null;
  issuedDueDate: Date | null;
  requestId: string | null;
  requestExpiresAt: Date | null;
  canRequest: boolean;
  metaLabel: string | null;
};

type ChildOption = {
  id: string;
  name: string;
  className: string | null;
  section: string | null;
  organizationId: string | null;
};

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return value / max;
}

function buildPersonalizedRanking(params: {
  books: ShelfBook[];
  history: Array<{ category: string; author: string }>;
  favouritedBookIds: Set<string>;
}) {
  const { books, history, favouritedBookIds } = params;

  const categoryAffinity = new Map<string, number>();
  const authorAffinity = new Map<string, number>();

  for (const item of history) {
    categoryAffinity.set(item.category, (categoryAffinity.get(item.category) ?? 0) + 1);
    const authorKey = item.author.trim().toLowerCase();
    authorAffinity.set(authorKey, (authorAffinity.get(authorKey) ?? 0) + 1);
  }

  // Favourites boost — treat each favourited book's category/author as strong affinity signal
  for (const b of books) {
    if (!favouritedBookIds.has(b.id)) continue;
    categoryAffinity.set(b.category, (categoryAffinity.get(b.category) ?? 0) + 3);
    const authorKey = b.author.trim().toLowerCase();
    authorAffinity.set(authorKey, (authorAffinity.get(authorKey) ?? 0) + 3);
  }

  const maxCategoryAffinity = Math.max(...categoryAffinity.values(), 0);
  const maxAuthorAffinity = Math.max(...authorAffinity.values(), 0);
  const maxHot = Math.max(...books.map((item) => item.hotIssueCount), 0);
  const maxMustRead = Math.max(...books.map((item) => item.mustReadCount), 0);
  const maxEnjoyment = Math.max(...books.map((item) => item.avgEnjoyment), 0);
  const maxFeedbackCount = Math.max(...books.map((item) => item.feedbackCount), 0);

  const now = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  return books
    .map((item) => {
      const categoryScore = normalize(categoryAffinity.get(item.category) ?? 0, maxCategoryAffinity);
      const authorScore = normalize(
        authorAffinity.get(item.author.trim().toLowerCase()) ?? 0,
        maxAuthorAffinity,
      );
      const hotScore = normalize(item.hotIssueCount, maxHot);
      const mustReadScore = normalize(item.mustReadCount, maxMustRead);
      const enjoymentScore = normalize(item.avgEnjoyment, maxEnjoyment);
      const recScore = item.recommendationRate;
      const socialProof = normalize(item.feedbackCount, maxFeedbackCount);
      const freshnessScore = Math.max(0, 1 - (now - new Date(item.createdAt).getTime()) / ninetyDaysMs);
      const availabilityScore = item.availableCopies > 0 ? 1 : 0;
      const favouriteScore = favouritedBookIds.has(item.id) ? 1 : 0;

      const mlScore =
        categoryScore * 0.24 +
        authorScore * 0.13 +
        hotScore * 0.15 +
        mustReadScore * 0.13 +
        enjoymentScore * 0.11 +
        recScore * 0.09 +
        socialProof * 0.04 +
        freshnessScore * 0.02 +
        availabilityScore * 0.02 +
        favouriteScore * 0.07;

      const reasons: string[] = [];
      if (favouriteScore === 1) reasons.push("You marked this as a favourite");
      if (categoryScore >= 0.45) reasons.push("Matches your reading category trend");
      if (authorScore >= 0.35) reasons.push("Author aligns with prior picks");
      if (enjoymentScore >= 0.7 && item.feedbackCount >= 2) reasons.push("High student enjoyment ratings");
      if (recScore >= 0.7 && item.feedbackCount >= 3) reasons.push("Highly recommended by readers");
      if (hotScore >= 0.6) reasons.push("Hot this week");
      if (mustReadScore >= 0.6) reasons.push("All-time popular title");
      if (item.availableCopies > 0) reasons.push("Available for kiosk confirmation now");
      if (reasons.length === 0) reasons.push("Balanced recommendation from library signals");

      return {
        ...item,
        mlScore: Math.round(mlScore * 1000) / 1000,
        mlReasons: reasons,
      };
    })
    .sort((a, b) => b.mlScore - a.mlScore);
}

function uniqBy<T>(items: T[], keyOf: (value: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export async function GET(request: NextRequest) {
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
  const now = new Date();

  const childRows = await db
    .select({
      id: child.id,
      name: child.name,
      className: child.className,
      section: child.section,
      organizationId: child.organizationId,
      createdAt: child.createdAt,
    })
    .from(child)
    .where(
      and(
        eq(child.parentId, session.user.id),
        or(eq(child.organizationId, organizationId), isNull(child.organizationId)),
      ),
    )
    .orderBy(asc(child.createdAt));

  if (childRows.length === 0 && session.user.role === "GENERAL") {
    const generatedGr = `GEN-${session.user.id.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    await db
      .insert(child)
      .values({
        organizationId,
        parentId: session.user.id,
        name: session.user.name?.trim() || "Account Holder",
        grNumber: generatedGr,
        className: "GENERAL_ACCOUNT",
      })
      .onConflictDoNothing({ target: [child.organizationId, child.grNumber] });
  }

  const finalChildrenRows = childRows.length
    ? childRows
    : await db
        .select({
          id: child.id,
          name: child.name,
          className: child.className,
          section: child.section,
          organizationId: child.organizationId,
          createdAt: child.createdAt,
        })
        .from(child)
        .where(and(eq(child.parentId, session.user.id), eq(child.organizationId, organizationId)))
        .orderBy(asc(child.createdAt));

  if (finalChildrenRows.length === 0) {
    return NextResponse.json({
      children: [],
      selectedChildId: null,
      canUseAi: false,
      aiModeEnabled: false,
      filters: {
        query: "",
        category: "ALL",
        availability: "ALL",
        sort: "HOT",
      },
      rails: {
        hotThisWeek: [],
        newcomers: [],
        goats: [],
        mustReads: [],
        personalized: [],
        categories: [],
      },
      catalog: [],
      issued: [],
      pendingRequests: [],
      feedbackPromptCount: 0,
      totals: {
        catalog: 0,
        available: 0,
        issued: 0,
        pending: 0,
      },
    });
  }

  const { searchParams } = request.nextUrl;
  const requestedChildId = searchParams.get("childId")?.trim() || null;
  const selectedLibraryId = searchParams.get("libraryId")?.trim() || null;
  const query = searchParams.get("q")?.trim() || "";
  const category = (searchParams.get("category")?.trim() || "ALL").toUpperCase();
  const availability = (searchParams.get("availability")?.trim() || "ALL").toUpperCase();
  const sort = (searchParams.get("sort")?.trim() || "HOT").toUpperCase();
  const aiModeRequested = searchParams.get("aiMode") === "true";

  if (selectedLibraryId) {
    const [libraryRow] = await db
      .select({ id: library.id })
      .from(library)
      .where(and(eq(library.id, selectedLibraryId), eq(library.organizationId, organizationId)))
      .limit(1);

    if (!libraryRow) {
      return NextResponse.json({ error: "Invalid library selected" }, { status: 400 });
    }
  }

  const selectedChildRow =
    finalChildrenRows.find((item) => item.id === requestedChildId) ?? finalChildrenRows[0];

  if (!selectedChildRow.organizationId) {
    await db
      .update(child)
      .set({ organizationId, updatedAt: now })
      .where(eq(child.id, selectedChildRow.id));
  }

  const selectedChildId = selectedChildRow.id;
  const libraryScopeCondition = selectedLibraryId
    ? eq(book.libraryId, selectedLibraryId)
    : sql`true`;
  const pendingScopeCondition =
    session.user.role === "GENERAL"
      ? and(
          eq(libraryAppIssueRequest.organizationId, organizationId),
          eq(libraryAppIssueRequest.parentId, session.user.id),
          eq(libraryAppIssueRequest.status, "REQUESTED"),
        )
      : and(
          eq(libraryAppIssueRequest.organizationId, organizationId),
          eq(libraryAppIssueRequest.childId, selectedChildId),
          eq(libraryAppIssueRequest.status, "REQUESTED"),
        );

  await db
    .update(libraryAppIssueRequest)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(
      and(
        pendingScopeCondition,
        sql`${libraryAppIssueRequest.expiresAt} <= ${now}`,
      ),
    );

  const [
    controlRow,
    allBooks,
    activeIssuanceRows,
    returnedRows,
    allIssueCountRows,
    hotIssueCountRows,
    activeSubscription,
    childReadingHistory,
    feedbackAggRows,
    feedbackGivenRows,
    pendingRequestRows,
    favouriteCountRows,
    userFavouriteRows,
  ] = await Promise.all([
    db
      .select({
        blockedBookCategories: parentControl.blockedBookCategories,
        blockedBookAuthors: parentControl.blockedBookAuthors,
        blockedBookIds: parentControl.blockedBookIds,
      })
      .from(parentControl)
      .where(eq(parentControl.childId, selectedChildId))
      .limit(1),
    db
      .select({
        id: book.id,
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        category: book.category,
        description: book.description,
        coverImageUrl: book.coverImageUrl,
        libraryId: book.libraryId,
        libraryName: library.name,
        libraryLocation: library.location,
        totalCopies: book.totalCopies,
        availableCopies: book.availableCopies,
        createdAt: book.createdAt,
      })
      .from(book)
      .leftJoin(library, eq(book.libraryId, library.id))
      .where(and(eq(book.organizationId, organizationId), libraryScopeCondition)),
    db
      .select({
        issuanceId: bookIssuance.id,
        status: bookIssuance.status,
        issuedAt: bookIssuance.issuedAt,
        dueDate: bookIssuance.dueDate,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        bookCategory: book.category,
        bookCoverUrl: book.coverImageUrl,
      })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .innerJoin(book, eq(bookCopy.bookId, book.id))
      .where(
        and(
          eq(bookIssuance.childId, selectedChildId),
          eq(book.organizationId, organizationId),
          libraryScopeCondition,
          inArray(bookIssuance.status, [...ACTIVE_ISSUANCE_STATUSES]),
        ),
      )
      .orderBy(desc(bookIssuance.issuedAt)),
    db
      .select({
        issuanceId: bookIssuance.id,
        status: bookIssuance.status,
        issuedAt: bookIssuance.issuedAt,
        dueDate: bookIssuance.dueDate,
        returnedAt: bookIssuance.returnedAt,
        fineAmount: bookIssuance.fineAmount,
        reissueCount: bookIssuance.reissueCount,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        bookCategory: book.category,
        bookCoverUrl: book.coverImageUrl,
      })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .innerJoin(book, eq(bookCopy.bookId, book.id))
      .where(
        and(
          eq(bookIssuance.childId, selectedChildId),
          eq(book.organizationId, organizationId),
          libraryScopeCondition,
          eq(bookIssuance.status, "RETURNED"),
        ),
      )
      .orderBy(desc(bookIssuance.returnedAt), desc(bookIssuance.issuedAt))
      .limit(30),
    db
      .select({
        bookId: bookCopy.bookId,
        count: sql<number>`count(${bookIssuance.id})`,
      })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .innerJoin(book, eq(bookCopy.bookId, book.id))
      .where(and(eq(bookCopy.organizationId, organizationId), libraryScopeCondition))
      .groupBy(bookCopy.bookId),
    db
      .select({
        bookId: bookCopy.bookId,
        count: sql<number>`count(${bookIssuance.id})`,
      })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .innerJoin(book, eq(bookCopy.bookId, book.id))
      .where(
        and(
          eq(bookCopy.organizationId, organizationId),
          libraryScopeCondition,
          gte(bookIssuance.issuedAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
        ),
      )
      .groupBy(bookCopy.bookId),
    db
      .select({ id: certeSubscription.id })
      .from(certeSubscription)
      .where(
        and(
          eq(certeSubscription.parentId, session.user.id),
          eq(certeSubscription.status, "ACTIVE"),
          gte(certeSubscription.endDate, now),
        ),
      )
      .limit(1),
    db
      .select({ category: book.category, author: book.author })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .innerJoin(book, eq(bookCopy.bookId, book.id))
      .where(
        and(
          eq(bookIssuance.childId, selectedChildId),
          eq(book.organizationId, organizationId),
          libraryScopeCondition,
        ),
      )
      .orderBy(desc(bookIssuance.issuedAt))
      .limit(200),
    db
      .select({
        bookId: bookFeedback.bookId,
        avgEnjoyment: sql<number>`avg(${bookFeedback.enjoymentRating})`,
        recommendRatio: sql<number>`avg(case when ${bookFeedback.wouldRecommend} then 1 else 0 end)`,
        feedbackCount: sql<number>`count(${bookFeedback.id})`,
      })
      .from(bookFeedback)
      .where(eq(bookFeedback.organizationId, organizationId))
      .groupBy(bookFeedback.bookId),
    db
      .select({ issuanceId: bookFeedback.issuanceId })
      .from(bookFeedback)
      .where(
        and(
          eq(bookFeedback.organizationId, organizationId),
          eq(bookFeedback.parentId, session.user.id),
          eq(bookFeedback.childId, selectedChildId),
        ),
      ),
    db
      .select({
        requestId: libraryAppIssueRequest.id,
        status: libraryAppIssueRequest.status,
        expiresAt: libraryAppIssueRequest.expiresAt,
        createdAt: libraryAppIssueRequest.createdAt,
        childId: libraryAppIssueRequest.childId,
        childName: child.name,
        bookId: book.id,
        title: book.title,
        author: book.author,
        category: book.category,
        coverImageUrl: book.coverImageUrl,
        libraryId: book.libraryId,
        libraryName: library.name,
        libraryLocation: library.location,
      })
      .from(libraryAppIssueRequest)
      .innerJoin(book, eq(libraryAppIssueRequest.bookId, book.id))
      .leftJoin(library, eq(book.libraryId, library.id))
      .innerJoin(child, eq(libraryAppIssueRequest.childId, child.id))
      .where(
        and(
          pendingScopeCondition,
          libraryScopeCondition,
          sql`${libraryAppIssueRequest.expiresAt} > ${now}`,
        ),
      )
      .orderBy(desc(libraryAppIssueRequest.createdAt)),
    // Favourite counts per book (org-scoped, all users)
    db
      .select({
        bookId: bookFavourite.bookId,
        count: sql<number>`count(${bookFavourite.id})`,
      })
      .from(bookFavourite)
      .where(eq(bookFavourite.organizationId, organizationId))
      .groupBy(bookFavourite.bookId),
    // Current user's favourites
    db
      .select({ bookId: bookFavourite.bookId })
      .from(bookFavourite)
      .where(
        and(
          eq(bookFavourite.parentId, session.user.id),
          eq(bookFavourite.organizationId, organizationId),
        ),
      ),
  ]);

  const blockedBookCategories = new Set(parseJsonArray(controlRow[0]?.blockedBookCategories ?? null));
  const blockedBookIds = new Set(parseJsonArray(controlRow[0]?.blockedBookIds ?? null));
  const blockedBookAuthors = new Set(
    parseJsonArray(controlRow[0]?.blockedBookAuthors ?? null).map((item) => item.trim().toLowerCase()),
  );

  const allIssueCountMap = new Map<string, number>();
  for (const row of allIssueCountRows) {
    allIssueCountMap.set(row.bookId, Number(row.count));
  }

  const hotIssueCountMap = new Map<string, number>();
  for (const row of hotIssueCountRows) {
    hotIssueCountMap.set(row.bookId, Number(row.count));
  }

  const feedbackAggMap = new Map<
    string,
    { avgEnjoyment: number; recommendationRate: number; feedbackCount: number }
  >();
  for (const row of feedbackAggRows) {
    feedbackAggMap.set(row.bookId, {
      avgEnjoyment: Number(row.avgEnjoyment ?? 0),
      recommendationRate: Number(row.recommendRatio ?? 0),
      feedbackCount: Number(row.feedbackCount ?? 0),
    });
  }

  const favouriteCountMap = new Map<string, number>();
  for (const row of favouriteCountRows) {
    favouriteCountMap.set(row.bookId, Number(row.count));
  }

  const userFavouriteSet = new Set(userFavouriteRows.map((row) => row.bookId));

  const issuedByBookId = new Map(
    activeIssuanceRows.map((row) => [
      row.bookId,
      {
        issuanceId: row.issuanceId,
        status: row.status,
        dueDate: row.dueDate,
        issuedAt: row.issuedAt,
      },
    ]),
  );
  const pendingByBookId = new Map(
    pendingRequestRows.map((row) => [
      row.bookId,
      {
        requestId: row.requestId,
        expiresAt: row.expiresAt,
      },
    ]),
  );
  const hasScopedPendingRequest = pendingRequestRows.length > 0;

  const booksWithoutBlocked = allBooks.filter((item) => {
    if (blockedBookIds.has(item.id)) return false;
    if (blockedBookCategories.has(item.category)) return false;
    if (blockedBookAuthors.has((item.author || "").trim().toLowerCase())) return false;
    return true;
  });

  const booksWithSignals: ShelfBook[] = booksWithoutBlocked.map((item) => {
    const issued = issuedByBookId.get(item.id);
    const feedbackAgg = feedbackAggMap.get(item.id);
    const pending = pendingByBookId.get(item.id);

    return {
      ...item,
      hotIssueCount: hotIssueCountMap.get(item.id) ?? 0,
      mustReadCount: allIssueCountMap.get(item.id) ?? 0,
      avgEnjoyment: feedbackAgg?.avgEnjoyment ?? 0,
      recommendationRate: feedbackAgg?.recommendationRate ?? 0,
      feedbackCount: feedbackAgg?.feedbackCount ?? 0,
      favouriteCount: favouriteCountMap.get(item.id) ?? 0,
      isFavourited: userFavouriteSet.has(item.id),
      isIssued: Boolean(issued),
      issuedAt: issued?.issuedAt ?? null,
      issuedStatus: issued?.status ?? null,
      issuedDueDate: issued?.dueDate ?? null,
      requestId: pending?.requestId ?? null,
      requestExpiresAt: pending?.expiresAt ?? null,
      canRequest:
        item.availableCopies > 0 &&
        !issued &&
        !pending &&
        !hasScopedPendingRequest,
      metaLabel: null,
    };
  });

  let filteredBooks = booksWithSignals;

  if (query.length > 0) {
    const lowered = query.toLowerCase();
    filteredBooks = filteredBooks.filter(
      (item) =>
        item.title.toLowerCase().includes(lowered) ||
        item.author.toLowerCase().includes(lowered) ||
        (item.isbn || "").toLowerCase().includes(lowered),
    );
  }

  if (category !== "ALL") {
    filteredBooks = filteredBooks.filter((item) => item.category === category);
  }

  if (availability === "AVAILABLE") {
    filteredBooks = filteredBooks.filter((item) => item.availableCopies > 0);
  } else if (availability === "ISSUED") {
    filteredBooks = filteredBooks.filter((item) => item.isIssued);
  }

  const canUseAi = activeSubscription.length > 0;
  const aiModeEnabled = aiModeRequested && canUseAi;

  const personalizedRanking = aiModeEnabled
    ? buildPersonalizedRanking({
        books: booksWithSignals,
        history: childReadingHistory,
        favouritedBookIds: userFavouriteSet,
      })
    : booksWithSignals.map((item) => ({ ...item, mlScore: 0, mlReasons: [] as string[] }));

  const aiScoreMap = new Map(personalizedRanking.map((item) => [item.id, item]));

  if (sort === "TITLE") {
    filteredBooks = [...filteredBooks].sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === "LATEST") {
    filteredBooks = [...filteredBooks].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } else if (sort === "MUST_READ") {
    filteredBooks = [...filteredBooks].sort((a, b) => b.mustReadCount - a.mustReadCount);
  } else {
    filteredBooks = [...filteredBooks].sort((a, b) => b.hotIssueCount - a.hotIssueCount);
  }

  const catalog = filteredBooks.map((item) => {
    const aiRow = aiScoreMap.get(item.id);
    return {
      ...item,
      mlScore: aiRow?.mlScore ?? 0,
      mlReasons: aiRow?.mlReasons ?? [],
      metaLabel: null,
    };
  });

  const hotThisWeek = [...booksWithSignals]
    .sort((a, b) => b.hotIssueCount - a.hotIssueCount)
    .filter((item) => item.hotIssueCount > 0)
    .slice(0, 20)
    .map((item) => ({
      ...item,
      mlScore: aiScoreMap.get(item.id)?.mlScore ?? 0,
      mlReasons: aiScoreMap.get(item.id)?.mlReasons ?? [],
      metaLabel: item.hotIssueCount > 0 ? `${item.hotIssueCount} issues this week` : null,
    }));

  const newcomers = [...booksWithSignals]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20)
    .map((item) => ({
      ...item,
      mlScore: aiScoreMap.get(item.id)?.mlScore ?? 0,
      mlReasons: aiScoreMap.get(item.id)?.mlReasons ?? [],
      metaLabel: "New arrival",
    }));

  const goats = [...booksWithSignals]
    .filter((item) => item.mustReadCount >= GOAT_MIN_ISSUES && item.feedbackCount >= 2)
    .sort((a, b) => {
      const scoreA = a.mustReadCount * 0.55 + a.recommendationRate * 100 * 0.25 + a.avgEnjoyment * 10 * 0.2;
      const scoreB = b.mustReadCount * 0.55 + b.recommendationRate * 100 * 0.25 + b.avgEnjoyment * 10 * 0.2;
      return scoreB - scoreA;
    })
    .slice(0, 20)
    .map((item) => ({
      ...item,
      mlScore: aiScoreMap.get(item.id)?.mlScore ?? 0,
      mlReasons: aiScoreMap.get(item.id)?.mlReasons ?? [],
      metaLabel: `${Math.round(item.recommendationRate * 100)}% recommend`,
    }));

  const mustReads = [...booksWithSignals]
    .sort((a, b) => b.mustReadCount - a.mustReadCount)
    .filter((item) => item.mustReadCount > 0)
    .slice(0, 20)
    .map((item) => ({
      ...item,
      mlScore: aiScoreMap.get(item.id)?.mlScore ?? 0,
      mlReasons: aiScoreMap.get(item.id)?.mlReasons ?? [],
      metaLabel: item.mustReadCount > 0 ? `${item.mustReadCount} all-time issues` : null,
    }));

  const categories = Array.from(
    booksWithSignals
      .reduce((acc, item) => {
        const list = acc.get(item.category) ?? [];
        list.push(item);
        acc.set(item.category, list);
        return acc;
      }, new Map<string, typeof booksWithSignals>())
      .entries(),
  )
    .map(([categoryKey, items]) => ({
      category: categoryKey,
      books: [...items]
        .sort((a, b) => b.hotIssueCount + b.mustReadCount - (a.hotIssueCount + a.mustReadCount))
        .slice(0, 14)
        .map((item) => ({
          ...item,
          mlScore: aiScoreMap.get(item.id)?.mlScore ?? 0,
          mlReasons: aiScoreMap.get(item.id)?.mlReasons ?? [],
          metaLabel: null,
        })),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));

  // ─── Author rails ───────────────────────────────────────
  const authorMap = new Map<string, typeof booksWithSignals>();
  for (const item of booksWithSignals) {
    const authorKey = (item.author || "").trim();
    if (!authorKey) continue;
    const list = authorMap.get(authorKey) ?? [];
    list.push(item);
    authorMap.set(authorKey, list);
  }

  const authors = Array.from(authorMap.entries())
    .filter(([, items]) => items.length >= 2)
    .map(([authorName, items]) => ({
      author: authorName,
      books: [...items]
        .sort((a, b) => b.hotIssueCount + b.mustReadCount - (a.hotIssueCount + a.mustReadCount))
        .slice(0, 14)
        .map((item) => ({
          ...item,
          mlScore: aiScoreMap.get(item.id)?.mlScore ?? 0,
          mlReasons: aiScoreMap.get(item.id)?.mlReasons ?? [],
          metaLabel: null,
        })),
    }))
    .sort((a, b) => b.books.length - a.books.length)
    .slice(0, 10);

  const personalized = aiModeEnabled ? personalizedRanking.slice(0, 24) : [];

  const children: ChildOption[] = finalChildrenRows.map((item) => ({
    id: item.id,
    name: item.name,
    className: item.className,
    section: item.section,
    organizationId: item.organizationId,
  }));

  const feedbackGivenIssuanceIds = new Set(feedbackGivenRows.map((row) => row.issuanceId));

  const issued = activeIssuanceRows.map((row) => ({
    ...row,
    feedbackPending: false,
  }));

  const recentReturns = returnedRows.map((row) => ({
    ...row,
    feedbackSubmitted: feedbackGivenIssuanceIds.has(row.issuanceId),
  }));

  const feedbackPromptCount = recentReturns.filter((row) => !row.feedbackSubmitted).length;
  const orgLibraries = await db
    .select({ id: library.id, name: library.name, location: library.location })
    .from(library)
    .where(and(eq(library.organizationId, organizationId), eq(library.status, "ACTIVE")));

  return NextResponse.json({
    children,
    selectedChildId,
    selectedLibraryId,
    libraries: orgLibraries,
    canUseAi,
    aiModeEnabled,
    filters: {
      query,
      category,
      availability,
      sort,
    },
    rails: {
      hotThisWeek: uniqBy(hotThisWeek, (item) => item.id),
      newcomers: uniqBy(newcomers, (item) => item.id),
      goats: uniqBy(goats, (item) => item.id),
      mustReads: uniqBy(mustReads, (item) => item.id),
      personalized: uniqBy(personalized, (item) => item.id),
      categories,
      authors,
    },
    catalog,
    issued,
    pendingRequests: pendingRequestRows,
    recentReturns,
    feedbackPromptCount,
    totals: {
      catalog: booksWithSignals.length,
      available: booksWithSignals.filter((item) => item.availableCopies > 0).length,
      issued: booksWithSignals.filter((item) => item.isIssued).length,
      pending: pendingRequestRows.length,
    },
  });
}
