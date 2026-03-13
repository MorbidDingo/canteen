import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, parentControl, book } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth-server";

// GET /api/controls — get controls for all children
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await db
    .select({
      childId: child.id,
      childName: child.name,
      dailySpendLimit: parentControl.dailySpendLimit,
      perOrderLimit: parentControl.perOrderLimit,
      blockedCategories: parentControl.blockedCategories,
      blockedItemIds: parentControl.blockedItemIds,
      blockedBookCategories: parentControl.blockedBookCategories,
      blockedBookAuthors: parentControl.blockedBookAuthors,
      blockedBookIds: parentControl.blockedBookIds,
      preIssueBookId: parentControl.preIssueBookId,
      preIssueExpiresAt: parentControl.preIssueExpiresAt,
      preIssueDeclinedUntil: parentControl.preIssueDeclinedUntil,
    })
    .from(child)
    .leftJoin(parentControl, eq(parentControl.childId, child.id))
    .where(eq(child.parentId, session.user.id));

  const preIssueIds = results
    .map((r) => r.preIssueBookId)
    .filter((id): id is string => Boolean(id));

  const blockedBookIdSet = new Set<string>();
  for (const row of results) {
    for (const id of safeParseJSON(row.blockedBookIds)) {
      blockedBookIdSet.add(id);
    }
  }

  const allBookIds = Array.from(new Set([...preIssueIds, ...Array.from(blockedBookIdSet)]));
  const books = allBookIds.length
    ? await db
        .select({
          id: book.id,
          title: book.title,
          author: book.author,
          category: book.category,
        })
        .from(book)
        .where(inArray(book.id, allBookIds))
    : [];

  const bookMap = new Map(books.map((b) => [b.id, b]));

  return NextResponse.json(
    results.map((r) => {
      const blockedBookIds = safeParseJSON(r.blockedBookIds);
      return {
        childId: r.childId,
        childName: r.childName,
        dailySpendLimit: r.dailySpendLimit,
        perOrderLimit: r.perOrderLimit,
        blockedCategories: safeParseJSON(r.blockedCategories),
        blockedItemIds: safeParseJSON(r.blockedItemIds),
        blockedBookCategories: safeParseJSON(r.blockedBookCategories),
        blockedBookAuthors: safeParseJSON(r.blockedBookAuthors),
        blockedBookIds,
        blockedBooks: blockedBookIds
          .map((id) => bookMap.get(id))
          .filter((b): b is NonNullable<typeof b> => Boolean(b)),
        preIssueBookId: r.preIssueBookId,
        preIssueExpiresAt: r.preIssueExpiresAt,
        preIssueDeclinedUntil: r.preIssueDeclinedUntil,
        preIssueBook: r.preIssueBookId ? bookMap.get(r.preIssueBookId) ?? null : null,
      };
    })
  );
}

// PUT /api/controls — update controls for a specific child
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    childId,
    dailySpendLimit,
    perOrderLimit,
    blockedCategories,
    blockedItemIds,
    blockedBookCategories,
    blockedBookAuthors,
    blockedBookIds,
    preIssueBookId,
  } = body;

  if (!childId) {
    return NextResponse.json({ error: "childId required" }, { status: 400 });
  }

  // Verify ownership
  const children = await db
    .select()
    .from(child)
    .where(eq(child.id, childId))
    .limit(1);

  if (children.length === 0 || children[0].parentId !== session.user.id) {
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  }

  // Check if parent_control exists
  const existing = await db
    .select()
    .from(parentControl)
    .where(eq(parentControl.childId, childId))
    .limit(1);

  const now = new Date();
  const data: {
    dailySpendLimit?: number | null;
    perOrderLimit?: number | null;
    blockedCategories?: string;
    blockedItemIds?: string;
    blockedBookCategories?: string;
    blockedBookAuthors?: string;
    blockedBookIds?: string;
    preIssueBookId?: string | null;
    preIssueExpiresAt?: Date | null;
    preIssueDeclinedUntil?: Date | null;
    updatedAt: Date;
  } = {
    updatedAt: now,
  };

  if ("dailySpendLimit" in body) data.dailySpendLimit = dailySpendLimit ?? null;
  if ("perOrderLimit" in body) data.perOrderLimit = perOrderLimit ?? null;
  if ("blockedCategories" in body) data.blockedCategories = JSON.stringify(blockedCategories || []);
  if ("blockedItemIds" in body) data.blockedItemIds = JSON.stringify(blockedItemIds || []);
  if ("blockedBookCategories" in body) {
    data.blockedBookCategories = JSON.stringify(blockedBookCategories || []);
  }
  if ("blockedBookAuthors" in body) {
    data.blockedBookAuthors = JSON.stringify(blockedBookAuthors || []);
  }
  if ("blockedBookIds" in body) {
    data.blockedBookIds = JSON.stringify(blockedBookIds || []);
  }

  const activeDeclineUntil = existing[0]?.preIssueDeclinedUntil ?? null;
  const wantsPreIssue =
    typeof preIssueBookId === "string" && preIssueBookId.trim().length > 0;

  if ("preIssueBookId" in body) {
    if (wantsPreIssue && activeDeclineUntil && activeDeclineUntil > now) {
      return NextResponse.json(
        {
          error:
            "Child declined pre-issue recently. You can request pre-issue again after 12 hours.",
          declinedUntil: activeDeclineUntil,
        },
        { status: 400 }
      );
    }

    if (wantsPreIssue) {
      data.preIssueBookId = preIssueBookId;
      data.preIssueExpiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);
      data.preIssueDeclinedUntil = null;
    } else {
      data.preIssueBookId = null;
      data.preIssueExpiresAt = null;
    }
  }

  if (existing.length > 0) {
    await db
      .update(parentControl)
      .set(data)
      .where(eq(parentControl.childId, childId));
  } else {
    await db.insert(parentControl).values({
      childId,
      ...data,
      blockedCategories: data.blockedCategories ?? "[]",
      blockedItemIds: data.blockedItemIds ?? "[]",
      blockedBookCategories: data.blockedBookCategories ?? "[]",
      blockedBookAuthors: data.blockedBookAuthors ?? "[]",
      blockedBookIds: data.blockedBookIds ?? "[]",
      preIssueBookId: data.preIssueBookId ?? null,
      preIssueExpiresAt: data.preIssueExpiresAt ?? null,
      preIssueDeclinedUntil: data.preIssueDeclinedUntil ?? null,
    });
  }

  return NextResponse.json({ success: true });
}

function safeParseJSON(val: string | null): string[] {
  if (!val) return [];
  try {
    return JSON.parse(val);
  } catch {
    return [];
  }
}
