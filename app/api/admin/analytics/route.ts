import { NextRequest, NextResponse } from "next/server";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getFullAnalytics } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN"],
    });

    if (access.deviceLoginProfile) {
      return NextResponse.json(
        { error: "Analytics controls are not available on terminal device accounts", code: "TERMINAL_LOCKED" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(Number(searchParams.get("days")) || 30, 1), 365);

    const analytics = await getFullAnalytics(days, access.activeOrganizationId!);

    return NextResponse.json(analytics);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
