"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Brain,
  Percent,
  ShieldBan,
  Zap,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Copy,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import {
  MENU_CATEGORY_LABELS,
  MENU_CATEGORY_COLORS,
  CONFIDENCE_COLORS,
  type MenuCategory,
  type ConfidenceLevel,
} from "@/lib/constants";
import { useRealtimeData } from "@/lib/events";

// Charts
import { RevenueChart } from "@/components/analytics/revenue-chart";
import { ItemSalesChart } from "@/components/analytics/item-sales-chart";
import { CategoryPieChart } from "@/components/analytics/category-pie-chart";
import { PeakHoursChart } from "@/components/analytics/peak-hours-chart";
import { PaymentDonut } from "@/components/analytics/payment-donut";
import { RecommendationCard } from "@/components/analytics/recommendation-card";
import { DiscountSuggestionCard } from "@/components/analytics/discount-suggestion-card";
import { CategoryBlockChart } from "@/components/analytics/category-block-chart";

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
  last7Days: { date: string; quantity: number; revenue: number }[];
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

interface ItemDailyRow {
  date: string;
  menuItemId: string;
  name: string;
  category: string;
  quantity: number;
  revenue: number;
  cancelledQty: number;
}

interface Recommendation {
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
}

interface DiscountSuggestion {
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
}

interface CategoryBlock {
  category: string;
  blockedCount: number;
  totalParents: number;
  percentage: number;
}

