import { NextRequest, NextResponse } from "next/server";
import { AccessDeniedError, requireAccess } from "@/lib/auth-server";
import {
  getDemandForecast,
  getRevenueTrendAnalysis,
  getItemPerformanceScores,
  getWasteAnalysis,
  getCustomerSegmentation,
  getOptimalPrepQuantities,
} from "@/lib/ml/admin-insights";

export async function GET(request: NextRequest) {
  try {
    const access = await requireAccess({
      scope: "organization",
      allowedOrgRoles: ["OWNER", "MANAGEMENT", "ADMIN"],
    });

    if (access.deviceLoginProfile) {
      return NextResponse.json(
        {
          error:
            "Insights are not available on terminal device accounts",
          code: "TERMINAL_LOCKED",
        },
        { status: 403 },
      );
    }

    const orgId = access.activeOrganizationId!;
    const { searchParams } = new URL(request.url);
    const days = Math.min(
      Math.max(Number(searchParams.get("days")) || 30, 1),
      365,
    );

    const [
      demandForecast,
      revenueTrends,
      itemPerformance,
      wasteAnalysis,
      customerSegments,
      optimalPrep,
    ] = await Promise.all([
      getDemandForecast(orgId, days).catch(() => []),
      getRevenueTrendAnalysis(orgId, days).catch(() => null),
      getItemPerformanceScores(orgId, days).catch(() => []),
      getWasteAnalysis(orgId, days).catch(() => null),
      getCustomerSegmentation(orgId, days).catch(() => null),
      getOptimalPrepQuantities(orgId).catch(() => []),
    ]);

    return NextResponse.json({
      demandForecast,
      revenueTrends,
      itemPerformance,
      wasteAnalysis,
      customerSegments,
      optimalPrep,
    });
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("Admin insights error:", error);
    return NextResponse.json(
      { error: "Failed to fetch insights" },
      { status: 500 },
    );
  }
}
