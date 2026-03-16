"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  ChefHat,
  CheckCircle,
  Clock,
  GraduationCap,
  Package,
  Phone,
  RefreshCw,
  User,
  Utensils,
  XCircle,
  CalendarRange,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

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
  createdAt: string;
  updatedAt: string;
  user: OrderUser;
  items: OrderItem[];
};

type AdminPreOrder = {
  id: string;
  mode: "ONE_DAY" | "SUBSCRIPTION";
  status: "PENDING" | "FULFILLED" | "EXPIRED" | "CANCELLED";
  scheduledDate: string;
  subscriptionUntil: string | null;
  lastFulfilledDate: string | null;
  createdAt: string;
  childId: string;
  childName: string;
  parentName: string;
  parentEmail: string;
  items: Array<{ menuItemId: string; menuItemName: string; quantity: number }>;
};

type PrepDemandItem = {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  fromOneDay: number;
  fromSubscription: number;
};

type PreOrderSummary = {
  oneDayCount: number;
  subscriptionCount: number;
  totalPlannedItems: number;
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [subscriptions, setSubscriptions] = useState<AdminPreOrder[]>([]);
  const [prepDemand, setPrepDemand] = useState<PrepDemandItem[]>([]);
  const [prepSummary, setPrepSummary] = useState<PreOrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [ordersRes, preOrdersRes] = await Promise.all([
        fetch("/api/admin/orders"),
        fetch("/api/admin/pre-orders"),
      ]);

      if (!ordersRes.ok || !preOrdersRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const ordersData = await ordersRes.json();
      const preOrdersData = await preOrdersRes.json();

      setOrders(ordersData.orders ?? []);
      setSubscriptions(preOrdersData.subscriptions ?? []);
      setPrepDemand(preOrdersData.prepDemand ?? []);
      setPrepSummary(preOrdersData.summary ?? null);
    } catch {
      toast.error("Failed to fetch canteen operations data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useRealtimeData(fetchAll, "orders-updated");

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
      fetchAll();
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
      fetchAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update payment");
    } finally {
      setActionLoading(null);
    }
  };

  const placedOrders = useMemo(() => orders.filter((order) => order.status === ORDER_STATUS.PLACED), [orders]);
  const preparingOrders = useMemo(() => orders.filter((order) => order.status === ORDER_STATUS.PREPARING), [orders]);
  const servedCount = useMemo(() => orders.filter((order) => order.status === ORDER_STATUS.SERVED).length, [orders]);
  const cancelledCount = useMemo(() => orders.filter((order) => order.status === ORDER_STATUS.CANCELLED).length, [orders]);

  return (
    <div className="container mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Canteen Orders</h1>
          <p className="text-sm text-muted-foreground">
            Quick order accepting and status updates for active kitchen work.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link href="/admin/orders/history">
            <Button variant="secondary" size="sm" className="gap-2">
              Served & Metrics
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatusCountCard title="Placed" value={placedOrders.length} colorClass="text-[#2eab57]" />
        <StatusCountCard title="Preparing" value={preparingOrders.length} colorClass="text-[#f58220]" />
        <StatusCountCard title="Served" value={servedCount} colorClass="text-[#1a3a8f]" />
        <StatusCountCard title="Cancelled" value={cancelledCount} colorClass="text-[#e32726]" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4" />
            Today&apos;s Subscriptions ({subscriptions.length})
          </CardTitle>
          <CardDescription>
            Active subscriptions due today. No manual acceptance required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {subscriptions.length === 0 ? (
            <EmptyState message="No active subscriptions for today." />
          ) : (
            subscriptions.map((subscription) => (
              <div key={subscription.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{subscription.childName}</p>
                    <p className="text-xs text-muted-foreground">Parent: {subscription.parentName}</p>
                  </div>
                  <Badge variant="outline">Active</Badge>
                </div>
                <div className="mt-2 space-y-1">
                  {subscription.items.map((item) => (
                    <p key={item.menuItemId} className="text-xs text-muted-foreground">
                      {item.quantity}x {item.menuItemName}
                    </p>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {prepDemand.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              Prep Demand — Items to Make Today
              {prepSummary && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {prepSummary.totalPlannedItems} total items
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Aggregated quantities of each item across all pre-orders and subscriptions due today.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {prepDemand.map((item) => (
                <div key={item.menuItemId} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-semibold">{item.menuItemName}</p>
                    <div className="flex gap-3 mt-0.5">
                      {item.fromSubscription > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {item.fromSubscription} from subscriptions
                        </span>
                      )}
                      {item.fromOneDay > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {item.fromOneDay} from one-day
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-[#1a3a8f]">{item.quantity}</p>
                    <p className="text-xs text-muted-foreground">to make</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-[#2eab57]" />
              Placed Orders ({placedOrders.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : placedOrders.length === 0 ? (
              <EmptyState message="No newly placed orders." />
            ) : (
              placedOrders.map((order) => (
                <OrderOperationCard
                  key={order.id}
                  order={order}
                  actionLoading={actionLoading}
                  onUpdateStatus={updateStatus}
                  onTogglePayment={togglePayment}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ChefHat className="h-4 w-4 text-[#f58220]" />
              Preparing Orders ({preparingOrders.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : preparingOrders.length === 0 ? (
              <EmptyState message="No orders in preparation." />
            ) : (
              preparingOrders.map((order) => (
                <OrderOperationCard
                  key={order.id}
                  order={order}
                  actionLoading={actionLoading}
                  onUpdateStatus={updateStatus}
                  onTogglePayment={togglePayment}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Served and cancelled orders, plus full summary metrics, are available on the <strong>Served & Metrics</strong> page.
      </p>
    </div>
  );
}

function StatusCountCard({ title, value, colorClass }: { title: string; value: number; colorClass: string }) {
  return (
    <Card>
      <CardContent className="py-3 text-center">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function OrderOperationCard({
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

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{order.user.childName || order.user.name}</p>
            {order.user.childGrNumber ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <GraduationCap className="h-3 w-3" />
                GR {order.user.childGrNumber}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {order.user.name}
            </span>
            {order.user.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {order.user.phone}
              </span>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">Rs{order.totalAmount.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(order.createdAt).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      <Separator className="my-2" />

      <div className="space-y-1">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-2 text-sm">
            <span>
              {item.quantity}x {item.menuItem.name}
            </span>
            <span className="text-muted-foreground">Rs{(item.quantity * item.unitPrice).toFixed(0)}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge className={ORDER_STATUS_COLORS[order.status]}>{ORDER_STATUS_LABELS[order.status]}</Badge>
        <Badge
          className={`${PAYMENT_STATUS_COLORS[order.paymentStatus]} cursor-pointer`}
          onClick={() => !isLoading && onTogglePayment(order.id, order.paymentStatus)}
        >
          {order.paymentStatus}
        </Badge>

        <div className="flex-1" />

        {order.status === ORDER_STATUS.PLACED ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading}
              className="h-8 text-xs"
              onClick={() => onUpdateStatus(order.id, "CANCELLED")}
            >
              <XCircle className="mr-1 h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isLoading}
              className="h-8 text-xs bg-[#f58220] hover:bg-[#e07312]"
              onClick={() => onUpdateStatus(order.id, "PREPARING")}
            >
              <ChefHat className="mr-1 h-3.5 w-3.5" />
              Start
            </Button>
          </>
        ) : null}

        {order.status === ORDER_STATUS.PREPARING ? (
          <Button
            size="sm"
            disabled={isLoading}
            className="h-8 text-xs bg-[#1a3a8f] hover:bg-[#143073]"
            onClick={() => onUpdateStatus(order.id, "SERVED")}
          >
            <CheckCircle className="mr-1 h-3.5 w-3.5" />
            Serve
          </Button>
        ) : null}
      </div>
    </div>
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