interface DiscountRecord {
  id: string;
  menuItemId: string;
  menuItemName: string;
  menuItemPrice: number;
  menuItemCategory: string;
  type: string;
  value: number;
  reason: string | null;
  mode: string;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

// ─── Mini bar sparkline ──────────────────────────────────

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

// ─── Main Page ───────────────────────────────────────────

export default function AnalyticsDashboard({ readOnly = false }: { readOnly?: boolean }) {
  // Legacy stats
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [itemStats, setItemStats] = useState<ItemStat[]>([]);
  const [overall, setOverall] = useState<OverallSummary | null>(null);
  const [topParents, setTopParents] = useState<TopParent[]>([]);

  // Analytics
  const [itemBreakdown, setItemBreakdown] = useState<ItemDailyRow[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [discountSuggestions, setDiscountSuggestions] = useState<DiscountSuggestion[]>([]);
  const [categoryBlocks, setCategoryBlocks] = useState<CategoryBlock[]>([]);
  const [revenueByCategory, setRevenueByCategory] = useState<{ category: string; revenue: number; quantity: number }[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<{ method: string; count: number; amount: number }[]>([]);
  const [peakHours, setPeakHours] = useState<{ hour: number; label: string; orders: number; revenue: number }[]>([]);

  // Discounts
  const [activeDiscounts, setActiveDiscounts] = useState<DiscountRecord[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [recFilter, setRecFilter] = useState<string>("ALL");

  // Fetch all data
  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, analyticsRes, discountsRes] = await Promise.all([
        fetch(`/api/admin/statistics?days=${days}`),
        fetch(`/api/admin/analytics?days=${days}`),
        readOnly ? Promise.resolve(null) : fetch("/api/admin/discounts"),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setDailyStats(data.dailyStats);
        setItemStats(data.itemStats);
        setOverall(data.overallSummary);
        setTopParents(data.topParents);
      }

      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        setItemBreakdown(data.itemBreakdown);
        setRecommendations(data.recommendations);
        setDiscountSuggestions(data.discountSuggestions);
        setCategoryBlocks(data.categoryBlocks);
        setRevenueByCategory(data.revenueByCategory);
        setPaymentBreakdown(data.paymentBreakdown);
        setPeakHours(data.peakHours);
      }

      if (discountsRes && discountsRes.ok) {
        const data = await discountsRes.json();
        setActiveDiscounts(data.discounts);
      }
    } catch {
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [days, readOnly]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  useRealtimeData(fetchAll, "orders-updated");

  // ─── Handlers ───────────────────────────────────────

  const handleApplyDiscount = async (
    menuItemId: string,
    type: string,
    value: number,
    mode: "AUTO" | "MANUAL",
    reason: string
  ) => {
    try {
      const res = await fetch("/api/admin/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuItemId, type, value, reason, mode }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create discount");
      }
      toast.success(`Discount applied (${mode})`);
      fetchAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  };

  const handleToggleDiscount = async (id: string, active: boolean) => {
    try {
      const res = await fetch(`/api/admin/discounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error();
      toast.success(active ? "Discount activated" : "Discount deactivated");
      fetchAll();
    } catch {
      toast.error("Failed to toggle discount");
    }
  };

  const handleDeleteDiscount = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/discounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Discount removed");
      fetchAll();
    } catch {
      toast.error("Failed to delete discount");
    }
  };

  // ─── Derived data ──────────────────────────────────

  // Revenue chart data from dailyStats (reversed to chronological)
  const revenueChartData = [...dailyStats]
    .reverse()
    .map((d) => ({ date: d.date, revenue: Math.round(d.totalRevenue) }));

  // Unique items from breakdown for selector
  const uniqueItems = Array.from(
    new Map(itemBreakdown.map((r) => [r.menuItemId, { id: r.menuItemId, name: r.name }])).values()
  );

  // Selected item daily data
  const selectedItemData = selectedItemId
    ? itemBreakdown
        .filter((r) => r.menuItemId === selectedItemId)
        .map((r) => ({ date: r.date, quantity: r.quantity, cancelledQty: r.cancelledQty }))
    : [];
  const selectedItemName = uniqueItems.find((i) => i.id === selectedItemId)?.name || "";

  // Filtered recommendations
  const filteredRecs =
    recFilter === "ALL"
      ? recommendations
      : recommendations.filter((r) => r.category === recFilter);

  // Item stats with trend
  const itemStatsWithTrend = itemStats.map((item) => {
    const last3 = item.last7Days.slice(4).reduce((s, d) => s + d.quantity, 0);
    const prev3 = item.last7Days.slice(1, 4).reduce((s, d) => s + d.quantity, 0);
    let trend: "up" | "down" | "stable" = "stable";
    if (last3 > prev3 * 1.2) trend = "up";
    else if (last3 < prev3 * 0.8) trend = "down";
    return { ...item, trend };
  });

  // Cancellation rates from item stats
  const cancellationData = itemStats
    .filter((i) => i.totalQuantity + i.cancelledQuantity > 0)
    .map((i) => ({
      name: i.name,
      category: i.category,
      cancelRate:
        Math.round(
          (i.cancelledQuantity / (i.totalQuantity + i.cancelledQuantity)) * 100
        ),
      total: i.totalQuantity + i.cancelledQuantity,
    }))
    .filter((i) => i.cancelRate > 0)
    .sort((a, b) => b.cancelRate - a.cancelRate);

  // Copy prep list to clipboard
  const copyPrepList = () => {
    const lines = filteredRecs
      .filter((r) => r.suggestedPrep > 0)
      .map((r) => `${r.name}: prep ${r.suggestedPrep} (stock: ${r.currentStock}, avg: ${r.avgDailySold}/day)`)
      .join("\n");
    navigator.clipboard.writeText(lines || "Nothing to prep");
    toast.success("Prep list copied!");
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            Analytics Dashboard
          </h1>
          <p className="text-muted-foreground text-sm">
            Insights, recommendations & performance
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
            onClick={() => { setLoading(true); fetchAll(); }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && !overall ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : overall ? (
        <div className="space-y-6">
          {/* ─── Summary Cards ─────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in">
            <Card className="bg-gradient-to-br from-indigo-500/5 to-transparent border-indigo-200/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Total Orders
                </div>
                <p className="text-2xl font-bold">{overall.totalOrders}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {overall.servedOrders} served · {overall.cancelledOrders} cancelled
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-violet-500/5 to-transparent border-violet-200/50">
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

            <Card className="bg-gradient-to-br from-emerald-500/5 to-transparent border-emerald-200/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                  Paid
                </div>
                <p className="text-2xl font-bold text-emerald-700">
                  ₹{overall.paidTotal.toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/5 to-transparent border-amber-200/50">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <XCircle className="h-3.5 w-3.5 text-amber-500" />
                  Unpaid
                </div>
                <p className="text-2xl font-bold text-amber-600">
                  ₹{overall.unpaidTotal.toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ─── Tabs ──────────────────────────────────── */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden mb-4 flex-wrap h-auto gap-1">
              <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
                <BarChart3 className="h-3.5 w-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="items" className="gap-1.5 text-xs sm:text-sm">
                <Package className="h-3.5 w-3.5" />
                Items
              </TabsTrigger>
              <TabsTrigger value="prep" className="gap-1.5 text-xs sm:text-sm">
                <TrendingUp className="h-3.5 w-3.5" />
                Stock & Prep
              </TabsTrigger>
              <TabsTrigger value="discounts" className="gap-1.5 text-xs sm:text-sm">
                <Percent className="h-3.5 w-3.5" />
                Discounts
              </TabsTrigger>
              <TabsTrigger value="insights" className="gap-1.5 text-xs sm:text-sm">
                <Eye className="h-3.5 w-3.5" />
                Insights
              </TabsTrigger>
            </TabsList>

            {/* ═══════════ TAB 1: OVERVIEW ═══════════ */}
            <TabsContent value="overview" className="space-y-6 animate-fade-in">
              {/* Revenue Trend */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Revenue Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {revenueChartData.length > 0 ? (
                    <RevenueChart data={revenueChartData} />
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No revenue data for this period
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Category + Payment side by side */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Revenue by Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {revenueByCategory.length > 0 ? (
                      <CategoryPieChart data={revenueByCategory} />
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No data
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Payment Methods</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {paymentBreakdown.length > 0 ? (
                      <PaymentDonut data={paymentBreakdown} />
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No data
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Peak Hours */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Peak Ordering Hours</CardTitle>
                </CardHeader>
                <CardContent>
                  {peakHours.some((h) => h.orders > 0) ? (
                    <PeakHoursChart data={peakHours} />
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No order data
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ═══════════ TAB 2: ITEM ANALYTICS ═══════════ */}
            <TabsContent value="items" className="space-y-6 animate-fade-in">
              {/* Per-item chart */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base">Item Daily Sales</CardTitle>
                    <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select item..." />
                      </SelectTrigger>
                      <SelectContent>
                        {uniqueItems.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedItemId && selectedItemData.length > 0 ? (
                    <ItemSalesChart data={selectedItemData} itemName={selectedItemName} />
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {selectedItemId ? "No sales data" : "Select an item to view daily sales"}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Item Stats Table */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Item Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs">
                          <th className="text-left py-2 pr-2">#</th>
                          <th className="text-left py-2 pr-4">Item</th>
                          <th className="text-left py-2 pr-2">Category</th>
                          <th className="text-right py-2 pr-3">Sold</th>
                          <th className="text-right py-2 pr-3">Revenue</th>
                          <th className="text-right py-2 pr-3">Avg/day</th>
                          <th className="text-center py-2 pr-2">7d</th>
                          <th className="text-center py-2">Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemStatsWithTrend.map((item, i) => {
                          const maxQty = Math.max(...item.last7Days.map((d) => d.quantity), 1);
                          return (
                            <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                              <td className="py-2 pr-4 font-medium">{item.name}</td>
                              <td className="py-2 pr-2">
                                <Badge
                                  variant="secondary"
                                  className={`text-[10px] ${MENU_CATEGORY_COLORS[item.category as MenuCategory] || ""}`}
                                >
                                  {MENU_CATEGORY_LABELS[item.category as MenuCategory] || item.category}
                                </Badge>
                              </td>
                              <td className="py-2 pr-3 text-right font-medium">{item.totalQuantity}</td>
                              <td className="py-2 pr-3 text-right">₹{item.totalRevenue.toLocaleString()}</td>
                              <td className="py-2 pr-3 text-right">{item.avgDailyQuantity}</td>
                              <td className="py-2 pr-2">
                                <MiniBarChart
                                  data={item.last7Days.map((d) => d.quantity)}
                                  max={maxQty}
                                />
                              </td>
                              <td className="py-2 text-center">
                                {item.trend === "up" ? (
                                  <ArrowUp className="h-4 w-4 text-emerald-500 mx-auto" />
                                ) : item.trend === "down" ? (
                                  <ArrowDown className="h-4 w-4 text-red-500 mx-auto" />
                                ) : (
                                  <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {itemStats.length === 0 && (
                      <p className="text-center text-muted-foreground text-sm py-6">
                        No item data for this period
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ═══════════ TAB 3: STOCK & PREP ═══════════ */}
            <TabsContent value="prep" className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold">Prep Recommendations</h2>
                  <p className="text-xs text-muted-foreground">
                    Based on rolling sales data for tracked-stock items
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={recFilter} onValueChange={setRecFilter}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All categories</SelectItem>
                      <SelectItem value="SNACKS">Snacks</SelectItem>
                      <SelectItem value="MEALS">Meals</SelectItem>
                      <SelectItem value="DRINKS">Drinks</SelectItem>
                      <SelectItem value="PACKED_FOOD">Packed Food</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={copyPrepList} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" />
                    Copy list
                  </Button>
                </div>
              </div>

              {filteredRecs.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredRecs.map((r) => (
                    <RecommendationCard key={r.menuItemId} recommendation={r} />
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">
                      {recommendations.length === 0
                        ? "No tracked-stock items found. Set availableUnits on menu items to get prep recommendations."
                        : "No items match the selected filter."}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ═══════════ TAB 4: DISCOUNTS ═══════════ */}
            <TabsContent value="discounts" className="space-y-6 animate-fade-in">
              {/* Suggestions */}
              <div>
                <h2 className="text-lg font-semibold mb-1">Discount Suggestions</h2>
                <p className="text-xs text-muted-foreground mb-4">
                  AI-generated recommendations based on sales data, cancellation rates and stock levels
                </p>

                {discountSuggestions.length > 0 ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {discountSuggestions.map((s) => (
                      <DiscountSuggestionCard
                        key={s.menuItemId}
                        suggestion={s}
                        onApply={readOnly ? undefined : handleApplyDiscount}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">
                        No discount suggestions at this time. All items are performing well!
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              <Separator />

              {/* Active Discounts Table */}
              <div>
                <h2 className="text-lg font-semibold mb-3">Active & Saved Discounts</h2>
                {activeDiscounts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs">
                          <th className="text-left py-2 pr-4">Item</th>
                          <th className="text-left py-2 pr-3">Discount</th>
                          <th className="text-left py-2 pr-3">Mode</th>
                          <th className="text-left py-2 pr-3">Reason</th>
                          <th className="text-center py-2 pr-3">Status</th>
                          {!readOnly && <th className="text-right py-2">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {activeDiscounts.map((d) => {
                          const effectivePrice =
                            d.type === "PERCENTAGE"
                              ? d.menuItemPrice * (1 - d.value / 100)
                              : Math.max(0, d.menuItemPrice - d.value);
                          return (
                            <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="py-2 pr-4">
                                <span className="font-medium">{d.menuItemName}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  ₹{d.menuItemPrice} → ₹{effectivePrice.toFixed(0)}
                                </span>
                              </td>
                              <td className="py-2 pr-3">
                                <Badge variant="secondary" className="text-[10px]">
                                  {d.type === "PERCENTAGE" ? `${d.value}%` : `₹${d.value}`} off
                                </Badge>
                              </td>
                              <td className="py-2 pr-3">
                                <Badge
                                  variant="secondary"
                                  className={`text-[10px] ${d.mode === "AUTO" ? "bg-violet-500/15 text-violet-700" : "bg-muted"}`}
                                >
                                  {d.mode}
                                </Badge>
                              </td>
                              <td className="py-2 pr-3 text-xs text-muted-foreground max-w-[200px] truncate">
                                {d.reason || "—"}
                              </td>
                              <td className="py-2 pr-3 text-center">
                                <Badge
                                  variant={d.active ? "default" : "secondary"}
                                  className={`text-[10px] ${d.active ? "bg-emerald-500/15 text-emerald-700" : "bg-muted"}`}
                                >
                                  {d.active ? "Active" : "Inactive"}
                                </Badge>
                              </td>
                              {!readOnly && (
                                <td className="py-2 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => handleToggleDiscount(d.id, !d.active)}
                                      title={d.active ? "Deactivate" : "Activate"}
                                    >
                                      {d.active ? (
                                        <ToggleRight className="h-4 w-4 text-emerald-600" />
                                      ) : (
                                        <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => handleDeleteDiscount(d.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <Percent className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">
                        No discounts created yet. Use suggestions above or create one manually.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* ═══════════ TAB 5: INSIGHTS ═══════════ */}
            <TabsContent value="insights" className="space-y-6 animate-fade-in">
              {/* Category Blocks */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldBan className="h-4 w-4 text-red-500" />
                    Categories Blocked by Parents
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Number of parents who have blocked each category for their children
                  </p>
                </CardHeader>
                <CardContent>
                  {categoryBlocks.some((c) => c.blockedCount > 0) ? (
                    <>
                      <CategoryBlockChart data={categoryBlocks} />
                      <div className="flex flex-wrap gap-3 mt-3">
                        {categoryBlocks.map((c) => (
                          <div key={c.category} className="text-xs text-muted-foreground">
                            <span className="font-medium">
                              {MENU_CATEGORY_LABELS[c.category as MenuCategory]}
                            </span>
                            : {c.blockedCount} / {c.totalParents} parents ({c.percentage}%)
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No categories blocked by any parent
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Cancellation Rates */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Cancellation Rates by Item
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {cancellationData.length > 0 ? (
                    <div className="space-y-2">
                      {cancellationData.slice(0, 10).map((item) => (
                        <div key={item.name} className="flex items-center gap-3">
                          <span className="text-sm font-medium w-36 truncate">{item.name}</span>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${MENU_CATEGORY_COLORS[item.category as MenuCategory] || ""}`}
                          >
                            {MENU_CATEGORY_LABELS[item.category as MenuCategory] || item.category}
                          </Badge>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-500/70 rounded-full transition-all"
                              style={{ width: `${item.cancelRate}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-red-600 w-10 text-right">
                            {item.cancelRate}%
                          </span>
                          <span className="text-xs text-muted-foreground w-16 text-right">
                            {item.total} total
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No cancellations recorded
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Top Parents */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Top Parents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {topParents.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground text-xs">
                            <th className="text-left py-2 pr-2">#</th>
                            <th className="text-left py-2 pr-4">Parent</th>
                            <th className="text-right py-2 pr-3">Orders</th>
                            <th className="text-right py-2">Total Spent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topParents.map((p, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                              <td className="py-2 pr-4">
                                <p className="font-medium">{p.name}</p>
                                {p.childName && (
                                  <p className="text-xs text-muted-foreground">{p.childName}</p>
                                )}
                              </td>
                              <td className="py-2 pr-3 text-right font-medium">{p.orderCount}</td>
                              <td className="py-2 text-right">₹{p.totalSpent.toLocaleString("en-IN")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No parent data
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No data available</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
