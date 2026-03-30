"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  ClipboardList,
  XCircle,
  RefreshCw,
  CreditCard,
  Star,
  Search,
  Store,
  TrendingUp,
  IndianRupee,
} from "lucide-react";
import { toast } from "sonner";
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/constants";
import Link from "next/link";
import { emitEvent, useRealtimeData } from "@/lib/events";
import { OrderFeedbackSheet } from "@/components/order-feedback-sheet";
import { CancelReasonSheet } from "@/components/cancel-reason-sheet";

// Razorpay types for window
declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  close: () => void;
}

interface OrderItemData {
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

interface OrderData {
  id: string;
  status: string;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  canteenId: string | null;
  canteen: { id: string; name: string; location: string | null } | null;
  items: OrderItemData[];
}

// Returns the Monday of the week containing the given date (local time)
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStartStr: string): string {
  const start = new Date(weekStartStr + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${start.toLocaleDateString("en-IN", opts)} – ${end.toLocaleDateString("en-IN", opts)}`;
}

export default function OrdersPage() {
  const { data: session, isPending: sessionLoading } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [feedbackOrderId, setFeedbackOrderId] = useState<string | null>(null);
  const [cancelReasonOrderId, setCancelReasonOrderId] = useState<string | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // Filtered orders based on search
  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const inId = o.id.toLowerCase().includes(q);
      const inItems = o.items.some((i) => i.menuItem.name.toLowerCase().includes(q));
      const inCanteen = o.canteen?.name.toLowerCase().includes(q) ?? false;
      return inId || inItems || inCanteen;
    });
  }, [orders, searchQuery]);

  // Week-wise spend (from filtered orders, only PAID and non-cancelled)
  const weeklySpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of filteredOrders) {
      if (o.status === "CANCELLED" || o.paymentStatus !== "PAID") continue;
      const week = getWeekStart(new Date(o.createdAt));
      map.set(week, (map.get(week) ?? 0) + o.totalAmount);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a)) // newest week first
      .slice(0, 6); // show last 6 weeks
  }, [filteredOrders]);

  // Load Razorpay checkout script
  useEffect(() => {
    if (typeof window !== "undefined" && !window.Razorpay) {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setOrders(data.orders);
    } catch {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionLoading && !session) {
      router.push("/login");
      return;
    }
    if (session) {
      fetchOrders();
    }
  }, [session, sessionLoading, router, fetchOrders]);

  // Instant refresh via SSE when any order event occurs
  useRealtimeData(fetchOrders, "orders-updated");

  const handleCancel = async (orderId: string, reason?: string, otherText?: string) => {
    setCancellingId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, otherText }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel");
      }

      toast.success("Order cancelled");
      fetchOrders();
      emitEvent("orders-updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel order",
      );
      throw error; // Re-throw so CancelReasonSheet knows it failed
    } finally {
      setCancellingId(null);
    }
  };

  const handlePayNow = async (orderId: string) => {
    setPayingId(orderId);
    try {
      // Create Razorpay order
      const res = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create payment order");
      }

      const { razorpayOrderId, amount, currency, keyId } = await res.json();

      if (!window.Razorpay) {
        throw new Error("Payment SDK not loaded. Please refresh the page.");
      }

      const options: RazorpayOptions = {
        key: keyId,
        amount,
        currency,
        name: "certe",
        description: "Food order payment",
        order_id: razorpayOrderId,
        handler: async (response: RazorpayResponse) => {
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                orderId,
              }),
            });

            if (!verifyRes.ok) {
              const data = await verifyRes.json();
              throw new Error(data.error || "Payment verification failed");
            }

            toast.success("Payment successful!");
            fetchOrders();
            emitEvent("orders-updated");
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : "Payment verification failed",
            );
          } finally {
            setPayingId(null);
          }
        },
        prefill: {
          name: session?.user?.name || "",
          email: session?.user?.email || "",
        },
        theme: { color: "#d4891a" },
        modal: {
          ondismiss: () => {
            setPayingId(null);
            toast.info("Payment cancelled");
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to initiate payment",
      );
      setPayingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading || sessionLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-header-card mb-5 flex items-center justify-between gap-3 animate-fade-in">
        <div>
          <h1 className="app-title">My Orders</h1>
          <p className="app-subtitle">Track and manage your orders</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 rounded-lg"
          onClick={() => {
            setLoading(true);
            fetchOrders();
          }}
        >
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-semibold">No orders yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your order history will appear here
          </p>
          <Link href="/menu">
            <Button className="mt-6">Browse Menu</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── Search bar ── */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search orders, items…"
              className="pl-9"
            />
          </div>

          {/* ── Week-wise spend ── */}
          {weeklySpend.length > 0 && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#d4891a]" />
                <span className="text-sm font-semibold">Weekly Spend</span>
                <span className="text-xs text-muted-foreground">(paid orders only)</span>
              </div>
              <div className="space-y-2">
                {weeklySpend.map(([week, total]) => (
                  <div key={week} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{formatWeekLabel(week)}</span>
                    <div className="flex items-center gap-1 font-semibold text-sm">
                      <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                      {total.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Order list ── */}
          {filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No orders match your filters</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order, index) => (
                <Card
                  key={order.id}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base">
                          Order #{order.id.slice(0, 8)}
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs text-muted-foreground">
                            {formatDate(order.createdAt)}
                          </p>
                          {order.canteen && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                              <Store className="h-3 w-3 text-[#d4891a]" />
                              {order.canteen.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={ORDER_STATUS_COLORS[order.status as OrderStatus]}>
                          {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                        </Badge>
                        <Badge className={PAYMENT_STATUS_COLORS[order.paymentStatus as PaymentStatus]}>
                          {order.paymentStatus}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <div>
                            <span className="font-medium">{item.menuItem.name}</span>
                            <span className="text-muted-foreground"> × {item.quantity}</span>
                            {item.instructions && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">
                                &quot;{item.instructions}&quot;
                              </p>
                            )}
                          </div>
                          <span>₹{(item.unitPrice * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between font-semibold">
                        <span>Total</span>
                        <span>₹{order.totalAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </CardContent>
                  {(order.status === "PLACED" ||
                    order.status === "SERVED" ||
                    (order.paymentStatus === "UNPAID" && order.status !== "CANCELLED")) && (
                    <CardFooter className="flex flex-wrap gap-2">
                      {order.paymentStatus === "UNPAID" && order.status !== "CANCELLED" && (
                        <Button
                          size="sm"
                          className="gap-2 sm:w-auto active:scale-95 transition-transform"
                          onClick={() => handlePayNow(order.id)}
                          disabled={payingId === order.id}
                        >
                          {payingId === order.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CreditCard className="h-4 w-4" />
                          )}
                          Pay Now
                        </Button>
                      )}
                      {order.status === "PLACED" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="gap-2 sm:w-auto active:scale-95 transition-transform"
                          onClick={() => setCancelReasonOrderId(order.id)}
                          disabled={cancellingId === order.id}
                        >
                          {cancellingId === order.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          Cancel Order
                        </Button>
                      )}
                      {order.status === "SERVED" && !feedbackSubmitted.has(order.id) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2 sm:w-auto active:scale-95 transition-transform"
                          onClick={() => setFeedbackOrderId(order.id)}
                        >
                          <Star className="h-4 w-4" />
                          Rate Order
                        </Button>
                      )}
                      {order.status === "SERVED" && feedbackSubmitted.has(order.id) && (
                        <Badge variant="secondary" className="gap-1.5">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          Reviewed
                        </Badge>
                      )}
                    </CardFooter>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Feedback BottomSheet */}
      {feedbackOrderId && (
        <OrderFeedbackSheet
          orderId={feedbackOrderId}
          open={!!feedbackOrderId}
          onOpenChange={(open) => {
            if (!open) setFeedbackOrderId(null);
          }}
          onSubmitted={() => {
            setFeedbackSubmitted((prev) => new Set([...prev, feedbackOrderId]));
          }}
        />
      )}

      {/* Cancel Reason BottomSheet */}
      {cancelReasonOrderId && (
        <CancelReasonSheet
          orderId={cancelReasonOrderId}
          open={!!cancelReasonOrderId}
          onOpenChange={(open) => {
            if (!open) setCancelReasonOrderId(null);
          }}
          onConfirm={async (reason, otherText) => {
            await handleCancel(cancelReasonOrderId, reason, otherText);
          }}
        />
      )}
    </div>
  );
}
