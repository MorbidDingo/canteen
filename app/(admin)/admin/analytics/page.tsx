"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  BarChart3,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Target,
  Users,
  Trash2,
  Zap,
  Star,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";

/* ---------- types matching lib/ml/admin-insights.ts ---------- */

type PrepAction = "INCREASE" | "DECREASE" | "MAINTAIN";
type PerformanceTier =
  | "STAR"
  | "GROWING"
  | "STABLE"
  | "DECLINING"
  | "UNDERPERFORMING";
type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

interface DemandForecastItem {
  menuItemId: string;
  name: string;
  category: string;
  forecastQty: number;
  confidenceLow: number;
  confidenceHigh: number;
  action: PrepAction;
  recentAvg: number;
  dayOfWeekFactor: number;
}

interface RevenueAnomaly {
  date: string;
  revenue: number;
  zScore: number;
  type: "SPIKE" | "DIP";
}

interface RevenueTrendAnalysis {
  dailyRevenue: {
    date: string;
    revenue: number;
    ma7: number | null;
    ma30: number | null;
  }[];
  growthRate7d: number;
  growthRate30d: number;
  anomalies: RevenueAnomaly[];
  projectedRevenue: { date: string; projected: number }[];
  totalRevenue: number;
  avgDailyRevenue: number;
}

interface ItemPerformanceScore {
  menuItemId: string;
  name: string;
  category: string;
  score: number;
  tier: PerformanceTier;
  breakdown: {
    salesVolume: number;
    revenueContribution: number;
    growthTrend: number;
    customerSatisfaction: number;
    cancellationRateInverse: number;
  };
  totalSold: number;
  totalRevenue: number;
  avgRating: number | null;
  cancellationRate: number;
}

interface WasteAnalysis {
  topCancelledItems: {
    menuItemId: string;
    name: string;
    category: string;
    cancelledQty: number;
    cancelRate: number;
    estimatedRevenueLost: number;
  }[];
  cancellationByHour: { hour: number; count: number }[];
  cancellationByDay: { day: number; dayName: string; count: number }[];
  totalCancelled: number;
  totalRevenueLost: number;
  topReasons: { reason: string; count: number; percentage: number }[];
  patterns: { type: string; message: string; severity: string }[];
}

interface CustomerSegmentInfo {
  segment: string;
  count: number;
  avgOrderValue: number;
  avgOrderFrequency: number;
  totalRevenue: number;
}

interface CustomerSegmentationResult {
  segments: CustomerSegmentInfo[];
  totalCustomers: number;
  highlights: string[];
}

interface OptimalPrepItem {
  menuItemId: string;
  name: string;
  category: string;
  optimalQty: number;
  confidence: ConfidenceLevel;
  currentStock: number;
  prepNeeded: number;
  breakdown: {
    baseAvg: number;
    dayOfWeekAdj: number;
    trendAdj: number;
    safetyBuffer: number;
  };
}

interface InsightsData {
  demandForecast: DemandForecastItem[];
  revenueTrends: RevenueTrendAnalysis | null;
  itemPerformance: ItemPerformanceScore[];
  wasteAnalysis: WasteAnalysis | null;
  customerSegments: CustomerSegmentationResult | null;
  optimalPrep: OptimalPrepItem[];
}

/* ---------- helpers ---------- */

