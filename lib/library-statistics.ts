import { db } from "@/lib/db";
import { book, bookCopy, bookIssuance, child } from "@/lib/db/schema";
import { gte, eq, and, inArray, sql } from "drizzle-orm";

export async function getLibraryStatistics(days: number) {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1);

  // ─── 1. Overview counts ──────────────────────────────
  const allBooks = await db.select().from(book);
  const allCopies = await db.select().from(bookCopy);

  const totalBooks = allBooks.length;
  const totalCopies = allCopies.filter((c) => c.status !== "RETIRED").length;
  const availableCopies = allCopies.filter((c) => c.status === "AVAILABLE").length;
  const issuedCopies = allCopies.filter((c) => c.status === "ISSUED").length;

  // Active issuances (ISSUED or RETURN_PENDING)
  const activeIssuances = await db
    .select()
    .from(bookIssuance)
    .where(inArray(bookIssuance.status, ["ISSUED", "RETURN_PENDING"]));

  const overdueCount = activeIssuances.filter(
    (i) => i.status === "ISSUED" && new Date(i.dueDate) < now,
  ).length;

  // ─── 2. Fines collected (all time from returned) ────
  const returnedIssuances = await db
    .select({
      fineAmount: bookIssuance.fineAmount,
      returnedAt: bookIssuance.returnedAt,
    })
    .from(bookIssuance)
    .where(eq(bookIssuance.status, "RETURNED"));

  const totalFinesCollected = returnedIssuances.reduce(
    (sum, i) => sum + (i.fineAmount ?? 0),
    0,
  );

  // ─── 3. Daily issuance/return trends ─────────────────
  const issuancesInRange = await db
    .select()
    .from(bookIssuance)
    .where(gte(bookIssuance.createdAt, startDate));

  const dailyMap = new Map<
    string,
    { date: string; issued: number; returned: number; fines: number }
  >();

  for (let d = 0; d < days; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    if (date > now) break;
    const key = date.toISOString().split("T")[0];
    dailyMap.set(key, { date: key, issued: 0, returned: 0, fines: 0 });
  }

  for (const iss of issuancesInRange) {
    const issuedKey = new Date(iss.issuedAt).toISOString().split("T")[0];
    const day = dailyMap.get(issuedKey);
    if (day) day.issued++;

    if (iss.returnedAt) {
      const returnedKey = new Date(iss.returnedAt).toISOString().split("T")[0];
      const rDay = dailyMap.get(returnedKey);
      if (rDay) {
        rDay.returned++;
        rDay.fines += iss.fineAmount ?? 0;
      }
    }
  }

  const dailyTrends = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  // ─── 4. Category distribution ────────────────────────
  const categoryMap = new Map<string, number>();
  for (const b of allBooks) {
    categoryMap.set(b.category, (categoryMap.get(b.category) || 0) + 1);
  }
  const categoryDistribution = Array.from(categoryMap.entries()).map(
    ([category, count]) => ({ category, count }),
  );

  // ─── 5. Most popular books (top 10) ──────────────────
  const allIssuances = await db
    .select({
      bookCopyId: bookIssuance.bookCopyId,
    })
    .from(bookIssuance);

  // Map copyId → bookId
  const copyToBook = new Map<string, string>();
  for (const c of allCopies) {
    copyToBook.set(c.id, c.bookId);
  }

  const bookIssueCount = new Map<string, number>();
  for (const iss of allIssuances) {
    const bookId = copyToBook.get(iss.bookCopyId);
    if (bookId) {
      bookIssueCount.set(bookId, (bookIssueCount.get(bookId) || 0) + 1);
    }
  }

  const bookMap = new Map(allBooks.map((b) => [b.id, b]));
  const popularBooks = Array.from(bookIssueCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([bookId, issueCount]) => {
      const b = bookMap.get(bookId);
      return {
        bookId,
        title: b?.title ?? "Unknown",
        author: b?.author ?? "Unknown",
        category: b?.category ?? "GENERAL",
        issueCount,
      };
    });

  // ─── 6. Class-wise issuance ──────────────────────────
  const childrenData = await db
    .select({ id: child.id, className: child.className })
    .from(child);

  const childClassMap = new Map(childrenData.map((c) => [c.id, c.className]));

  const classIssueCount = new Map<string, number>();
  const allIssuancesFull = await db.select().from(bookIssuance);
  for (const iss of allIssuancesFull) {
    const cls = childClassMap.get(iss.childId) || "Unknown";
    classIssueCount.set(cls, (classIssueCount.get(cls) || 0) + 1);
  }

  const classWiseIssuance = Array.from(classIssueCount.entries())
    .map(([className, count]) => ({ className, count }))
    .sort((a, b) => b.count - a.count);

  // ─── 7. Frequent visitors (top 10) ───────────────────
  const childIssueCount = new Map<string, number>();
  for (const iss of allIssuancesFull) {
    childIssueCount.set(iss.childId, (childIssueCount.get(iss.childId) || 0) + 1);
  }

  const childMap = new Map(childrenData.map((c) => [c.id, c]));
  const frequentVisitors = Array.from(childIssueCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([childId, count]) => {
      const c = childMap.get(childId);
      return {
        childId,
        name: "Unknown",
        className: c?.className ?? "Unknown",
        issueCount: count,
      };
    });

  // Fetch names for frequent visitors
  if (frequentVisitors.length > 0) {
    const ids = frequentVisitors.map((v) => v.childId);
    const children = await db
      .select({ id: child.id, name: child.name })
      .from(child)
      .where(inArray(child.id, ids));
    const nameMap = new Map(children.map((c) => [c.id, c.name]));
    for (const v of frequentVisitors) {
      v.name = nameMap.get(v.childId) || "Unknown";
    }
  }

  // ─── 8. Overdue report ───────────────────────────────
  const overdueIssuances = activeIssuances.filter(
    (i) => i.status === "ISSUED" && new Date(i.dueDate) < now,
  );

  const overdueReport = [];
  for (const iss of overdueIssuances.slice(0, 50)) {
    const copy = allCopies.find((c) => c.id === iss.bookCopyId);
    const bk = copy ? bookMap.get(copy.bookId) : null;
    const ch = childMap.get(iss.childId);
    const overdueDays = Math.floor(
      (now.getTime() - new Date(iss.dueDate).getTime()) / (1000 * 60 * 60 * 24),
    );

    overdueReport.push({
      issuanceId: iss.id,
      bookTitle: bk?.title ?? "Unknown",
      accessionNumber: copy?.accessionNumber ?? "Unknown",
      childName: ch ? "Unknown" : "Unknown",
      childId: iss.childId,
      className: ch?.className ?? "Unknown",
      dueDate: iss.dueDate,
      overdueDays,
    });
  }

  // Fetch child names for overdue report
  if (overdueReport.length > 0) {
    const ids = [...new Set(overdueReport.map((r) => r.childId))];
    const children = await db
      .select({ id: child.id, name: child.name })
      .from(child)
      .where(inArray(child.id, ids));
    const nameMap = new Map(children.map((c) => [c.id, c.name]));
    for (const r of overdueReport) {
      r.childName = nameMap.get(r.childId) || "Unknown";
    }
  }

  // ─── 9. Reissue rate ────────────────────────────────
  const totalIssuanceCount = allIssuancesFull.length;
  const reissuedCount = allIssuancesFull.filter((i) => i.reissueCount > 0).length;
  const reissueRate =
    totalIssuanceCount > 0
      ? Math.round((reissuedCount / totalIssuanceCount) * 100)
      : 0;

  // ─── 10. Average hold duration ───────────────────────
  const returnedWithDates = allIssuancesFull.filter((i) => i.returnedAt);
  const avgHoldDays =
    returnedWithDates.length > 0
      ? Math.round(
          returnedWithDates.reduce((sum, i) => {
            const hold =
              (new Date(i.returnedAt!).getTime() - new Date(i.issuedAt).getTime()) /
              (1000 * 60 * 60 * 24);
            return sum + hold;
          }, 0) / returnedWithDates.length,
        )
      : 0;

  return {
    overview: {
      totalBooks,
      totalCopies,
      availableCopies,
      issuedCopies,
      overdueCount,
      totalFinesCollected,
    },
    dailyTrends,
    categoryDistribution,
    popularBooks,
    classWiseIssuance,
    frequentVisitors,
    overdueReport,
    reissueRate,
    avgHoldDays,
  };
}
