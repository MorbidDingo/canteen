import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, parentControl, book } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { broadcast } from "@/lib/sse";

// POST /api/library/pre-issue-response
// Body: { rfidCardId: string, accepted: boolean }
export async function POST(request: NextRequest) {
  try {
    const { rfidCardId, accepted } = (await request.json()) as {
      rfidCardId: string;
      accepted: boolean;
    };

    if (!rfidCardId || typeof accepted !== "boolean") {
      return NextResponse.json(
        { success: false, reason: "Missing RFID card or response" },
        { status: 400 }
      );
    }

    const children = await db
      .select({
        id: child.id,
        name: child.name,
        preIssueBookId: parentControl.preIssueBookId,
        preIssueExpiresAt: parentControl.preIssueExpiresAt,
      })
      .from(child)
      .leftJoin(parentControl, eq(parentControl.childId, child.id))
      .where(eq(child.rfidCardId, rfidCardId))
      .limit(1);

    if (children.length === 0) {
      return NextResponse.json(
        { success: false, reason: "Unknown card" },
        { status: 200 }
      );
    }

    const student = children[0];
    if (!student.preIssueBookId || !student.preIssueExpiresAt) {
      return NextResponse.json(
        { success: false, reason: "No active pre-issue request found" },
        { status: 200 }
      );
    }

    const now = new Date();
    if (new Date(student.preIssueExpiresAt) <= now) {
      await db
        .update(parentControl)
        .set({ preIssueBookId: null, preIssueExpiresAt: null, updatedAt: now })
        .where(eq(parentControl.childId, student.id));

      return NextResponse.json({
        success: false,
        reason: "Pre-issue request expired",
      });
    }

    if (accepted) {
      const books = await db
        .select({ id: book.id, title: book.title })
        .from(book)
        .where(eq(book.id, student.preIssueBookId))
        .limit(1);

      return NextResponse.json({
        success: true,
        accepted: true,
        preIssueBookId: student.preIssueBookId,
        preIssueBookTitle: books[0]?.title ?? "Requested Book",
      });
    }

    await db
      .update(parentControl)
      .set({
        preIssueBookId: null,
        preIssueExpiresAt: null,
        preIssueDeclinedUntil: new Date(now.getTime() + 12 * 60 * 60 * 1000),
        updatedAt: now,
      })
      .where(eq(parentControl.childId, student.id));

    broadcast("library-updated");

    return NextResponse.json({
      success: true,
      accepted: false,
      message:
        "Okay. You cannot issue a book right now. Please try again after 12 hours.",
    });
  } catch (error) {
    console.error("[Library Pre-Issue Response] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
