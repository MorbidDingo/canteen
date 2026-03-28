"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "@/components/ui/motion";
import { AlertTriangle, Shield, TrendingUp, Clock, X } from "lucide-react";

interface AnomalyItem {
  id: string;
  childId: string;
  type: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

export function AnomalyInsights() {
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/recommendations/insights")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.anomalies) {
          setAnomalies(data.anomalies.filter((a: AnomalyItem) => !a.acknowledged));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = anomalies.filter((a) => !dismissed.has(a.id));

  if (loading || visible.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-[13px] font-semibold">Recent Alerts</span>
        <span className="text-[11px] text-muted-foreground">
          ({visible.length})
        </span>
      </div>
      <AnimatePresence>
        {visible.slice(0, 5).map((a) => (
          <AnomalyCard
            key={a.id}
            anomaly={a}
            onDismiss={() => setDismissed((prev) => new Set(prev).add(a.id))}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  HIGH: "border-red-500/30 bg-red-500/[0.04]",
  MEDIUM: "border-amber-500/30 bg-amber-500/[0.04]",
  LOW: "border-border/60 bg-background/80",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  SPENDING_SPIKE: <TrendingUp className="h-3.5 w-3.5 text-red-500" />,
  SKIPPED_MEAL: <Clock className="h-3.5 w-3.5 text-amber-500" />,
  RESTRICTED_ATTEMPT: <Shield className="h-3.5 w-3.5 text-orange-500" />,
  TIMING_ANOMALY: <Clock className="h-3.5 w-3.5 text-blue-500" />,
};

function AnomalyCard({
  anomaly,
  onDismiss,
}: {
  anomaly: AnomalyItem;
  onDismiss: () => void;
}) {
  const style = SEVERITY_STYLES[anomaly.severity] ?? SEVERITY_STYLES.LOW;
  const icon = TYPE_ICONS[anomaly.type] ?? (
    <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
  );

  const timeAgo = getTimeAgo(anomaly.createdAt);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <Card className={`${style} backdrop-blur`}>
        <CardContent className="p-3 flex items-start gap-2.5">
          <div className="shrink-0 mt-0.5">{icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] leading-snug">{anomaly.message}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{timeAgo}</p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-full p-1 hover:bg-muted transition-colors"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(diff / (1000 * 60 * 60));
  if (hrs < 1) return "Just now";
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
