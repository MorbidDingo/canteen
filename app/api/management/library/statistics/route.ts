import { NextRequest, NextResponse } from "next/server";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getLibraryStatistics } from "@/lib/library-statistics";

export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["MANAGEMENT", "OWNER"],
    });

    const { searchParams } = new URL(request.url);
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") || "30")));
    const deviceId = searchParams.get("deviceId")?.trim() || null;

    const stats = await getLibraryStatistics({
      days,
      organizationId: access.activeOrganizationId!,
      deviceId,
    });
    return NextResponse.json(stats);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Library statistics error:", error);
    return NextResponse.json({ error: "Failed to fetch statistics" }, { status: 500 });
  }
}
