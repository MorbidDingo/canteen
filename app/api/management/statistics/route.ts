import { NextRequest, NextResponse } from "next/server";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getStatistics } from "@/lib/statistics";

export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["MANAGEMENT", "OWNER"],
    });

    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get("days") || "30";
    const deviceId = searchParams.get("deviceId")?.trim() || null;
    const days = Math.min(Math.max(parseInt(daysParam) || 30, 1), 365);

    const data = await getStatistics({
      days,
      organizationId: access.activeOrganizationId!,
      deviceId,
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Management statistics error:", error);
    return NextResponse.json({ error: "Failed to fetch statistics" }, { status: 500 });
  }
}
