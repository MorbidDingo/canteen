import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child, book, bookCopy, bookIssuance, organizationDevice } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getUserAccessibleDeviceIds } from "@/lib/device-context";

// GET /api/lib-operator/pending-returns — list RETURN_PENDING issuances
export async function GET() {
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
    const organizationId = access.activeOrganizationId!;
    let accessibleLibraryIds: string[] | null = null;

    if (access.membershipRole === "LIB_OPERATOR") {
      const accessibleDeviceIds = await getUserAccessibleDeviceIds({
        organizationId,
        userId: access.actorUserId,
        allowedDeviceTypes: ["LIBRARY"],
      });

      if (accessibleDeviceIds.length === 0) {
        return NextResponse.json({ success: true, pendingReturns: [] });
      }

      const scopedRows = await db
        .select({ libraryId: organizationDevice.libraryId })
        .from(organizationDevice)
        .where(
          and(
            eq(organizationDevice.organizationId, organizationId),
            inArray(organizationDevice.id, accessibleDeviceIds),
          ),
        );

      accessibleLibraryIds = Array.from(
        new Set(
          scopedRows
            .map((row) => row.libraryId)
            .filter((value): value is string => Boolean(value && value.trim())),
        ),
      );

      if (accessibleLibraryIds.length === 0) {
        return NextResponse.json({ success: true, pendingReturns: [] });
      }
    }

    const pendingIssuances = await db
      .select({
        id: bookIssuance.id,
        issuedAt: bookIssuance.issuedAt,
        dueDate: bookIssuance.dueDate,
        updatedAt: bookIssuance.updatedAt,
        fineAmount: bookIssuance.fineAmount,
        bookCopyId: bookIssuance.bookCopyId,
        accessionNumber: bookCopy.accessionNumber,
        bookTitle: book.title,
        bookAuthor: book.author,
        childName: child.name,
        childClassName: child.className,
        childSection: child.section,
      })
      .from(bookIssuance)
      .innerJoin(bookCopy, eq(bookIssuance.bookCopyId, bookCopy.id))
      .innerJoin(book, eq(bookCopy.bookId, book.id))
      .innerJoin(child, eq(bookIssuance.childId, child.id))
      .where(
        and(
          eq(bookIssuance.status, "RETURN_PENDING"),
          eq(bookCopy.organizationId, organizationId),
          accessibleLibraryIds ? inArray(bookCopy.libraryId, accessibleLibraryIds) : undefined,
        ),
      );

    return NextResponse.json({ success: true, pendingReturns: pendingIssuances });
  } catch (error) {
    console.error("[Lib Operator Pending Returns] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
