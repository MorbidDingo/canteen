import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy, bookIssuance, child } from "@/lib/db/schema";
import { AccessDeniedError, requireLinkedAccount } from "@/lib/auth-server";
import { and, eq, inArray, asc } from "drizzle-orm";

const ACTIVE_STATUSES = ["ISSUED", "OVERDUE", "RETURN_PENDING"] as const;

// GET /api/library/insights
// Returns library insights: overdue books, due-soon alerts, and reading stats.
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

  // Fetch all children for this parent
  const children = await db
    .select({ id: child.id, name: child.name })
    .from(child)
    .where(eq(child.parentId, userId));

  if (children.length === 0) {
    return NextResponse.json({ alerts: [], stats: null });
  }

  const childIds = children.map((c) => c.id);
  const childNameById = new Map(children.map((c) => [c.id, c.name]));

  // Fetch all active issuances
  const activeIssuances = await db
    .select({
      id: bookIssuance.id,
      childId: bookIssuance.childId,
      status: bookIssuance.status,
      dueDate: bookIssuance.dueDate,
      issuedAt: bookIssuance.issuedAt,
      bookTitle: book.title,
      bookAuthor: book.author,
    })
    .from(bookIssuance)
    .innerJoin(bookCopy, eq(bookCopy.id, bookIssuance.bookCopyId))
    .innerJoin(book, eq(book.id, bookCopy.bookId))
    .where(
      and(
        inArray(bookIssuance.childId, childIds),
        inArray(bookIssuance.status, [...ACTIVE_STATUSES]),
      ),
    )
    .orderBy(asc(bookIssuance.dueDate));

  // Reading stats: total books read in last 30 days and all time
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const allReturned = await db
    .select({
      id: bookIssuance.id,
      childId: bookIssuance.childId,
      returnedAt: bookIssuance.returnedAt,
    })
    .from(bookIssuance)
    .where(
      and(
        inArray(bookIssuance.childId, childIds),
        eq(bookIssuance.status, "RETURNED"),
      ),
    );

  const totalBooksRead = allReturned.length;
  const booksReadThisMonth = allReturned.filter(
    (r) => r.returnedAt && r.returnedAt >= thirtyDaysAgo,
  ).length;

  // Build alerts
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  type Alert = {
    id: string;
    type: "OVERDUE" | "DUE_SOON";
    severity: "HIGH" | "MEDIUM" | "LOW";
    message: string;
    childName: string;
    bookTitle: string;
    dueDate: string;
  };

  const alerts: Alert[] = [];

  for (const issuance of activeIssuances) {
    const childName = childNameById.get(issuance.childId) ?? "Your child";
    const dueDate = new Date(issuance.dueDate);
    const isOverdue = issuance.status === "OVERDUE" || dueDate < now;
    const isDueSoon = !isOverdue && dueDate <= threeDaysFromNow;

    if (isOverdue) {
      const daysOverdue = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      alerts.push({
        id: issuance.id,
        type: "OVERDUE",
        severity: daysOverdue > 7 ? "HIGH" : "MEDIUM",
        message: `"${issuance.bookTitle}" is overdue by ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} — please return it soon.`,
        childName,
        bookTitle: issuance.bookTitle,
        dueDate: dueDate.toISOString(),
      });
    } else if (isDueSoon) {
      const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      alerts.push({
        id: issuance.id,
        type: "DUE_SOON",
        severity: "LOW",
        message: `"${issuance.bookTitle}" is due in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.`,
        childName,
        bookTitle: issuance.bookTitle,
        dueDate: dueDate.toISOString(),
      });
    }
  }

  return NextResponse.json({
    alerts,
    stats: {
      totalBooksRead,
      booksReadThisMonth,
      currentlyBorrowed: activeIssuances.length,
    },
  });
}
