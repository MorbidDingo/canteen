"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Percent, IndianRupee, Zap, AlertTriangle, TrendingDown } from "lucide-react";
import { MENU_CATEGORY_LABELS, type MenuCategory } from "@/lib/constants";

interface DiscountSuggestionCardProps {
  suggestion: {
    menuItemId: string;
    name: string;
    category: string;
    currentPrice: number;
    reason: string;
    suggestedType: string;
    suggestedValue: number;
    priority: string;
    metrics: {
      totalSold: number;
      totalCancelled: number;
      cancelRate: number;
      avgDailySold: number;
      currentStock: number | null;
      revenue: number;
    };
  };
  onApply?: (
    menuItemId: string,
    type: string,
    value: number,
    mode: "AUTO" | "MANUAL",
    reason: string
  ) => void;
  readOnly?: boolean;
}

export function DiscountSuggestionCard({
  suggestion: s,
  onApply,
  readOnly,
}: DiscountSuggestionCardProps) {
  const priorityStyles = {
    HIGH: "bg-red-500/15 text-red-700 border-red-200",
    MEDIUM: "bg-amber-500/15 text-amber-700 border-amber-200",
    LOW: "bg-blue-500/15 text-blue-700 border-blue-200",
  };

  const discountedPrice =
    s.suggestedType === "PERCENTAGE"
      ? s.currentPrice * (1 - s.suggestedValue / 100)
      : Math.max(0, s.currentPrice - s.suggestedValue);

  return (
    <Card className="border border-border/60 hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold truncate">
              {s.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {MENU_CATEGORY_LABELS[s.category as MenuCategory] || s.category}
            </p>
          </div>
          <Badge
            className={`text-[10px] shrink-0 ${priorityStyles[s.priority as keyof typeof priorityStyles] || ""}`}
            variant="secondary"
          >
            {s.priority}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Reason */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {s.reason}
        </p>

        {/* Price simulation */}
        <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-3 py-2">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Current</p>
            <p className="text-sm font-semibold line-through text-muted-foreground">
              ₹{s.currentPrice}
            </p>
          </div>
          <TrendingDown className="h-4 w-4 text-emerald-500" />
          <div className="text-center">
            <p className="text-xs text-emerald-600 font-medium">
              {s.suggestedType === "PERCENTAGE"
                ? `${s.suggestedValue}% off`
                : `₹${s.suggestedValue} off`}
            </p>
            <p className="text-sm font-bold text-emerald-600">
              ₹{discountedPrice.toFixed(0)}
            </p>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p className="font-bold">{s.metrics.totalSold}</p>
            <p className="text-muted-foreground">Sold</p>
          </div>
          <div>
            <p className="font-bold">{s.metrics.cancelRate}%</p>
            <p className="text-muted-foreground">Cancel rate</p>
          </div>
          <div>
            <p className="font-bold">₹{s.metrics.revenue}</p>
            <p className="text-muted-foreground">Revenue</p>
          </div>
        </div>

        {/* Actions */}
        {!readOnly && onApply && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="flex-1 text-xs h-8 gap-1"
              onClick={() =>
                onApply(s.menuItemId, s.suggestedType, s.suggestedValue, "AUTO", s.reason)
              }
            >
              <Zap className="h-3 w-3" />
              Auto
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs h-8 gap-1"
              onClick={() =>
                onApply(s.menuItemId, s.suggestedType, s.suggestedValue, "MANUAL", s.reason)
              }
            >
              <Percent className="h-3 w-3" />
              Manual
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
