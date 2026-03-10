"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useRealtimeData } from "@/lib/events";
import {
  ShoppingCart,
  IndianRupee,
  CheckCircle,
  Clock,
  ChefHat,
  XCircle,
} from "lucide-react";

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
}

export function DailySummary({ summaryUrl = "/api/admin/summary" }: { summaryUrl?: string }) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(summaryUrl);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSummary(data.summary);
    } catch {
      // silently fail — non-critical
    } finally {
      setLoading(false);
    }
  }, [summaryUrl]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Instant refresh via SSE when any order event occurs
  useRealtimeData(fetchSummary, "orders-updated");

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="py-4 h-20" />
          </Card>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const stats = [
    {
      label: "Today's Orders",
      value: summary.totalOrders,
      icon: ShoppingCart,
      color: "text-[#1a3a8f]",
      bgColor: "bg-[#1a3a8f]/10",
    },
    {
      label: "Revenue",
      value: `₹${summary.totalRevenue.toFixed(0)}`,
      icon: IndianRupee,
      color: "text-[#2eab57]",
      bgColor: "bg-[#2eab57]/10",
    },
    {
      label: "Paid",
      value: `${summary.payment.paidCount} (₹${summary.payment.paidAmount.toFixed(0)})`,
      icon: CheckCircle,
      color: "text-[#2eab57]",
      bgColor: "bg-[#2eab57]/10",
    },
    {
      label: "Unpaid",
      value: `${summary.payment.unpaidCount} (₹${summary.payment.unpaidAmount.toFixed(0)})`,
      icon: Clock,
      color: "text-[#f58220]",
      bgColor: "bg-[#f58220]/10",
    },
  ];

  const statusStats = [
    {
      label: "Placed",
      value: summary.byStatus.PLACED,
      icon: Clock,
      color: "text-[#2eab57]",
    },
    {
      label: "Preparing",
      value: summary.byStatus.PREPARING,
      icon: ChefHat,
      color: "text-[#f58220]",
    },
    {
      label: "Served",
      value: summary.byStatus.SERVED,
      icon: CheckCircle,
      color: "text-[#1a3a8f]",
    },
    {
      label: "Cancelled",
      value: summary.byStatus.CANCELLED,
      icon: XCircle,
      color: "text-[#e32726]",
    },
  ];

  return (
    <div className="space-y-3 mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
      {/* Main stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(({ label, value, icon: Icon, color, bgColor }) => (
          <Card key={label} className="overflow-hidden">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${bgColor}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">
                    {label}
                  </p>
                  <p className="text-sm font-bold truncate">{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status breakdown — compact row */}
      <Card>
        <CardContent className="py-2.5 px-4">
          <div className="flex items-center justify-around">
            {statusStats.map(({ label, value, icon: Icon, color }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 text-center"
              >
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-sm font-bold">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
