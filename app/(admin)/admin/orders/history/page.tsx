"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DailySummary } from "@/components/daily-summary";
import { useRealtimeData } from "@/lib/events";
import {
  ORDER_STATUS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/constants";
import { ArrowLeft, RefreshCw, Utensils } from "lucide-react";
import { toast } from "sonner";

type OrderItem = {
  id: string;
  quantity: number;
  unitPrice: number;
  menuItem: {
    id: string;
    name: string;
  };
};

type Order = {
  id: string;
  status: OrderStatus;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    childName: string | null;
  };
  items: OrderItem[];
};

export default function AdminOrdersHistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/orders");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch {
      toast.error("Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useRealtimeData(fetchOrders, "orders-updated");

  const served = useMemo(() => orders.filter((o) => o.status === ORDER_STATUS.SERVED), [orders]);
  const cancelled = useMemo(() => orders.filter((o) => o.status === ORDER_STATUS.CANCELLED), [orders]);

  return (
    <div className="container mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Served & Metrics</h1>
          <p className="text-sm text-muted-foreground">Historical queue plus full summary numbers.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/orders">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Active Orders
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={fetchOrders} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <DailySummary />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OrderListSection title={`Served (${served.length})`} orders={served} />
        <OrderListSection title={`Cancelled (${cancelled.length})`} orders={cancelled} />
      </div>
    </div>
  );
}

function OrderListSection({ title, orders }: { title: string; orders: Order[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {orders.length === 0 ? (
          <EmptyState message={`No ${title.toLowerCase()} orders.`} />
        ) : (
          orders.slice(0, 100).map((order) => (
            <div key={order.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{order.user.childName || order.user.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.updatedAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">Rs{order.totalAmount.toFixed(0)}</p>
                  <Badge className={ORDER_STATUS_COLORS[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                </div>
              </div>

              <Separator className="my-2" />

              <div className="space-y-1 text-sm">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-2">
                    <span>{item.quantity}x {item.menuItem.name}</span>
                    <span className="text-muted-foreground">Rs{(item.quantity * item.unitPrice).toFixed(0)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-2">
                <Badge className={PAYMENT_STATUS_COLORS[order.paymentStatus]}>{order.paymentStatus}</Badge>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
      <Utensils className="mx-auto mb-2 h-5 w-5 opacity-60" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
