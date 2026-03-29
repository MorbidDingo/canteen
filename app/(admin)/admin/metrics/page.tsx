"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useRealtimeData } from "@/lib/events";
import {
  ShoppingCart,
  IndianRupee,
  CheckCircle,
  XCircle,
  Clock,
  ChefHat,
  Package,
  CalendarRange,
  RefreshCw,
  TrendingUp,
  Wallet,
  Users,
} from "lucide-react";
import { toast } from "sonner";

/* ── Types ─────────────────────────────────────────────────────── */

interface SummaryData {
  totalOrders: number;
  totalRevenue: number;
  byStatus: {
    PLACED: number;
    PREPARING: number;
    SERVED: number;
    CANCELLED: number;
  };
  payment: {
    paidCount: number;
    unpaidCount: number;
    paidAmount: number;
    unpaidAmount: number;
  };
  preOrders?: {
    oneDayCount: number;
    subscriptionCount: number;
    totalPlannedItems: number;
    topDemandItems: { menuItemId: string; name: string; quantity: number }[];
  };
}

interface PrepDemandItem {
  menuItemId: string;
  menuItemName: string;
  breakName: string | null;
  quantity: number;
  fromOneDay: number;
  fromSubscription: number;
}

interface PreOrdersData {
  prepDemand: PrepDemandItem[];
  summary: {
    oneDayCount: number;
    subscriptionCount: number;
    totalPlannedItems: number;
  };
}

/* ── Helpers ───────────────────────────────────────────────────── */

function formatCurrency(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function todayLabel() {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function AdminMetricsPage() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [preOrders, setPreOrders] = useState<PreOrdersData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryRes, preOrdersRes] = await Promise.all([
        fetch("/api/admin/summary"),
        fetch("/api/admin/pre-orders"),
      ]);

      if (!summaryRes.ok) throw new Error("Failed to fetch summary");
      const summaryJson = await summaryRes.json();
      setSummary(summaryJson.summary ?? null);

      // pre-orders may 403 for terminal accounts — treat as optional
      if (preOrdersRes.ok) {
        const preOrdersJson = await preOrdersRes.json();
        setPreOrders({
          prepDemand: preOrdersJson.prepDemand ?? [],
          summary: preOrdersJson.summary ?? {
            oneDayCount: 0,
            subscriptionCount: 0,
            totalPlannedItems: 0,
          },
        });
      }
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useRealtimeData(fetchAll, "orders-updated");

  /* ── Loading state ──────────────────────────────────────────── */

  if (loading && !summary) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading dashboard…</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="h-20 animate-pulse rounded-md bg-muted/40 p-4" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-sm text-muted-foreground">
          Unable to load dashboard data.
        </p>
      </div>
    );
  }

  /* ── Derived values ─────────────────────────────────────────── */

  const { byStatus, payment } = summary;
  const totalPayment = payment.paidAmount + payment.unpaidAmount;
  const paidPct = totalPayment > 0 ? (payment.paidAmount / totalPayment) * 100 : 0;

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Today&apos;s Dashboard
          </h1>
          <p className="text-xs text-muted-foreground">{todayLabel()}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAll}
          disabled={loading}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Total Orders"
          value={summary.totalOrders}
          icon={<ShoppingCart className="h-4 w-4 text-muted-foreground" />}
        />
        <KpiCard
          label="Revenue"
          value={formatCurrency(summary.totalRevenue)}
          icon={<IndianRupee className="h-4 w-4 text-[#d4891a]" />}
          valueClassName="text-[#d4891a]"
        />
        <KpiCard
          label="Served"
          value={byStatus.SERVED}
          icon={<CheckCircle className="h-4 w-4 text-[#2eab57]" />}
          valueClassName="text-[#2eab57]"
        />
        <KpiCard
          label="Cancelled"
          value={byStatus.CANCELLED}
          icon={<XCircle className="h-4 w-4 text-[#e32726]" />}
          valueClassName="text-[#e32726]"
        />
      </div>

      {/* Status Breakdown */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">
            Order Status Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="flex flex-wrap gap-3">
            <StatusBadge
              label="Placed"
              count={byStatus.PLACED}
              icon={<Clock className="h-3 w-3" />}
              className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            />
            <StatusBadge
              label="Preparing"
              count={byStatus.PREPARING}
              icon={<ChefHat className="h-3 w-3" />}
              className="bg-orange-50 text-[#f58220] dark:bg-orange-950 dark:text-orange-300"
            />
            <StatusBadge
              label="Served"
              count={byStatus.SERVED}
              icon={<CheckCircle className="h-3 w-3" />}
              className="bg-green-50 text-[#2eab57] dark:bg-green-950 dark:text-green-300"
            />
            <StatusBadge
              label="Cancelled"
              count={byStatus.CANCELLED}
              icon={<XCircle className="h-3 w-3" />}
              className="bg-red-50 text-[#e32726] dark:bg-red-950 dark:text-red-300"
            />
          </div>
        </CardContent>
      </Card>

      {/* Payment Card */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
            <Wallet className="h-4 w-4 text-[#d4891a]" />
            Payment Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Paid ({payment.paidCount})
            </span>
            <span className="font-medium text-[#2eab57]">
              {formatCurrency(payment.paidAmount)}
            </span>
          </div>

          {/* Visual bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-red-100 dark:bg-red-950">
            <div
              className="h-full rounded-full bg-[#2eab57] transition-all"
              style={{ width: `${paidPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Unpaid ({payment.unpaidCount})
            </span>
            <span className="font-medium text-[#e32726]">
              {formatCurrency(payment.unpaidAmount)}
            </span>
          </div>

          <Separator />

          <div className="flex items-center justify-between text-xs font-medium">
            <span>Total</span>
            <span className="text-[#d4891a]">
              {formatCurrency(totalPayment)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Prep Demand Section */}
      {preOrders && preOrders.prepDemand.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
              <Package className="h-4 w-4 text-[#f58220]" />
              Prep Demand — Items to Make Today
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-3">
            <div className="grid gap-2">
              {preOrders.prepDemand.map((item) => (
                <div
                  key={`${item.menuItemId}-${item.breakName ?? "all"}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.menuItemName}
                    </p>
                    {item.breakName && (
                      <p className="text-[10px] text-muted-foreground">
                        {item.breakName}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="text-xs font-semibold"
                    >
                      ×{item.quantity}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarRange className="h-3 w-3" />
                {preOrders.summary.subscriptionCount} from subscriptions
              </span>
              <span className="flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" />
                {preOrders.summary.oneDayCount} from one-day orders
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {preOrders.summary.totalPlannedItems} total planned items
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Subscriptions */}
      {preOrders && (
        <Card>
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Active Subscriptions</p>
              <p className="text-xs text-muted-foreground">
                Delivering today
              </p>
            </div>
            <span className="text-xl font-bold tabular-nums">
              {preOrders.summary.subscriptionCount}
            </span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────── */

function KpiCard({
  label,
  value,
  icon,
  valueClassName,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 px-4 py-3">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[11px] text-muted-foreground">{label}</span>
        </div>
        <span
          className={`text-xl font-bold tabular-nums leading-none ${valueClassName ?? ""}`}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  label,
  count,
  icon,
  className,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  className: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {icon}
      {label}
      <span className="font-bold">{count}</span>
    </div>
  );
}
