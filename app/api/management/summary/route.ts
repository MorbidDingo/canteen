import { NextResponse } from "next/server";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import { getSummary } from "@/lib/statistics";

export async function GET(request: Request) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["MANAGEMENT", "OWNER"],
    });

    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId")?.trim() || null;

    const data = await getSummary({
      organizationId: access.activeOrganizationId!,
      deviceId,
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Management summary error:", error);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
