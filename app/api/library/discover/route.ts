import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  book,
  bookCopy,
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

function buildAiRecommendations(params: {
  books: Array<{
    id: string;
    title: string;
    author: string;
    category: string;
    availableCopies: number;
    hotIssueCount: number;
    mustReadCount: number;
    createdAt: Date;
  }>;
  history: Array<{ category: string; author: string }>;
}) {
  const { books, history } = params;

  const categoryAffinity = new Map<string, number>();
  const authorAffinity = new Map<string, number>();

  for (const item of history) {
    categoryAffinity.set(item.category, (categoryAffinity.get(item.category) ?? 0) + 1);
    const authorKey = item.author.trim().toLowerCase();
    authorAffinity.set(authorKey, (authorAffinity.get(authorKey) ?? 0) + 1);
  }

  let maxCategoryAffinity = 0;
  for (const value of categoryAffinity.values()) {
    if (value > maxCategoryAffinity) maxCategoryAffinity = value;
  }

  let maxAuthorAffinity = 0;
  for (const value of authorAffinity.values()) {
    if (value > maxAuthorAffinity) maxAuthorAffinity = value;
  }

  const maxHot = Math.max(...books.map((item) => item.hotIssueCount), 0);
  const maxMustRead = Math.max(...books.map((item) => item.mustReadCount), 0);

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
      const freshnessScore = Math.max(
        0,
        1 - (now - new Date(item.createdAt).getTime()) / ninetyDaysMs,
      );
      const availabilityScore = item.availableCopies > 0 ? 1 : 0;

      const mlScore =
        categoryScore * 0.32 +
        authorScore * 0.18 +
        hotScore * 0.2 +
        mustReadScore * 0.18 +
        freshnessScore * 0.07 +
        availabilityScore * 0.05;

      const reasons: string[] = [];
      if (categoryScore >= 0.5) reasons.push("Matches your reading category trend");
      if (authorScore >= 0.4) reasons.push("Author aligns with your past issues");
      if (hotScore >= 0.5) reasons.push("Hot among currently issued books");
      if (mustReadScore >= 0.5) reasons.push("Most issued all-time must read");
      if (availabilityScore > 0) reasons.push("Ready for kiosk confirmation");
      if (reasons.length === 0) reasons.push("Balanced recommendation from current library trends");

      return {
        ...item,
        mlScore: Math.round(mlScore * 1000) / 1000,
        mlReasons: reasons,
      };
    })
    .sort((a, b) => b.mlScore - a.mlScore);
}

