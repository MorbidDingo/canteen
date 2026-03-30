"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "@/components/ui/motion";
import { AlertTriangle, Clock, BookOpen, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface LibraryAlert {
  id: string;
  type: "OVERDUE" | "DUE_SOON";
  severity: "HIGH" | "MEDIUM" | "LOW";
  message: string;
  childName: string;
  bookTitle: string;
  dueDate: string;
}

interface ReadingStats {
  totalBooksRead: number;
  booksReadThisMonth: number;
  currentlyBorrowed: number;
}

export function LibraryInsightsWidget() {
  const [alerts, setAlerts] = useState<LibraryAlert[]>([]);
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/library/insights")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.alerts) setAlerts(data.alerts);
        if (data?.stats) setStats(data.stats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = alerts.filter((a) => !dismissed.has(a.id));

  if (loading) return null;
  if (visible.length === 0 && (!stats || stats.booksReadThisMonth === 0)) return null;

  return (
    <div className="space-y-2">
      {/* Reading stats badge */}
      {stats && (stats.booksReadThisMonth > 0 || stats.currentlyBorrowed > 0) && (
        <ReadingStatsCard stats={stats} />
      )}

      {/* Overdue / due-soon alerts */}
      {visible.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[13px] font-semibold">Library Alerts</span>
            <span className="text-[11px] text-muted-foreground">({visible.length})</span>
          </div>
          <AnimatePresence>
            {visible.slice(0, 5).map((alert) => (
              <LibraryAlertCard
                key={alert.id}
                alert={alert}
                onDismiss={() => setDismissed((prev) => new Set(prev).add(alert.id))}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function ReadingStatsCard({ stats }: { stats: ReadingStats }) {
  const router = useRouter();
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <Card className="border-border/60 bg-background/80 backdrop-blur">
        <CardContent className="p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Reading Progress
              </span>
              <div className="flex items-baseline gap-4">
                <div>
                  <span className="text-[11px] text-muted-foreground">This month</span>
                  <p className="text-[15px] font-bold">{stats.booksReadThisMonth} books</p>
                </div>
                {stats.currentlyBorrowed > 0 && (
                  <div>
                    <span className="text-[11px] text-muted-foreground">Now reading</span>
                    <p className="text-[15px] font-bold">{stats.currentlyBorrowed}</p>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push("/library-history")}
              className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <BookOpen className="h-3 w-3" />
              History
            </button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  HIGH: "border-red-500/30 bg-red-500/[0.04]",
  MEDIUM: "border-amber-500/30 bg-amber-500/[0.04]",
  LOW: "border-border/60 bg-background/80",
};

function LibraryAlertCard({
  alert,
  onDismiss,
}: {
  alert: LibraryAlert;
  onDismiss: () => void;
}) {
  const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.LOW;
  const icon =
    alert.type === "OVERDUE" ? (
      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
    ) : (
      <Clock className="h-3.5 w-3.5 text-amber-500" />
    );

  const timeLabel = (() => {
    const due = new Date(alert.dueDate);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return "Due today";
    return `Due in ${diffDays}d`;
  })();

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
            <p className="text-[12px] leading-snug">{alert.message}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{timeLabel}</p>
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
