"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ORDER_STATUS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/constants";
import { emitEvent, useRealtimeData } from "@/lib/events";
import { ChefHat, CheckCircle, Clock, XCircle, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CanteenSelector } from "@/components/canteen-selector";
import { usePersistedSelection } from "@/lib/use-persisted-selection";

type OrderItem = {
  id: string;
  quantity: number;
  unitPrice: number;
  instructions: string | null;
  menuItem: {
    id: string;
    name: string;
    category: string;
  };
};

type OrderUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  childName: string | null;
  childGrNumber: string | null;
};

type Order = {
  id: string;
  status: OrderStatus;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  tokenCode: string | null;
  createdAt: string;
  updatedAt: string;
  user: OrderUser;
  items: OrderItem[];
};

type StatusFilter = OrderStatus | "ACTIVE";

const STATUS_PILL_CONFIG: { key: StatusFilter; label: string; color: string; icon: typeof Clock }[] = [
  { key: "PLACED", label: "Placed", color: "bg-[#2eab57]/15 text-[#1e7a3c] border-[#2eab57]/30", icon: Clock },
  { key: "PREPARING", label: "Preparing", color: "bg-[#f58220]/15 text-[#c66a10] border-[#f58220]/30", icon: ChefHat },
  { key: "SERVED", label: "Served", color: "bg-[#1a3a8f]/10 text-[#1a3a8f] border-[#1a3a8f]/20", icon: CheckCircle },
  { key: "CANCELLED", label: "Cancelled", color: "bg-[#e32726]/10 text-[#e32726] border-[#e32726]/20", icon: XCircle },
];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
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
      if (!res.ok) throw new Error("Failed to fetch orders");
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

  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    setActionLoading(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update order status");
      }

      toast.success(`Order moved to ${ORDER_STATUS_LABELS[newStatus]}`);
      emitEvent("orders-updated");
      fetchOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    } finally {
      setActionLoading(null);
    }
  };

  const togglePayment = async (orderId: string, currentStatus: PaymentStatus) => {
    setActionLoading(orderId);
    const nextStatus = currentStatus === "PAID" ? "UNPAID" : "PAID";

    try {
      const res = await fetch(`/api/admin/orders/${orderId}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: nextStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update payment");
      }

      toast.success(`Payment marked as ${nextStatus.toLowerCase()}`);
      emitEvent("orders-updated");
      fetchOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update payment");
    } finally {
      setActionLoading(null);
    }
  };

  const counts = useMemo(() => ({
    PLACED: orders.filter((o) => o.status === ORDER_STATUS.PLACED).length,
    PREPARING: orders.filter((o) => o.status === ORDER_STATUS.PREPARING).length,
    SERVED: orders.filter((o) => o.status === ORDER_STATUS.SERVED).length,
    CANCELLED: orders.filter((o) => o.status === ORDER_STATUS.CANCELLED).length,
  }), [orders]);

  const filtered = useMemo(() => {
    if (statusFilter === "ACTIVE") {
      return orders.filter((o) => o.status === "PLACED" || o.status === "PREPARING");
    }
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Orders</h1>
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

      {/* Status pills row */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setStatusFilter("ACTIVE")}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            statusFilter === "ACTIVE"
              ? "border-foreground/30 bg-foreground/10 text-foreground"
              : "border-transparent bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Active
          <span className="font-bold">{counts.PLACED + counts.PREPARING}</span>
        </button>
        {STATUS_PILL_CONFIG.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === key
                ? color
                : "border-transparent bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {label}
            <span className="font-bold">{counts[key as OrderStatus]}</span>
          </button>
        ))}
      </div>

      <Separator />

      {/* Order list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            {statusFilter === "ACTIVE"
              ? "No active orders right now"
              : `No ${ORDER_STATUS_LABELS[statusFilter as OrderStatus].toLowerCase()} orders`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Orders will appear here in real-time
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              actionLoading={actionLoading}
              onUpdateStatus={updateStatus}
              onTogglePayment={togglePayment}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  actionLoading,
  onUpdateStatus,
  onTogglePayment,
}: {
  order: Order;
  actionLoading: string | null;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onTogglePayment: (id: string, current: PaymentStatus) => void;
}) {
  const isLoading = actionLoading === order.id;
  const itemsSummary = order.items
    .map((item) => `${item.quantity}x ${item.menuItem.name}`)
    .join(", ");

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        {/* Name + time */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold leading-tight">
              {order.user.childName || order.user.name}
            </p>
            {order.tokenCode && (
              <p className="text-xs font-mono font-bold text-[#d4891a] leading-tight mt-0.5">
                {order.tokenCode}
              </p>
            )}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {new Date(order.createdAt).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {/* Items on one line */}
        <p className="text-xs text-muted-foreground leading-snug">{itemsSummary}</p>

        {/* Special requests / instructions */}
        {order.items.some((item) => item.instructions) && (
          <p className="text-xs italic text-amber-600 dark:text-amber-400 leading-snug">
            📝 {order.items
              .filter((item) => item.instructions)
              .map((item) => item.instructions)
              .join("; ")}
          </p>
        )}

        {/* Amount + badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold">₹{order.totalAmount.toFixed(0)}</span>
          <Badge className={`${ORDER_STATUS_COLORS[order.status]} text-[10px] px-1.5 py-0`}>
            {ORDER_STATUS_LABELS[order.status]}
          </Badge>
          <Badge
            className={`${PAYMENT_STATUS_COLORS[order.paymentStatus]} cursor-pointer text-[10px] px-1.5 py-0`}
            onClick={() => !isLoading && onTogglePayment(order.id, order.paymentStatus)}
          >
            {order.paymentStatus}
          </Badge>
        </div>

        {/* Action buttons */}
        {order.status === ORDER_STATUS.PLACED && (
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              className="h-9 flex-1 text-xs"
              onClick={() => onUpdateStatus(order.id, "CANCELLED")}
            >
              {isLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1 h-3.5 w-3.5" />}
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isLoading}
              className="h-9 flex-[2] bg-[#f58220] text-white hover:bg-[#e07312]"
              onClick={() => onUpdateStatus(order.id, "PREPARING")}
            >
              {isLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ChefHat className="mr-1 h-4 w-4" />}
              Prepare
            </Button>
          </div>
        )}

        {order.status === ORDER_STATUS.PREPARING && (
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              className="h-9 flex-1 text-xs"
              onClick={() => onUpdateStatus(order.id, "CANCELLED")}
            >
              {isLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1 h-3.5 w-3.5" />}
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isLoading}
              className="h-9 flex-[2] bg-[#2eab57] text-white hover:bg-[#249a4a]"
              onClick={() => onUpdateStatus(order.id, "SERVED")}
            >
              {isLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1 h-4 w-4" />}
              Serve
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
