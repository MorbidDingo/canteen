"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  ShoppingCart,
  Users,
  Package,
  RefreshCw,
  Calendar,
  ArrowUp,
  ArrowDown,
  Minus,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { MENU_CATEGORY_LABELS, type MenuCategory } from "@/lib/constants";
import { useRealtimeData } from "@/lib/events";

// ─── Types ───────────────────────────────────────────────

interface DailyStat {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  served: number;
  cancelled: number;
  placed: number;
  preparing: number;
  paidAmount: number;
  unpaidAmount: number;
}

interface ItemLast7 {
  date: string;
  quantity: number;
  revenue: number;
}

interface ItemStat {
  id: string;
  name: string;
  category: string;
  currentPrice: number;
  totalQuantity: number;
  totalRevenue: number;
  orderCount: number;
  cancelledQuantity: number;
  avgDailyQuantity: number;
  last7Days: ItemLast7[];
}

interface OverallSummary {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  servedOrders: number;
  cancelledOrders: number;
  paidTotal: number;
  unpaidTotal: number;
  days: number;
}

interface TopParent {
  name: string;
  childName: string | null;
  orderCount: number;
  totalSpent: number;
}

// ─── Sparkline Component ─────────────────────────────────

function MiniBarChart({ data, max }: { data: number[]; max: number }) {
  const barMax = max || 1;
  return (
    <div className="flex items-end gap-[2px] h-8">
      {data.map((val, i) => (
        <div
          key={i}
          className="w-3 rounded-t-sm bg-primary/70 hover:bg-primary transition-colors"
          style={{ height: `${Math.max((val / barMax) * 100, 4)}%` }}
          title={`${val}`}
        />
      ))}
    </div>
  );
}

// ─── Revenue bar for daily stats ─────────────────────────

function DailyBar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
      <div
        className="h-full bg-primary rounded-full transition-all duration-500"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────