function getChildStats(historyRows: Array<{ status: string; returnedAt: Date | null; category: string }>) {
  const returnedRows = historyRows.filter((row) => row.status === "RETURNED");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisMonthCount = returnedRows.filter(
    (row) => row.returnedAt && new Date(row.returnedAt) >= monthStart,
  ).length;

  const categoryCounts = new Map<string, number>();
  for (const row of returnedRows) {
    categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + 1);
  }

  const favoriteCategory =
    [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    totalBooksRead: returnedRows.length,
    thisMonthCount,
    favoriteCategory,
  };
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
      stats: null,
      issued: [],
      history: [],
      pendingRequests: [],
      rails: {
        hotIssued: [],
        mustReads: [],
        aiPicks: [],
        categories: [],
      },
      catalog: [],
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

  await db
    .update(libraryAppIssueRequest)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(
      and(
        eq(libraryAppIssueRequest.childId, selectedChildId),
        eq(libraryAppIssueRequest.status, "REQUESTED"),
        sql`${libraryAppIssueRequest.expiresAt} <= ${now}`,
      ),
    );

  const [
    controlRow,
    allBooks,
    activeIssuanceRows,
    historyRows,
    pendingRequestRows,
    allIssueCountRows,
    hotIssueCountRows,
    activeSubscription,
    childReadingHistory,
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
        totalCopies: book.totalCopies,
        availableCopies: book.availableCopies,
        createdAt: book.createdAt,
        libraryId: book.libraryId,
        libraryName: library.name,
        libraryLocation: library.location,
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
        returnedAt: bookIssuance.returnedAt,
        reissueCount: bookIssuance.reissueCount,
        fineAmount: bookIssuance.fineAmount,
        accessionNumber: bookCopy.accessionNumber,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        bookCategory: book.category,
        bookCoverUrl: book.coverImageUrl,
        libraryId: book.libraryId,
        libraryName: library.name,
        libraryLocation: library.location,
      })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .innerJoin(book, eq(bookCopy.bookId, book.id))
      .leftJoin(library, eq(book.libraryId, library.id))
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
        reissueCount: bookIssuance.reissueCount,
        fineAmount: bookIssuance.fineAmount,
        accessionNumber: bookCopy.accessionNumber,
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        bookCategory: book.category,
        bookCoverUrl: book.coverImageUrl,
        libraryId: book.libraryId,
        libraryName: library.name,
        libraryLocation: library.location,
      })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .innerJoin(book, eq(bookCopy.bookId, book.id))
      .leftJoin(library, eq(book.libraryId, library.id))
      .where(
        and(
          eq(bookIssuance.childId, selectedChildId),
          eq(book.organizationId, organizationId),
          libraryScopeCondition,
        ),
      )
      .orderBy(desc(bookIssuance.issuedAt))
      .limit(60),
    db
      .select({
        requestId: libraryAppIssueRequest.id,
        status: libraryAppIssueRequest.status,
        expiresAt: libraryAppIssueRequest.expiresAt,
        createdAt: libraryAppIssueRequest.createdAt,
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
      .where(
        and(
          eq(libraryAppIssueRequest.organizationId, organizationId),
          eq(libraryAppIssueRequest.childId, selectedChildId),
          eq(libraryAppIssueRequest.status, "REQUESTED"),
          libraryScopeCondition,
          sql`${libraryAppIssueRequest.expiresAt} > ${now}`,
        ),
      )
      .orderBy(desc(libraryAppIssueRequest.createdAt)),
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
          gte(bookIssuance.issuedAt, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
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

  const issuedByBookId = new Map(
    activeIssuanceRows.map((row) => [
      row.bookId,
      {
        issuanceId: row.issuanceId,
        status: row.status,
        dueDate: row.dueDate,
      },
    ]),
  );

  const pendingByBookId = new Map(
    pendingRequestRows.map((row) => [
      row.bookId,
      {
        requestId: row.requestId,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
      },
    ]),
  );

  const booksWithoutBlocked = allBooks.filter((item) => {
    if (blockedBookIds.has(item.id)) return false;
    if (blockedBookCategories.has(item.category)) return false;
    if (blockedBookAuthors.has((item.author || "").trim().toLowerCase())) return false;
    return true;
  });

  const booksWithSignals = booksWithoutBlocked.map((item) => {
    const issued = issuedByBookId.get(item.id);
    const pending = pendingByBookId.get(item.id);

    return {
      ...item,
      hotIssueCount: hotIssueCountMap.get(item.id) ?? 0,
      mustReadCount: allIssueCountMap.get(item.id) ?? 0,
      isIssued: Boolean(issued),
      issuanceId: issued?.issuanceId ?? null,
      issuedStatus: issued?.status ?? null,
      issuedDueDate: issued?.dueDate ?? null,
      requestId: pending?.requestId ?? null,
      requestExpiresAt: pending?.expiresAt ?? null,
      canRequest:
        item.availableCopies > 0 &&
        !issued &&
        !pending,
    };
  });

  let filteredBooks = booksWithSignals;

  if (query.length >= 2) {
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
  } else if (availability === "PENDING") {
    filteredBooks = filteredBooks.filter((item) => Boolean(item.requestId));
  }

  const canUseAi = activeSubscription.length > 0;
  const aiModeEnabled = aiModeRequested && canUseAi;

  const aiScoredBooks = aiModeEnabled
    ? buildAiRecommendations({
        books: booksWithSignals,
        history: childReadingHistory,
      })
    : booksWithSignals.map((item) => ({ ...item, mlScore: 0, mlReasons: [] as string[] }));

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

  const aiScoreMap = new Map(aiScoredBooks.map((item) => [item.id, item]));
  const catalog = filteredBooks.map((item) => {
    const aiRow = aiScoreMap.get(item.id);
    return {
      ...item,
      mlScore: aiRow?.mlScore ?? 0,
      mlReasons: aiRow?.mlReasons ?? [],
    };
  });

  const hotIssued = [...booksWithSignals]
    .sort((a, b) => b.hotIssueCount - a.hotIssueCount)
    .slice(0, 20)
    .map((item) => ({ ...item, mlScore: aiScoreMap.get(item.id)?.mlScore ?? 0, mlReasons: aiScoreMap.get(item.id)?.mlReasons ?? [] }));

  const mustReads = [...booksWithSignals]
    .sort((a, b) => b.mustReadCount - a.mustReadCount)
    .slice(0, 20)
    .map((item) => ({ ...item, mlScore: aiScoreMap.get(item.id)?.mlScore ?? 0, mlReasons: aiScoreMap.get(item.id)?.mlReasons ?? [] }));

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
        })),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));

  const aiPicks = aiModeEnabled
    ? aiScoredBooks.slice(0, 24)
    : [];

  const children: ChildOption[] = finalChildrenRows.map((item) => ({
    id: item.id,
    name: item.name,
    className: item.className,
    section: item.section,
    organizationId: item.organizationId,
  }));

  // Fetch active libraries for this org
  const orgLibraries = await db
    .select({ id: library.id, name: library.name, location: library.location })
    .from(library)
    .where(and(eq(library.organizationId, organizationId), eq(library.status, "ACTIVE")));

  const stats = getChildStats(
    historyRows.map((row) => ({
      status: row.status,
      returnedAt: row.returnedAt,
      category: row.bookCategory,
    })),
  );

  return NextResponse.json({
    children,
    selectedChildId,
    canUseAi,
    aiModeEnabled,
    libraries: orgLibraries,
    selectedLibraryId,
    filters: {
      query,
      category,
      availability,
      sort,
    },
    stats,
    issued: activeIssuanceRows,
    history: historyRows.filter((row) => !ACTIVE_ISSUANCE_STATUSES.includes(row.status as (typeof ACTIVE_ISSUANCE_STATUSES)[number])),
    pendingRequests: pendingRequestRows,
    rails: {
      hotIssued,
      mustReads,
      aiPicks,
      categories,
    },
    catalog,
    totals: {
      catalog: booksWithSignals.length,
      available: booksWithSignals.filter((item) => item.availableCopies > 0).length,
      issued: booksWithSignals.filter((item) => item.isIssued).length,
      pending: booksWithSignals.filter((item) => Boolean(item.requestId)).length,
    },
  });
}
