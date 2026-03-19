import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { child } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";

// POST /api/lib-operator/lookup-student — look up student by RFID
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
    const { rfidCardId } = (await request.json()) as { rfidCardId: string };

    if (!rfidCardId) {
      return NextResponse.json(
        { success: false, reason: "Missing RFID card ID" },
        { status: 400 }
      );
    }

    const children = await db
      .select()
      .from(child)
      .where(eq(child.rfidCardId, rfidCardId))
      .limit(1);

    if (children.length === 0) {
      return NextResponse.json(
        { success: false, reason: "Unknown card." },
        { status: 200 }
      );
    }

    const studentChild = children[0];

    return NextResponse.json({
      success: true,
      child: {
        id: studentChild.id,
        name: studentChild.name,
        className: studentChild.className,
        section: studentChild.section,
        grNumber: studentChild.grNumber,
        image: studentChild.image,
      },
    });
  } catch (error) {
    console.error("[Lib Operator Lookup Student] Error:", error);
    return NextResponse.json(
      { success: false, reason: "Internal server error" },
      { status: 500 }
    );
  }
}
