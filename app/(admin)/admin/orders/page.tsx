"use client";

import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ORDER_STATUS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_COLORS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/constants";
import {
  RefreshCw,
  ChefHat,
  XCircle,
  CheckCircle,
  DollarSign,
  User,
  Phone,
  GraduationCap,
  Clock,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";
import { DailySummary } from "@/components/daily-summary";
import { emitEvent, useRealtimeData } from "@/lib/events";

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  instructions: string | null;
  menuItem: {
    id: string;
    name: string;
    category: string;
  };
}

interface OrderUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  childName: string | null;
  childGrNumber: string | null;
}

interface Order {
  id: string;
  status: OrderStatus;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  user: OrderUser;
  items: OrderItem[];
}

const STATUS_TABS: {
  value: OrderStatus;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: "PLACED", label: "Placed", icon: <Clock className="h-4 w-4" /> },
  {
    value: "PREPARING",
    label: "Preparing",
    icon: <ChefHat className="h-4 w-4" />,
  },
  {
    value: "SERVED",
    label: "Served",
    icon: <CheckCircle className="h-4 w-4" />,
  },
  {
    value: "CANCELLED",
    label: "Cancelled",
    icon: <XCircle className="h-4 w-4" />,
  },
];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrderStatus>("PLACED");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/orders");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setOrders(data.orders);
    } catch {
      toast.error("Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Instant refresh via SSE when any order event occurs
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
        throw new Error(data.error || "Failed to update");
      }

      toast.success(`Order moved to ${ORDER_STATUS_LABELS[newStatus]}`);
      fetchOrders();
      emitEvent("orders-updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update status",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const togglePayment = async (
    orderId: string,
    currentStatus: PaymentStatus,
  ) => {
    setActionLoading(orderId);
    const newStatus = currentStatus === "PAID" ? "UNPAID" : "PAID";
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentStatus: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update");
      }

      toast.success(`Payment marked as ${newStatus.toLowerCase()}`);
      fetchOrders();
      emitEvent("orders-updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update payment",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const filteredOrders = orders.filter((o) => o.status === activeTab);

  const statusCounts = orders.reduce(
    (acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Orders Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Manage and track all orders
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchOrders}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <DailySummary />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as OrderStatus)}
      >
        <TabsList className="grid w-full grid-cols-4 mb-4">
          {STATUS_TABS.map(({ value, label, icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="gap-1.5 text-xs sm:text-sm"
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
              {statusCounts[value] ? (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 min-w-5 px-1 text-[10px]"
                >
                  {statusCounts[value]}
                </Badge>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUS_TABS.map(({ value }) => (
          <TabsContent key={value} value={value} className="space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="h-40" />
                  </Card>
                ))}
              </div>
            ) : filteredOrders.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Utensils className="h-12 w-12 mb-2 opacity-40" />
                  <p>No {ORDER_STATUS_LABELS[value].toLowerCase()} orders</p>
                </CardContent>
              </Card>
            ) : (
              filteredOrders.map((orderData, index) => (
                <OrderCard
                  key={orderData.id}
                  order={orderData}
                  onUpdateStatus={updateStatus}
                  onTogglePayment={togglePayment}
                  actionLoading={actionLoading}
                  formatTime={formatTime}
                  formatDate={formatDate}
                  index={index}
                />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function OrderCard({
  order,
  onUpdateStatus,
  onTogglePayment,
  actionLoading,
  formatTime,
  formatDate,
  index,
}: {
  order: Order;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onTogglePayment: (id: string, current: PaymentStatus) => void;
  actionLoading: string | null;
  formatTime: (d: string) => string;
  formatDate: (d: string) => string;
  index: number;
}) {
  const isLoading = actionLoading === order.id;

  return (
    <Card
      className="overflow-hidden animate-fade-in-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {/* Child info */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
              {order.user.childName && (
                <div className="flex items-center gap-1 text-sm font-semibold">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  {order.user.childName}
                </div>
              )}
              {order.user.childGrNumber && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <GraduationCap className="h-3.5 w-3.5" />
                  GR: {order.user.childGrNumber}
                </div>
              )}
            </div>
            {/* Parent info */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>{order.user.name}</span>
              {order.user.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {order.user.phone}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">
              {formatDate(order.createdAt)} · {formatTime(order.createdAt)}
            </p>
            <CardTitle className="text-lg font-bold">
              ₹{order.totalAmount.toFixed(2)}
            </CardTitle>
          </div>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-3">
        {/* Order items */}
        <div className="space-y-1.5 mb-3">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between text-sm"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium">
                  {item.quantity}× {item.menuItem.name}
                </span>
                {item.instructions && (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">
                    &quot;{item.instructions}&quot;
                  </p>
                )}
              </div>
              <span className="text-muted-foreground ml-2 shrink-0">
                ₹{(item.unitPrice * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {/* Status badges & actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={`${ORDER_STATUS_COLORS[order.status]} ${order.status === "PLACED" ? "badge-pulse" : ""}`}
          >
            {ORDER_STATUS_LABELS[order.status]}
          </Badge>
          <Badge
            className={`${PAYMENT_STATUS_COLORS[order.paymentStatus]} cursor-pointer`}
            onClick={() =>
              !isLoading && onTogglePayment(order.id, order.paymentStatus)
            }
          >
            <DollarSign className="h-3 w-3 mr-0.5" />
            {order.paymentStatus}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {order.paymentMethod}
          </Badge>

          <div className="flex-1" />

          {/* Action buttons */}
          {order.status === ORDER_STATUS.PLACED && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                className="gap-1 h-8 text-xs"
                disabled={isLoading}
                onClick={() => onUpdateStatus(order.id, "CANCELLED")}
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                size="sm"
                className="gap-1 h-8 text-xs bg-yellow-600 hover:bg-yellow-700"
                disabled={isLoading}
                onClick={() => onUpdateStatus(order.id, "PREPARING")}
              >
                <ChefHat className="h-3.5 w-3.5" />
                Start Preparing
              </Button>
            </div>
          )}
          {order.status === ORDER_STATUS.PREPARING && (
            <Button
              size="sm"
              className="gap-1 h-8 text-xs bg-blue-600 hover:bg-blue-700"
              disabled={isLoading}
              onClick={() => onUpdateStatus(order.id, "SERVED")}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Mark Served
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
