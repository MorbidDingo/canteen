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
import { broadcast } from "@/lib/sse";
import { LIBRARY_SETTINGS_DEFAULTS, CERTE_PLUS } from "@/lib/constants";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { notifyParentForChild } from "@/lib/parent-notifications";
import { resolveChildByRfid } from "@/lib/rfid-access";

async function getSetting(key: string, organizationId: string): Promise<string> {
  const rows = await db
    .select({ value: librarySetting.value })
    .from(librarySetting)
    .where(and(eq(librarySetting.key, key), eq(librarySetting.organizationId, organizationId)))
    .limit(1);
  return rows[0]?.value ?? LIBRARY_SETTINGS_DEFAULTS[key] ?? "";
}

// POST /api/library/return — return a book (accession# + RFID for verification)
export async function POST(request: NextRequest) {
  try {
    const requestOrgId =
      request.headers.get("x-organization-id")?.trim() ||
      request.headers.get("x-org-id")?.trim() ||
      request.cookies.get("activeOrganizationId")?.value?.trim() ||
      null;

    if (!requestOrgId) {
      return NextResponse.json({ success: false, reason: "Organization context is required" }, { status: 400 });
    }

    const body = await request.json();
    const { rfidCardId, scanInput } = body as {
      rfidCardId: string;
      scanInput: string;
    };

    if (!rfidCardId || !scanInput) {
      return NextResponse.json(
        { success: false, reason: "Missing RFID card or book scan input" },
        { status: 400 }
      );
    }

    // ── 1. Look up child by RFID ─────────────────────
    const resolved = await resolveChildByRfid(rfidCardId, requestOrgId);
    if (!resolved) {
      return NextResponse.json(
        { success: false, reason: "Unknown card." },
        { status: 200 }
      );
    }

    const children = await db
      .select()
      .from(child)
      .where(and(eq(child.id, resolved.child.id), eq(child.organizationId, requestOrgId)))
      .limit(1);

    if (children.length === 0) {
      return NextResponse.json(
        { success: false, reason: "Unknown card." },
        { status: 200 }
      );
    }

    const studentChild = children[0];

    // ── 2. Look up book copy ─────────────────────────
    // Try accession number first, then ISBN
    let resolvedCopy: typeof bookCopy.$inferSelect | null = null;

    const copyByAccession = await db
      .select()
      .from(bookCopy)
      .where(and(eq(bookCopy.accessionNumber, scanInput), eq(bookCopy.organizationId, requestOrgId)))
      .limit(1);

    if (copyByAccession.length > 0) {
      resolvedCopy = copyByAccession[0];
    } else {
      // ISBN fallback — find the copy that this child has issued
      const issuanceByIsbn = await db
        .select({ copyId: bookIssuance.bookCopyId })
        .from(bookIssuance)
        .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
        .innerJoin(book, eq(bookCopy.bookId, book.id))
        .where(
          and(
            eq(bookIssuance.childId, studentChild.id),
            eq(book.isbn, scanInput),
            eq(bookCopy.organizationId, requestOrgId),
            eq(book.organizationId, requestOrgId),
            eq(bookIssuance.status, "ISSUED")
          )
        )
        .limit(1);

      if (issuanceByIsbn.length > 0) {
        const copies = await db
          .select()
          .from(bookCopy)
          .where(and(eq(bookCopy.id, issuanceByIsbn[0].copyId), eq(bookCopy.organizationId, requestOrgId)))
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

    // ── 3. Find active issuance for this copy ────────
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

    if (issuances.length === 0) {
      return NextResponse.json(
        { success: false, reason: "This book does not have an active issuance." },
        { status: 200 }
      );
    }

    const issuance = issuances[0];

    // ── 4. Verify RFID matches the child ─────────────
    if (issuance.childId !== studentChild.id) {
      return NextResponse.json(
        { success: false, reason: "This book is not issued to you. You cannot return someone else's book." },
        { status: 200 }
      );
    }

    // ── 5. Calculate fine if overdue ─────────────────
    const now = new Date();
    let fineAmount = 0;
    let fineModeApplied: "NONE" | "DAY" | "WEEK" = "NONE";

    if (now > new Date(issuance.dueDate)) {
      const overdueDays = Math.ceil(
        (now.getTime() - new Date(issuance.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      const fineMode = (await getSetting("fine_mode", requestOrgId)).toUpperCase() === "WEEK" ? "WEEK" : "DAY";
      const finePerDay = parseFloat(await getSetting("fine_per_day", requestOrgId)) || 0;
      const finePerWeek = parseFloat(await getSetting("fine_per_week", requestOrgId)) || 0;
      const maxFine = parseFloat(await getSetting("max_fine_per_book", requestOrgId)) || 100;

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

    // ── 6. Check operator confirmation requirement ───
    const requireConfirmation = await getSetting("require_operator_return_confirmation", requestOrgId);

    // Get the book info for the response
    const bookInfo = await db
      .select({ title: book.title, author: book.author })
      .from(book)
      .where(and(eq(book.id, resolvedCopy.bookId), eq(book.organizationId, requestOrgId)))
      .limit(1);

    if (requireConfirmation === "true") {
      // Set to RETURN_PENDING — operator must confirm
      await db
        .update(bookIssuance)
        .set({
          status: "RETURN_PENDING",
          fineAmount,
          updatedAt: now,
        })
        .where(eq(bookIssuance.id, issuance.id));

      broadcast("library-updated");

      await notifyParentForChild({
        childId: studentChild.id,
        type: "LIBRARY_RETURN",
        title: `${studentChild.name} submitted a library return`,
        message: `Return requested: ${bookInfo[0]?.title ?? "Book"} (${resolvedCopy.accessionNumber}).`,
        metadata: {
          issuanceId: issuance.id,
          status: "RETURN_PENDING",
          fineAmount,
          fineModeApplied,
          bookTitle: bookInfo[0]?.title,
          accessionNumber: resolvedCopy.accessionNumber,
        },
      });

      await logAudit({
        organizationId: requestOrgId,
        userId: studentChild.id,
        userRole: "STUDENT",
        action: AUDIT_ACTIONS.BOOK_RETURNED,
        details: {
          issuanceId: issuance.id,
          bookTitle: bookInfo[0]?.title,
          accessionNumber: resolvedCopy.accessionNumber,
          childId: studentChild.id,
          status: "RETURN_PENDING",
          fineAmount,
          fineModeApplied,
        },
      });

      return NextResponse.json({
        success: true,
        status: "RETURN_PENDING",
        message: "Return requested — please drop the book at the return desk.",
        fineAmount,
        fineModeApplied,
        bookTitle: bookInfo[0]?.title,
        bookAuthor: bookInfo[0]?.author,
        accessionNumber: resolvedCopy.accessionNumber,
      });
    }

    // ── 7. Finalize return ───────────────────────────
    await db
      .update(bookIssuance)
      .set({
        status: "RETURNED",
        returnedAt: now,
        fineAmount,
        fineDeducted: fineAmount > 0,
        updatedAt: now,
      })
      .where(eq(bookIssuance.id, issuance.id));

    await db
      .update(bookCopy)
      .set({ status: "AVAILABLE", updatedAt: now })
      .where(and(eq(bookCopy.id, resolvedCopy.id), eq(bookCopy.organizationId, requestOrgId)));

    await db
      .update(book)
      .set({
        availableCopies: sql`${book.availableCopies} + 1`,
        updatedAt: now,
      })
      .where(and(eq(book.id, resolvedCopy.bookId), eq(book.organizationId, requestOrgId)));

    // ── 8. Deduct fine from wallet if applicable (with Certe+ penalty allowance) ─────
    let fineDeducted = false;
    if (fineAmount > 0) {
      // Check Certe+ penalty allowance
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
          fineDeducted = true;
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

    broadcast("library-updated");

    await notifyParentForChild({
      childId: studentChild.id,
      type: "LIBRARY_RETURN",
      title: `${studentChild.name} returned a library book`,
      message: `Returned: ${bookInfo[0]?.title ?? "Book"} (${resolvedCopy.accessionNumber}).`,
      metadata: {
        issuanceId: issuance.id,
        status: "RETURNED",
        fineAmount,
        fineModeApplied,
        fineDeducted,
        bookTitle: bookInfo[0]?.title,
        accessionNumber: resolvedCopy.accessionNumber,
      },
    });

    await logAudit({
      organizationId: requestOrgId,
      userId: studentChild.id,
      userRole: "STUDENT",
      action: AUDIT_ACTIONS.BOOK_RETURNED,
      details: {
        issuanceId: issuance.id,
        bookTitle: bookInfo[0]?.title,
        accessionNumber: resolvedCopy.accessionNumber,
        childId: studentChild.id,
        status: "RETURNED",
        fineAmount,
        fineModeApplied,
        fineDeducted,
      },
    });

    if (fineAmount > 0 && fineDeducted) {
      await logAudit({
        organizationId: requestOrgId,
        userId: studentChild.id,
        userRole: "STUDENT",
        action: AUDIT_ACTIONS.LIBRARY_FINE_DEDUCTED,
        details: {
          issuanceId: issuance.id,
          bookTitle: bookInfo[0]?.title,
          childId: studentChild.id,
          fineAmount,
        },
      });
    }

    return NextResponse.json({
      success: true,
      status: "RETURNED",
      message: "Book returned successfully!",
      fineAmount,
      fineDeducted,
      fineModeApplied,
      bookTitle: bookInfo[0]?.title,
      bookAuthor: bookInfo[0]?.author,
      accessionNumber: resolvedCopy.accessionNumber,
    });
  } catch (error) {
    console.error("[Library Return] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}

