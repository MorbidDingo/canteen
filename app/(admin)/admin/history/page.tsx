"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useRealtimeData } from "@/lib/events";
import {
  ORDER_STATUS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/constants";
import { Search, RefreshCw, Utensils, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CanteenSelector } from "@/components/canteen-selector";
import { usePersistedSelection } from "@/lib/use-persisted-selection";

type OrderItem = {
  id: string;
  quantity: number;
  unitPrice: number;
  instructions: string | null;
  menuItem: { id: string; name: string };
};

type Order = {
  id: string;
  status: OrderStatus;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; childName: string | null };
  items: OrderItem[];
};

type StatusFilter = "ALL" | "SERVED" | "CANCELLED";

export default function AdminHistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const {
    value: selectedCanteen,
    setValue: setSelectedCanteen,
    hydrated: canteenHydrated,
  } = usePersistedSelection("certe:admin-selected-canteen-id");

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const url = selectedCanteen
        ? `/api/admin/orders?canteenId=${encodeURIComponent(selectedCanteen)}`
        : "/api/admin/orders";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch {
      toast.error("Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  }, [selectedCanteen]);

  useEffect(() => {
    if (!canteenHydrated) return;
    fetchOrders();
  }, [fetchOrders, canteenHydrated]);

  useRealtimeData(fetchOrders, "orders-updated");

  // Only completed orders (served + cancelled)
  const historyOrders = useMemo(
    () => orders.filter((o) => o.status === ORDER_STATUS.SERVED || o.status === ORDER_STATUS.CANCELLED),
    [orders],
  );

  // Apply status filter
  const statusFiltered = useMemo(() => {
    if (statusFilter === "ALL") return historyOrders;
    return historyOrders.filter((o) => o.status === statusFilter);
  }, [historyOrders, statusFilter]);

  // Apply search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return statusFiltered;
    const q = search.toLowerCase();
    return statusFiltered.filter(
      (o) =>
        (o.user.childName && o.user.childName.toLowerCase().includes(q)) ||
        o.user.name.toLowerCase().includes(q),
    );
  }, [statusFiltered, search]);

  const displayed = filtered.slice(0, 100);

  // Summary stats from currently displayed orders
  const stats = useMemo(() => {
    const servedOrders = displayed.filter((o) => o.status === ORDER_STATUS.SERVED);
    const cancelledOrders = displayed.filter((o) => o.status === ORDER_STATUS.CANCELLED);
    const revenue = servedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    return {
      served: servedOrders.length,
      cancelled: cancelledOrders.length,
      revenue,
    };
  }, [displayed]);

  // Counts from all history orders (for pills)
  const totalServed = useMemo(() => historyOrders.filter((o) => o.status === ORDER_STATUS.SERVED).length, [historyOrders]);
  const totalCancelled = useMemo(() => historyOrders.filter((o) => o.status === ORDER_STATUS.CANCELLED).length, [historyOrders]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Order History</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchOrders}
          disabled={loading}
          className="h-8 w-8"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Canteen selector */}
      <CanteenSelector
        value={selectedCanteen}
        onChange={setSelectedCanteen}
        showAll
        compact
      />

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border bg-[#2eab57]/5 p-3 text-center">
          <p className="text-lg font-bold text-[#1e7a3c]">{stats.served}</p>
          <p className="text-[11px] text-muted-foreground">Served</p>
        </div>
        <div className="rounded-lg border bg-[#e32726]/5 p-3 text-center">
          <p className="text-lg font-bold text-[#e32726]">{stats.cancelled}</p>
          <p className="text-[11px] text-muted-foreground">Cancelled</p>
        </div>
        <div className="rounded-lg border bg-[#1a3a8f]/5 p-3 text-center">
          <p className="text-lg font-bold text-[#1a3a8f]">₹{stats.revenue.toFixed(0)}</p>
          <p className="text-[11px] text-muted-foreground">Revenue</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by student or parent name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 text-sm"
        />
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          { key: "ALL" as StatusFilter, label: "All", count: historyOrders.length },
          { key: "SERVED" as StatusFilter, label: "Served", count: totalServed },
          { key: "CANCELLED" as StatusFilter, label: "Cancelled", count: totalCancelled },
        ]).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === key
                ? "border-foreground/30 bg-foreground/10 text-foreground"
                : "border-transparent bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {label}
            <span className="font-bold">{count}</span>
          </button>
        ))}
      </div>

      <Separator />

      {/* Order list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="py-16 text-center">
          <Utensils className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            {search.trim() ? "No orders match your search" : "No completed orders yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Served and cancelled orders appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((order) => (
            <HistoryCard key={order.id} order={order} />
          ))}
          {filtered.length > 100 && (
            <p className="text-center text-xs text-muted-foreground">
              Showing 100 of {filtered.length} orders
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryCard({ order }: { order: Order }) {
  const itemsSummary = order.items
    .map((item) => `${item.quantity}x ${item.menuItem.name}`)
    .join(", ");

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        {/* Name + time */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight">
              {order.user.childName || order.user.name}
            </p>
            {order.user.childName && (
              <p className="text-[11px] text-muted-foreground">{order.user.name}</p>
            )}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {new Date(order.updatedAt).toLocaleString("en-IN", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {/* Items on one line */}
        <p className="truncate text-xs leading-snug text-muted-foreground">{itemsSummary}</p>

        {/* Special requests / instructions */}
        {order.items.some((item) => item.instructions) && (
          <p className="truncate text-xs italic text-amber-600 dark:text-amber-400 leading-snug">
            📝 {order.items
              .filter((item) => item.instructions)
              .map((item) => item.instructions)
              .join("; ")}
          </p>
        )}

        {/* Amount + badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold">₹{order.totalAmount.toFixed(0)}</span>
          <Badge className={`${ORDER_STATUS_COLORS[order.status]} px-1.5 py-0 text-[10px]`}>
            {ORDER_STATUS_LABELS[order.status]}
          </Badge>
          <Badge className={`${PAYMENT_STATUS_COLORS[order.paymentStatus]} px-1.5 py-0 text-[10px]`}>
            {order.paymentStatus}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
