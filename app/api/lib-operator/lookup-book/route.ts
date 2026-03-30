import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { book, bookCopy, organizationDevice } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getUserAccessibleDeviceIds } from "@/lib/device-context";

// POST /api/lib-operator/lookup-book — look up book by accession# or ISBN
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
    const organizationId = access.activeOrganizationId!;
    const accessibleDeviceIds =
      access.membershipRole === "LIB_OPERATOR"
        ? await getUserAccessibleDeviceIds({
            organizationId,
            userId: access.actorUserId,
            allowedDeviceTypes: ["LIBRARY"],
          })
        : null;

    let accessibleLibraryIds: string[] | null = null;
    if (accessibleDeviceIds) {
      if (accessibleDeviceIds.length === 0) {
        return NextResponse.json({ success: false, reason: "No assigned libraries." }, { status: 403 });
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
        return NextResponse.json({ success: false, reason: "No assigned libraries." }, { status: 403 });
      }
    }

    const { scanInput } = (await request.json()) as { scanInput: string };

    if (!scanInput) {
      return NextResponse.json(
        { success: false, reason: "Missing scan input" },
        { status: 400 }
      );
    }

    // Try accession number first
    const copies = await db
      .select()
      .from(bookCopy)
      .where(
        and(
          eq(bookCopy.accessionNumber, scanInput),
          eq(bookCopy.organizationId, organizationId),
          accessibleLibraryIds ? inArray(bookCopy.libraryId, accessibleLibraryIds) : undefined,
        ),
      )
      .limit(1);

    if (copies.length > 0) {
      const copy = copies[0];
      const books = await db
        .select()
        .from(book)
        .where(
          and(
            eq(book.id, copy.bookId),
            eq(book.organizationId, organizationId),
          ),
        )
        .limit(1);

      return NextResponse.json({
        success: true,
        book: books[0] ?? null,
        copy,
      });
    }

    // Try ISBN
    const booksByIsbn = await db
      .select()
      .from(book)
      .where(
        and(
          eq(book.isbn, scanInput),
          eq(book.organizationId, organizationId),
          accessibleLibraryIds ? inArray(book.libraryId, accessibleLibraryIds) : undefined,
        ),
      )
      .limit(1);

    if (booksByIsbn.length > 0) {
      const matchedBook = booksByIsbn[0];
      // Get first available copy
      const availableCopies = await db
        .select()
        .from(bookCopy)
        .where(
          and(
            eq(bookCopy.bookId, matchedBook.id),
            eq(bookCopy.organizationId, organizationId),
            accessibleLibraryIds ? inArray(bookCopy.libraryId, accessibleLibraryIds) : undefined,
          )
        )
        .limit(10);

      return NextResponse.json({
        success: true,
        book: matchedBook,
        copy: availableCopies.find((c) => c.status === "AVAILABLE") ?? availableCopies[0] ?? null,
        allCopies: availableCopies,
      });
    }

    return NextResponse.json(
      { success: false, reason: "Book not found." },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Lib Operator Lookup Book] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