export default function StatisticsPage() {
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [itemStats, setItemStats] = useState<ItemStat[]>([]);
  const [overall, setOverall] = useState<OverallSummary | null>(null);
  const [topParents, setTopParents] = useState<TopParent[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/statistics?days=${days}`);
      if (!res.ok) throw new Error("Failed to fetch statistics");
      const data = await res.json();
      setDailyStats(data.dailyStats);
      setItemStats(data.itemStats);
      setOverall(data.overallSummary);
      setTopParents(data.topParents);
    } catch {
      toast.error("Failed to load statistics");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    setLoading(true);
    fetchStats();
  }, [fetchStats]);

  // Live updates via SSE
  useRealtimeData(fetchStats, "orders-updated");

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };

  const maxDailyRevenue = Math.max(...dailyStats.map((d) => d.totalRevenue), 1);
  const maxDailyOrders = Math.max(...dailyStats.map((d) => d.totalOrders), 1);

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Statistics
          </h1>
          <p className="text-muted-foreground text-sm">
            Order analytics and item performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setLoading(true);
              fetchStats();
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && !overall ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-24" />
            </Card>
          ))}
        </div>
      ) : overall ? (
        <div className="space-y-6">
          {/* ─── Overall Summary Cards ──────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in">
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Total Orders
                </div>
                <p className="text-2xl font-bold">{overall.totalOrders}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {overall.servedOrders} served · {overall.cancelledOrders}{" "}
                  cancelled
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <IndianRupee className="h-3.5 w-3.5" />
                  Revenue
                </div>
                <p className="text-2xl font-bold">
                  ₹{overall.totalRevenue.toLocaleString("en-IN")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg ₹{overall.avgOrderValue.toFixed(0)}/order
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                  Paid
                </div>
                <p className="text-2xl font-bold text-green-700">
                  ₹{overall.paidTotal.toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <XCircle className="h-3.5 w-3.5 text-orange-500" />
                  Unpaid
                </div>
                <p className="text-2xl font-bold text-orange-600">
                  ₹{overall.unpaidTotal.toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ─── Tabs ──────────────────────────────────── */}
          <Tabs defaultValue="daily" className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden mb-4">
              <TabsTrigger value="daily" className="gap-2">
                <Calendar className="h-4 w-4" />
                Daily Orders
              </TabsTrigger>
              <TabsTrigger value="items" className="gap-2">
                <Package className="h-4 w-4" />
                Item Stats
              </TabsTrigger>
              <TabsTrigger value="parents" className="gap-2">
                <Users className="h-4 w-4" />
                Top Parents
              </TabsTrigger>
            </TabsList>

            {/* ─── Daily Orders Tab ──────────────────── */}
            <TabsContent value="daily" className="space-y-3">
              {dailyStats.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Calendar className="h-12 w-12 mb-2 opacity-40" />
                    <p>No orders in this period</p>
                  </CardContent>
                </Card>
              ) : (
                dailyStats.map((day, index) => (
                  <Card
                    key={day.date}
                    className="animate-fade-in-up"
                    style={{ animationDelay: `${index * 30}ms` }}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-semibold text-sm">
                            {formatDate(day.date)}
                          </span>
                          {day.date ===
                            new Date().toISOString().split("T")[0] && (
                            <Badge
                              variant="secondary"
                              className="ml-2 text-[10px]"
                            >
                              Today
                            </Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-sm">
                            ₹{day.totalRevenue.toLocaleString("en-IN")}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {day.totalOrders} orders
                          </span>
                        </div>
                      </div>
                      <DailyBar
                        value={day.totalRevenue}
                        max={maxDailyRevenue}
                      />
                      <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                        {day.served > 0 && (
                          <span className="text-blue-600">
                            ✓ {day.served} served
                          </span>
                        )}
                        {day.preparing > 0 && (
                          <span className="text-yellow-600">
                            ⧗ {day.preparing} preparing
                          </span>
                        )}
                        {day.placed > 0 && (
                          <span className="text-green-600">
                            ● {day.placed} placed
                          </span>
                        )}
                        {day.cancelled > 0 && (
                          <span className="text-red-500">
                            ✕ {day.cancelled} cancelled
                          </span>
                        )}
                        <span className="ml-auto">
                          Paid: ₹{day.paidAmount.toFixed(0)} / Unpaid: ₹
                          {day.unpaidAmount.toFixed(0)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* ─── Item Stats Tab ────────────────────── */}
            <TabsContent value="items" className="space-y-3">
              {itemStats.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mb-2 opacity-40" />
                    <p>No item data in this period</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Header */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-muted-foreground">
                    <div className="col-span-1">#</div>
                    <div className="col-span-3">Item</div>
                    <div className="col-span-2 text-right">Qty Sold</div>
                    <div className="col-span-2 text-right">Revenue</div>
                    <div className="col-span-1 text-right">Avg/Day</div>
                    <div className="col-span-3 text-right">Last 7 Days</div>
                  </div>
                  <Separator />

                  {itemStats.map((item, index) => {
                    // Trend: compare last 3 days vs previous 3 days
                    const recent3 = item.last7Days
                      .slice(-3)
                      .reduce((s, d) => s + d.quantity, 0);
                    const prev3 = item.last7Days
                      .slice(1, 4)
                      .reduce((s, d) => s + d.quantity, 0);
                    const trend = recent3 - prev3;
                    const maxQty = Math.max(
                      ...item.last7Days.map((d) => d.quantity),
                      1,
                    );

                    return (
                      <Card
                        key={item.id}
                        className="animate-fade-in-up"
                        style={{ animationDelay: `${index * 40}ms` }}
                      >
                        <CardContent className="py-3 px-4">
                          {/* Mobile layout */}
                          <div className="sm:hidden space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-muted-foreground w-5">
                                  {index + 1}
                                </span>
                                <div>
                                  <span className="font-semibold text-sm">
                                    {item.name}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="ml-2 text-[10px]"
                                  >
                                    {MENU_CATEGORY_LABELS[
                                      item.category as MenuCategory
                                    ] || item.category}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {trend > 0 ? (
                                  <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                                ) : trend < 0 ? (
                                  <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                                ) : (
                                  <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                            <div className="flex items-end justify-between">
                              <div className="text-xs space-y-0.5 text-muted-foreground">
                                <p>
                                  {item.totalQuantity} sold · ₹
                                  {item.totalRevenue.toLocaleString("en-IN")}
                                </p>
                                <p>
                                  ~{item.avgDailyQuantity}/day ·{" "}
                                  {item.cancelledQuantity} cancelled
                                </p>
                              </div>
                              <MiniBarChart
                                data={item.last7Days.map((d) => d.quantity)}
                                max={maxQty}
                              />
                            </div>
                          </div>

                          {/* Desktop layout */}
                          <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-1 text-xs font-bold text-muted-foreground">
                              {index + 1}
                            </div>
                            <div className="col-span-3">
                              <span className="font-semibold text-sm">
                                {item.name}
                              </span>
                              <Badge
                                variant="outline"
                                className="ml-2 text-[10px]"
                              >
                                {MENU_CATEGORY_LABELS[
                                  item.category as MenuCategory
                                ] || item.category}
                              </Badge>
                              {item.cancelledQuantity > 0 && (
                                <span className="text-[10px] text-red-500 ml-1">
                                  ({item.cancelledQuantity} cancelled)
                                </span>
                              )}
                            </div>
                            <div className="col-span-2 text-right font-bold text-sm">
                              {item.totalQuantity}
                              <span className="text-xs font-normal text-muted-foreground ml-1">
                                units
                              </span>
                            </div>
                            <div className="col-span-2 text-right font-bold text-sm">
                              ₹{item.totalRevenue.toLocaleString("en-IN")}
                            </div>
                            <div className="col-span-1 text-right text-sm">
                              <span className="flex items-center justify-end gap-1">
                                {item.avgDailyQuantity}
                                {trend > 0 ? (
                                  <ArrowUp className="h-3 w-3 text-green-600" />
                                ) : trend < 0 ? (
                                  <ArrowDown className="h-3 w-3 text-red-500" />
                                ) : null}
                              </span>
                            </div>
                            <div className="col-span-3 flex justify-end">
                              <MiniBarChart
                                data={item.last7Days.map((d) => d.quantity)}
                                max={maxQty}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </>
              )}
            </TabsContent>

            {/* ─── Top Parents Tab ───────────────────── */}
            <TabsContent value="parents" className="space-y-3">
              {topParents.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Users className="h-12 w-12 mb-2 opacity-40" />
                    <p>No parent data in this period</p>
                  </CardContent>
                </Card>
              ) : (
                topParents.map((parent, index) => (
                  <Card
                    key={index}
                    className="animate-fade-in-up"
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <CardContent className="flex items-center gap-3 py-3 px-4">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {index + 1}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {parent.name}
                        </p>
                        {parent.childName && (
                          <p className="text-xs text-muted-foreground truncate">
                            Child: {parent.childName}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-sm">
                          {parent.orderCount} orders
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ₹{parent.totalSpent.toLocaleString("en-IN")}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </div>
  );
}
