"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "@/components/ui/motion";
import {
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Wallet,
  Loader2,
  Calendar,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface ChildForecast {
  childId: string;
  childName: string;
  currentBalance: number;
  projectedDailySpend: number;
  depletionDate: string | null;
  daysUntilDepletion: number | null;
  rechargeRecommendation: number;
  dailyLimitExceedanceRisk: "LOW" | "MEDIUM" | "HIGH";
  weeklyProjection: { date: string; projectedBalance: number }[];
}

export function WalletForecastWidget() {
  const [forecasts, setForecasts] = useState<ChildForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/recommendations/insights")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.forecasts) setForecasts(data.forecasts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-[12px] text-muted-foreground">Analyzing spending…</span>
      </div>
    );
  }

  if (forecasts.length === 0) return null;

  return (
    <div className="space-y-2">
      {forecasts.map((f) => (
        <ForecastCard key={f.childId} forecast={f} />
      ))}
    </div>
  );
}

function ForecastCard({ forecast: f }: { forecast: ChildForecast }) {
  const router = useRouter();
  const riskColors = {
    LOW: "text-emerald-600 bg-emerald-500/10",
    MEDIUM: "text-amber-600 bg-amber-500/10",
    HIGH: "text-red-600 bg-red-500/10",
  };
  const riskColor = riskColors[f.dailyLimitExceedanceRisk];
  const isLow = f.daysUntilDepletion != null && f.daysUntilDepletion <= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <Card className="border-border/60 bg-background/80 backdrop-blur">
        <CardContent className="p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0 space-y-1.5">
              {/* Title row */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  AI Insights
                </span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${riskColor}`}>
                  {f.dailyLimitExceedanceRisk} risk
                </span>
              </div>

              {/* Spending stat */}
              <div className="flex items-baseline gap-3">
                <div>
                  <span className="text-[11px] text-muted-foreground">Avg/day</span>
                  <p className="text-[15px] font-bold">₹{f.projectedDailySpend.toFixed(0)}</p>
                </div>
                {f.daysUntilDepletion != null && (
                  <div>
                    <span className="text-[11px] text-muted-foreground">Lasts</span>
                    <p className={`text-[15px] font-bold ${isLow ? "text-red-500" : ""}`}>
                      {f.daysUntilDepletion}d
                    </p>
                  </div>
                )}
              </div>

              {/* Alert line */}
              {isLow && (
                <div className="flex items-center gap-1.5 text-[11px] text-red-500">
                  <AlertTriangle className="h-3 w-3" />
                  Balance will run out soon
                </div>
              )}
            </div>

            {/* Top-up CTA */}
            {f.rechargeRecommendation > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1 rounded-xl text-[11px] border-primary/30 bg-primary/5 hover:bg-primary/10"
                onClick={() => router.push("/wallet")}
              >
                <Wallet className="h-3 w-3 text-primary" />
                Top up ₹{f.rechargeRecommendation}
              </Button>
            )}
          </div>

          {/* Mini weekly projection bar */}
          {f.weeklyProjection.length > 0 && (
            <div className="mt-3 flex items-end gap-0.5 h-8">
              {f.weeklyProjection.slice(0, 7).map((day, i) => {
                const maxBal = Math.max(...f.weeklyProjection.map((d) => d.projectedBalance), 1);
                const height = Math.max((day.projectedBalance / maxBal) * 100, 4);
                const isDeplete = day.projectedBalance <= 0;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm ${isDeplete ? "bg-red-400/60" : "bg-primary/20"}`}
                    style={{ height: `${height}%` }}
                    title={`${new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" })}: ₹${day.projectedBalance.toFixed(0)}`}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
