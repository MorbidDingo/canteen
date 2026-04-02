import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  child,
  book,
  bookCopy,
  bookIssuance,
  librarySetting,
  wallet,
  walletTransaction,
  certeSubscription,
  certeSubscriptionPenaltyUsage,
} from "@/lib/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { broadcast } from "@/lib/sse";
import { notifyParentForChild } from "@/lib/parent-notifications";
import { LIBRARY_SETTINGS_DEFAULTS, CERTE_PLUS } from "@/lib/constants";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";

async function getSetting(key: string): Promise<string> {
  const rows = await db
    .select({ value: librarySetting.value })
    .from(librarySetting)
    .where(eq(librarySetting.key, key))
    .limit(1);
  return rows[0]?.value ?? LIBRARY_SETTINGS_DEFAULTS[key] ?? "";
}

// POST /api/lib-operator/return — operator confirms book return
export async function POST(request: NextRequest) {
  let access;
  try {
    access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "LIB_OPERATOR"],
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (access.deviceLoginProfile) {
    return NextResponse.json(
      { error: "Library control endpoints are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const { scanInput } = body as { scanInput: string };

    if (!scanInput) {
      return NextResponse.json(
        { success: false, reason: "Missing book scan input" },
        { status: 400 }
      );
    }

    // ── 1. Resolve book copy ─────────────────────────
    let resolvedCopy: typeof bookCopy.$inferSelect | null = null;

    const copyByAccession = await db
      .select()
      .from(bookCopy)
      .where(eq(bookCopy.accessionNumber, scanInput))
      .limit(1);

    if (copyByAccession.length > 0) {
      resolvedCopy = copyByAccession[0];
    } else {
      // ISBN fallback — find the issued copy
      const issuanceByIsbn = await db
        .select({ copyId: bookIssuance.bookCopyId })
        .from(bookIssuance)
        .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
        .innerJoin(book, eq(bookCopy.bookId, book.id))
        .where(
          and(
            eq(book.isbn, scanInput),
            eq(bookIssuance.status, "ISSUED")
          )
        )
        .limit(1);

      if (issuanceByIsbn.length > 0) {
        const copies = await db
          .select()
          .from(bookCopy)
          .where(eq(bookCopy.id, issuanceByIsbn[0].copyId))
          .limit(1);
        resolvedCopy = copies[0] ?? null;
      }
    }

    if (!resolvedCopy) {
      return NextResponse.json(
        { success: false, reason: "Book copy not found." },
        { status: 200 }
      );
    }

    // ── 2. Find active issuance (ISSUED or RETURN_PENDING)
    const issuances = await db
      .select()
      .from(bookIssuance)
      .where(
        and(
          eq(bookIssuance.bookCopyId, resolvedCopy.id),
          eq(bookIssuance.status, "ISSUED")
        )
      )
      .limit(1);

    // Also check RETURN_PENDING
    const pendingIssuances = await db
      .select()
      .from(bookIssuance)
      .where(
        and(
          eq(bookIssuance.bookCopyId, resolvedCopy.id),
          eq(bookIssuance.status, "RETURN_PENDING")
        )
      )
      .limit(1);

    const issuance = issuances[0] ?? pendingIssuances[0];

    if (!issuance) {
      return NextResponse.json(
        { success: false, reason: "No active issuance found for this book." },
        { status: 200 }
      );
    }

    // ── 3. Get child info ────────────────────────────
    const children = await db
      .select()
      .from(child)
      .where(eq(child.id, issuance.childId))
      .limit(1);

    const studentChild = children[0];

    // ── 4. Calculate fine ────────────────────────────
    const now = new Date();
    let fineAmount = 0;
    let fineModeApplied: "NONE" | "DAY" | "WEEK" = "NONE";

    if (now > new Date(issuance.dueDate)) {
      const overdueDays = Math.ceil(
        (now.getTime() - new Date(issuance.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      const fineMode = (await getSetting("fine_mode")).toUpperCase() === "WEEK" ? "WEEK" : "DAY";
      const finePerDay = parseFloat(await getSetting("fine_per_day")) || 0;
      const finePerWeek = parseFloat(await getSetting("fine_per_week")) || 0;
      const maxFine = parseFloat(await getSetting("max_fine_per_book")) || 100;

      if (fineMode === "WEEK") {
        const overdueWeeks = Math.ceil(overdueDays / 7);
        if (finePerWeek > 0) {
          fineAmount = Math.min(overdueWeeks * finePerWeek, maxFine);
          fineModeApplied = "WEEK";
        }
      } else if (finePerDay > 0) {
        fineAmount = Math.min(overdueDays * finePerDay, maxFine);
        fineModeApplied = "DAY";
      }
    }

    // ── 5. Finalize return ───────────────────────────
    await db
      .update(bookIssuance)
      .set({
        status: "RETURNED",
        returnedAt: now,
        returnConfirmedBy: access.actorUserId,
        fineAmount,
        fineDeducted: fineAmount > 0,
        updatedAt: now,
      })
      .where(eq(bookIssuance.id, issuance.id));

    await db
      .update(bookCopy)
      .set({ status: "AVAILABLE", updatedAt: now })
      .where(eq(bookCopy.id, resolvedCopy.id));

    await db
      .update(book)
      .set({
        availableCopies: sql`${book.availableCopies} + 1`,
        updatedAt: now,
      })
      .where(eq(book.id, resolvedCopy.bookId));

    // ── 6. Deduct fine from wallet (with Certe+ penalty allowance) ───────────────────
    let fineDeducted = false;
    if (fineAmount > 0 && studentChild) {
      // Check if parent has Certe+ with remaining penalty allowance
      let fineWaived = false;
      const [activeSub] = await db
        .select({ id: certeSubscription.id })
        .from(certeSubscription)
        .where(
          and(
            eq(certeSubscription.parentId, studentChild.parentId),
            eq(certeSubscription.status, "ACTIVE"),
            gte(certeSubscription.endDate, now),
          ),
        )
        .limit(1);

      if (activeSub) {
        // Use penalty allowance — waive the fine
        const [childUsage] = await db
          .select({
            id: certeSubscriptionPenaltyUsage.id,
            penaltiesUsed: certeSubscriptionPenaltyUsage.penaltiesUsed,
          })
          .from(certeSubscriptionPenaltyUsage)
          .where(
            and(
              eq(certeSubscriptionPenaltyUsage.subscriptionId, activeSub.id),
              eq(certeSubscriptionPenaltyUsage.childId, studentChild.id),
            ),
          )
          .limit(1);

        const usedForChild = childUsage?.penaltiesUsed ?? 0;
        if (usedForChild < CERTE_PLUS.LIBRARY_PENALTY_ALLOWANCE) {
          if (childUsage) {
            await db
              .update(certeSubscriptionPenaltyUsage)
              .set({
                penaltiesUsed: usedForChild + 1,
                updatedAt: now,
              })
              .where(eq(certeSubscriptionPenaltyUsage.id, childUsage.id));
          } else {
            await db.insert(certeSubscriptionPenaltyUsage).values({
              subscriptionId: activeSub.id,
              childId: studentChild.id,
              penaltiesUsed: 1,
              createdAt: now,
              updatedAt: now,
            });
          }

          await db
            .update(certeSubscription)
            .set({ libraryPenaltiesUsed: sql`${certeSubscription.libraryPenaltiesUsed} + 1` })
            .where(eq(certeSubscription.id, activeSub.id));

          fineWaived = true;
          fineDeducted = true; // considered handled
        }
      }

      if (!fineWaived) {
        const wallets = await db
          .select()
          .from(wallet)
          .where(eq(wallet.childId, studentChild.id))
          .limit(1);

        if (wallets.length > 0) {
          const childWallet = wallets[0];
          const deduction = Math.min(fineAmount, childWallet.balance);

          if (deduction > 0) {
            const newBalance = childWallet.balance - deduction;
            await db
              .update(wallet)
              .set({ balance: newBalance, updatedAt: now })
              .where(eq(wallet.id, childWallet.id));

            const bookInfo = await db
              .select({ title: book.title })
              .from(book)
              .where(eq(book.id, resolvedCopy.bookId))
              .limit(1);

            await db.insert(walletTransaction).values({
              walletId: childWallet.id,
              type: "LIBRARY_FINE",
              amount: -deduction,
              balanceAfter: newBalance,
              description: `Overdue fine: ${bookInfo[0]?.title ?? "Unknown book"}`,
            });

            fineDeducted = true;
          }
        }
      }
    }

    // Get book title for response
    const bookInfo = await db
      .select({ title: book.title, author: book.author })
      .from(book)
      .where(eq(book.id, resolvedCopy.bookId))
      .limit(1);

    broadcast("library-updated");

    notifyParentForChild({
      childId: issuance.childId,
      type: "LIBRARY_RETURN",
      title: "Book returned",
      message: `"${bookInfo[0]?.title ?? "A book"}" (${resolvedCopy.accessionNumber}) has been returned${fineAmount > 0 ? ` — fine of ₹${fineAmount} ${fineDeducted ? "deducted from wallet" : "applied"}` : ""}.`,
      metadata: {
        issuanceId: issuance.id,
        bookTitle: bookInfo[0]?.title,
        accessionNumber: resolvedCopy.accessionNumber,
        fineAmount,
        fineDeducted,
      },
    }).catch(() => {});

    await logAudit({
      organizationId: access.activeOrganizationId,
      userId: access.actorUserId,
      userRole: access.membershipRole || "LIB_OPERATOR",
      action: AUDIT_ACTIONS.RETURN_CONFIRMED,
      details: {
        issuanceId: issuance.id,
        bookTitle: bookInfo[0]?.title,
        accessionNumber: resolvedCopy.accessionNumber,
        childName: studentChild?.name,
        childId: issuance.childId,
        fineAmount,
        fineDeducted,
      },
      request,
    });

    if (fineAmount > 0 && fineDeducted) {
      await logAudit({
        organizationId: access.activeOrganizationId,
        userId: access.actorUserId,
        userRole: access.membershipRole || "LIB_OPERATOR",
        action: AUDIT_ACTIONS.LIBRARY_FINE_DEDUCTED,
        details: {
          issuanceId: issuance.id,
          bookTitle: bookInfo[0]?.title,
          childId: issuance.childId,
          fineAmount,
        },
        request,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Book returned successfully!",
      bookTitle: bookInfo[0]?.title,
      bookAuthor: bookInfo[0]?.author,
      accessionNumber: resolvedCopy.accessionNumber,
      childName: studentChild?.name,
      className: studentChild?.className,
      fineAmount,
      fineDeducted,
      wasOverdue: fineAmount > 0,
      fineModeApplied,
    });
  } catch (error) {
    console.error("[Lib Operator Return] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}

