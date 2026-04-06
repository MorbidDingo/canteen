"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, PackageCheck, AlertTriangle } from "lucide-react";
import { MENU_CATEGORY_LABELS, CONFIDENCE_COLORS, type MenuCategory, type ConfidenceLevel } from "@/lib/constants";

interface RecommendationCardProps {
  recommendation: {
    menuItemId: string;
    name: string;
    category: string;
    currentStock: number;
    avgDailySold: number;
    avgDailyCancelled: number;
    suggestedPrep: number;
    confidence: string;
    trend: string;
    daysOfData: number;
    last7: number[];
  };
}

export function RecommendationCard({ recommendation: r }: RecommendationCardProps) {
  const TrendIcon =
    r.trend === "up" ? TrendingUp : r.trend === "down" ? TrendingDown : Minus;
  const trendColor =
    r.trend === "up"
      ? "text-emerald-600"
      : r.trend === "down"
        ? "text-red-500"
        : "text-muted-foreground";

  const maxBar = Math.max(...r.last7, 1);

  return (
    <Card className="border border-border/60 hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold truncate">
              {r.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {MENU_CATEGORY_LABELS[r.category as MenuCategory] || r.category}
            </p>
          </div>
          <Badge
            className={`text-[10px] shrink-0 ${CONFIDENCE_COLORS[r.confidence as ConfidenceLevel] || ""}`}
            variant="secondary"
          >
            {r.confidence}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Sparkline */}
        <div className="flex items-end gap-[3px] h-8">
          {r.last7.map((val, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm bg-primary/60 hover:bg-primary transition-colors"
              style={{ height: `${Math.max((val / maxBar) * 100, 6)}%` }}
              title={`${val} sold`}
            />
          ))}
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-primary">{r.suggestedPrep}</p>
            <p className="text-[10px] text-muted-foreground">Prep today</p>
          </div>
          <div>
            <p className="text-lg font-bold">{r.currentStock}</p>
            <p className="text-[10px] text-muted-foreground">In stock</p>
          </div>
          <div>
            <p className="text-lg font-bold">{r.avgDailySold}</p>
            <p className="text-[10px] text-muted-foreground">Avg/day</p>
          </div>
        </div>

        {/* Trend + info */}
        <div className="flex items-center justify-between text-xs">
          <span className={`flex items-center gap-1 ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            {r.trend === "up" ? "Trending up" : r.trend === "down" ? "Trending down" : "Stable"}
          </span>
          <span className="text-muted-foreground">
            {r.daysOfData}d data
          </span>
        </div>

        {r.suggestedPrep > 0 && r.currentStock <= 2 && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-500/10 rounded-md px-2 py-1">
            <AlertTriangle className="h-3 w-3" />
            Low stock — prep needed
          </div>
        )}

        {r.suggestedPrep === 0 && r.currentStock > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-500/10 rounded-md px-2 py-1">
            <PackageCheck className="h-3 w-3" />
            Stock sufficient
          </div>
        )}
      </CardContent>
    </Card>
  );
}