function fmt(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function ActionIcon({ action }: { action: PrepAction }) {
  switch (action) {
    case "INCREASE":
      return <ArrowUp className="h-3.5 w-3.5 text-green-600" />;
    case "DECREASE":
      return <ArrowDown className="h-3.5 w-3.5 text-red-500" />;
    default:
      return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function actionColor(action: PrepAction): string {
  switch (action) {
    case "INCREASE":
      return "text-green-700 bg-green-50 border-green-200";
    case "DECREASE":
      return "text-red-700 bg-red-50 border-red-200";
    default:
      return "text-muted-foreground bg-muted/40 border-border";
  }
}

function tierBadge(tier: PerformanceTier) {
  const map: Record<PerformanceTier, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    STAR: { label: "⭐ Star", variant: "default" },
    GROWING: { label: "📈 Growing", variant: "secondary" },
    STABLE: { label: "➡️ Stable", variant: "outline" },
    DECLINING: { label: "📉 Declining", variant: "destructive" },
    UNDERPERFORMING: { label: "⚠️ Underperforming", variant: "destructive" },
  };
  const t = map[tier] ?? { label: tier, variant: "outline" as const };
  return <Badge variant={t.variant}>{t.label}</Badge>;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-700";
  if (score >= 50) return "text-yellow-600";
  return "text-red-600";
}

function scoreBar(score: number) {
  const bg =
    score >= 80
      ? "bg-green-500"
      : score >= 50
        ? "bg-yellow-500"
        : "bg-red-500";
  return (
    <div className="h-1.5 w-full rounded-full bg-muted">
      <div
        className={`h-1.5 rounded-full ${bg}`}
        style={{ width: `${Math.min(100, score)}%` }}
      />
    </div>
  );
}

function confidenceBadge(c: ConfidenceLevel) {
  const map: Record<ConfidenceLevel, { color: string }> = {
    HIGH: { color: "text-green-700 bg-green-50 border-green-200" },
    MEDIUM: { color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
    LOW: { color: "text-red-700 bg-red-50 border-red-200" },
  };
  const style = map[c] ?? map.LOW;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.color}`}
    >
      {c}
    </span>
  );
}

function segmentLabel(seg: string): string {
  const map: Record<string, string> = {
    HIGH_VALUE: "High Value",
    REGULAR: "Regular",
    OCCASIONAL: "Occasional",
    AT_RISK: "At Risk",
  };
  return map[seg] ?? seg;
}

function segmentIcon(seg: string) {
  switch (seg) {
    case "HIGH_VALUE":
      return <Star className="h-3.5 w-3.5 text-yellow-500" />;
    case "AT_RISK":
      return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
    default:
      return <Users className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

/* ---------- sub-components ---------- */

function KpiCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 rounded-md bg-muted p-1.5">{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="text-base font-semibold leading-tight">{value}</p>
          {sub && (
            <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- tab panels ---------- */

function ForecastTab({
  forecast,
  optimalPrep,
}: {
  forecast: DemandForecastItem[];
  optimalPrep: OptimalPrepItem[];
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="px-4 pb-2 pt-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Target className="h-4 w-4" />
            Demand Forecast
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {forecast.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No forecast data available yet.
            </p>
          ) : (
            <div className="space-y-2">
              {forecast.map((item) => (
                <div
                  key={item.menuItemId}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.category} · Avg {item.recentAvg.toFixed(1)}/day
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {Math.round(item.forecastQty)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {Math.round(item.confidenceLow)}–
                        {Math.round(item.confidenceHigh)}
                      </p>
                    </div>
                    <div
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${actionColor(item.action)}`}
                    >
                      <ActionIcon action={item.action} />
                      {item.action}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {optimalPrep.length > 0 && (
        <Card>
          <CardHeader className="px-4 pb-2 pt-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4" />
              Optimal Prep Quantities
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-2">
              {optimalPrep.map((item) => (
                <div
                  key={item.menuItemId}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.category} · Buffer{" "}
                      {item.breakdown.safetyBuffer.toFixed(1)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {Math.round(item.optimalQty)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Prep {Math.round(item.prepNeeded)}
                      </p>
                    </div>
                    {confidenceBadge(item.confidence)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PerformanceTab({ items }: { items: ItemPerformanceScore[] }) {
  const sorted = [...items].sort((a, b) => b.score - a.score);

  return (
    <Card>
      <CardHeader className="px-4 pb-2 pt-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Zap className="h-4 w-4" />
          Item Performance Scores
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No performance data available yet.
          </p>
        ) : (
          <div className="space-y-3">
            {sorted.map((item) => (
              <div key={item.menuItemId} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {item.name}
                      </p>
                      {tierBadge(item.tier)}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {item.category} · {item.totalSold} sold · {fmt(item.totalRevenue)}
                    </p>
                  </div>
                  <p className={`text-lg font-bold ${scoreColor(item.score)}`}>
                    {item.score.toFixed(0)}
                  </p>
                </div>
                {scoreBar(item.score)}
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span>
                    Revenue {(item.breakdown.revenueContribution * 100).toFixed(0)}%
                  </span>
                  <span>
                    Growth{" "}
                    {item.breakdown.growthTrend > 0 ? "+" : ""}
                    {(item.breakdown.growthTrend * 100).toFixed(0)}%
                  </span>
                  {item.avgRating !== null && (
                    <span>Rating {item.avgRating.toFixed(1)}</span>
                  )}
                  <span>Cancel {(item.cancellationRate * 100).toFixed(1)}%</span>
                </div>
                <Separator />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendsTab({ trends }: { trends: RevenueTrendAnalysis | null }) {
  if (!trends) {
    return (
      <Card>
        <CardContent className="px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            No revenue trend data available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Total Revenue"
          value={fmt(trends.totalRevenue)}
          sub={`${fmt(trends.avgDailyRevenue)} avg/day`}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <KpiCard
          label="7-Day Growth"
          value={pct(trends.growthRate7d)}
          sub={`30d: ${pct(trends.growthRate30d)}`}
          icon={
            trends.growthRate7d >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )
          }
        />
      </div>

      {trends.anomalies.length > 0 && (
        <Card>
          <CardHeader className="px-4 pb-2 pt-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Revenue Anomalies
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-2">
              {trends.anomalies.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{a.date}</p>
                    <p className="text-[10px] text-muted-foreground">
                      z-score: {a.zScore.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {fmt(a.revenue)}
                    </span>
                    <Badge
                      variant={a.type === "SPIKE" ? "default" : "destructive"}
                    >
                      {a.type}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {trends.projectedRevenue.length > 0 && (
        <Card>
          <CardHeader className="px-4 pb-2 pt-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4" />
              Revenue Projections (Next 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-1.5">
              {trends.projectedRevenue.map((p) => (
                <div
                  key={p.date}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">{p.date}</span>
                  <span className="font-medium">{fmt(p.projected)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WasteSegmentsTab({
  waste,
  segments,
}: {
  waste: WasteAnalysis | null;
  segments: CustomerSegmentationResult | null;
}) {
  return (
    <div className="space-y-4">
      {/* Waste analysis */}
      <Card>
        <CardHeader className="px-4 pb-2 pt-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Trash2 className="h-4 w-4" />
            Waste Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {!waste ? (
            <p className="text-xs text-muted-foreground">
              No waste data available yet.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-3 text-sm">
                <div>
                  <p className="text-[10px] text-muted-foreground">
                    Total Cancelled
                  </p>
                  <p className="font-semibold">{waste.totalCancelled}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">
                    Revenue Lost
                  </p>
                  <p className="font-semibold text-red-600">
                    {fmt(waste.totalRevenueLost)}
                  </p>
                </div>
              </div>

              {waste.topCancelledItems.length > 0 && (
                <>
                  <Separator />
                  <p className="text-xs font-medium">Top Cancelled Items</p>
                  <div className="space-y-1.5">
                    {waste.topCancelledItems.map((item) => (
                      <div
                        key={item.menuItemId}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{item.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {item.cancelledQty} cancelled ·{" "}
                            {(item.cancelRate * 100).toFixed(1)}% rate
                          </p>
                        </div>
                        <span className="text-xs font-medium text-red-600">
                          {fmt(item.estimatedRevenueLost)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {waste.topReasons.length > 0 && (
                <>
                  <Separator />
                  <p className="text-xs font-medium">Top Reasons</p>
                  <div className="space-y-1">
                    {waste.topReasons.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-muted-foreground">
                          {r.reason}
                        </span>
                        <span className="font-medium">
                          {r.count} ({r.percentage.toFixed(0)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {waste.patterns.length > 0 && (
                <>
                  <Separator />
                  <p className="text-xs font-medium">Patterns</p>
                  <div className="space-y-1">
                    {waste.patterns.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs"
                      >
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-yellow-500" />
                        <span>{p.message}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer segments */}
      <Card>
        <CardHeader className="px-4 pb-2 pt-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4" />
            Customer Segments
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {!segments || segments.segments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No segmentation data available yet.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-[10px] text-muted-foreground">
                {segments.totalCustomers} total customers
              </p>

              <div className="space-y-2">
                {segments.segments.map((seg) => (
                  <div
                    key={seg.segment}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      {segmentIcon(seg.segment)}
                      <div>
                        <p className="text-sm font-medium">
                          {segmentLabel(seg.segment)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {seg.count} customers · {seg.avgOrderFrequency.toFixed(1)} orders avg
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {fmt(seg.avgOrderValue)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        avg order
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {segments.highlights.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    {segments.highlights.map((h, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        • {h}
                      </p>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- main page ---------- */

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchInsights = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/insights?days=30");
      if (!res.ok) throw new Error("Failed to fetch insights");
      const json: InsightsData = await res.json();
      setData(json);
    } catch {
      toast.error("Failed to load ML insights");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Crunching the numbers…</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-sm text-muted-foreground">
          Unable to load analytics. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">
              ML Analytics
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            AI-powered forecasts, performance scores &amp; insights
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchInsights}
          disabled={loading}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="forecast" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="forecast" className="flex-1 gap-1 text-xs">
            <Target className="h-3.5 w-3.5" />
            Forecast
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex-1 gap-1 text-xs">
            <Zap className="h-3.5 w-3.5" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex-1 gap-1 text-xs">
            <TrendingUp className="h-3.5 w-3.5" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="waste" className="flex-1 gap-1 text-xs">
            <Trash2 className="h-3.5 w-3.5" />
            Waste
          </TabsTrigger>
        </TabsList>

        <TabsContent value="forecast" className="mt-4">
          <ForecastTab
            forecast={data.demandForecast}
            optimalPrep={data.optimalPrep}
          />
        </TabsContent>

        <TabsContent value="performance" className="mt-4">
          <PerformanceTab items={data.itemPerformance} />
        </TabsContent>

        <TabsContent value="trends" className="mt-4">
          <TrendsTab trends={data.revenueTrends} />
        </TabsContent>

        <TabsContent value="waste" className="mt-4">
          <WasteSegmentsTab
            waste={data.wasteAnalysis}
            segments={data.customerSegments}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
