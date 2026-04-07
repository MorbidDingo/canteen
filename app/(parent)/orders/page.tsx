"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  ClipboardList,
  RefreshCw,
  CreditCard,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import {
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@/lib/constants";
import Link from "next/link";
import { emitEvent, useRealtimeData } from "@/lib/events";
import { OrderFeedbackSheet } from "@/components/order-feedback-sheet";
import { CancelReasonSheet } from "@/components/cancel-reason-sheet";
import { BottomSheet } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

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
  tokenCode: string | null;
  status: string;
  totalAmount: number;
  platformFee: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  canteenId: string | null;
  canteen: { id: string; name: string; location: string | null } | null;
  items: OrderItemData[];
}

const ORDER_SHORT_ID_LENGTH = 8;

// ── Status color helpers ─────────────────────────────────
const STATUS_DOT_COLORS: Record<string, string> = {
  PLACED: "bg-blue-500",
  PREPARING: "bg-primary",
  SERVED: "bg-emerald-500",
  CANCELLED: "bg-muted-foreground/40",
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  PLACED: "text-blue-600 dark:text-blue-400",
  PREPARING: "text-primary",
  SERVED: "text-emerald-600 dark:text-emerald-400",
  CANCELLED: "text-muted-foreground",
};

// ── Date grouping ────────────────────────────────────────
function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const orderDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - orderDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function getOrderDisplayToken(order: Pick<OrderData, "id" | "tokenCode">): string {
  return order.tokenCode ?? `#${order.id.slice(0, ORDER_SHORT_ID_LENGTH).toUpperCase()}`;
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
  const [detailOrder, setDetailOrder] = useState<OrderData | null>(null);

  // Group orders by date label
  const groupedOrders = useMemo(() => {
    const groups: { label: string; orders: OrderData[] }[] = [];
    let current: { label: string; orders: OrderData[] } | null = null;
    for (const o of orders) {
      const label = getDateLabel(o.createdAt);
      if (!current || current.label !== label) {
        current = { label, orders: [] };
        groups.push(current);
      }
      current.orders.push(o);
    }
    return groups;
  }, [orders]);

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

  if (loading || sessionLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const orderTotal = (o: OrderData) => o.totalAmount + (o.platformFee ?? 0);

  const itemsSummary = (o: OrderData) =>
    o.items.map((i) => `${i.menuItem.name} × ${i.quantity}`).join(", ");

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <div className="mb-6 flex items-center justify-end">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:scale-95 transition-transform"
          onClick={() => { setLoading(true); fetchOrders(); }}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="h-12 w-12 text-muted-foreground/20 mb-3" />
          <p className="text-xl font-semibold tracking-tight">No orders yet</p>
          <Link href="/menu" className="mt-3 text-sm text-primary">
            Browse the menu
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedOrders.map((group) => (
            <div key={group.label}>
              <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-3">
                {group.orders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    className="w-full rounded-2xl bg-card p-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-transform"
                    onClick={() => setDetailOrder(order)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Square icon block */}
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted/40">
                        <ClipboardList className="h-5 w-5 text-muted-foreground/60" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* Line 1 — concatenated items */}
                        <p className="truncate text-[15px] font-semibold leading-snug">
                          {itemsSummary(order)}
                        </p>
                        {/* Line 2 — price + status */}
                        <p className="mt-1 flex items-center gap-1.5 text-[13px]">
                          <span className="tabular-nums">₹{orderTotal(order).toFixed(0)}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className={cn("inline-flex items-center gap-1", STATUS_TEXT_COLORS[order.status] ?? "text-muted-foreground")}>
                            <span className={cn("inline-block h-1.5 w-1.5 rounded-full", STATUS_DOT_COLORS[order.status] ?? "bg-muted-foreground")} />
                            {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
                            {order.status === "SERVED" && " ✓"}
                          </span>
                        </p>
                        {/* Line 3 — canteen + time */}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {order.canteen?.name ?? "Unknown"} · {formatTime(order.createdAt)} · Token {getOrderDisplayToken(order)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Order Detail Sheet ── */}
      <BottomSheet
        open={!!detailOrder}
        onClose={() => setDetailOrder(null)}
        snapPoints={[70, 92]}
      >
        {detailOrder && (
          <div className="px-5 pb-8 pt-2">
            {/* Token + order ID + canteen */}
            <p className="font-mono text-[11px] text-muted-foreground">
              Token {getOrderDisplayToken(detailOrder)}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              Order #{detailOrder.id.slice(0, ORDER_SHORT_ID_LENGTH).toUpperCase()}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {detailOrder.canteen?.name ?? "Unknown"} · {getDateLabel(detailOrder.createdAt)}, {formatTime(detailOrder.createdAt)}
            </p>

            {/* Status */}
            <div className="mt-4 flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", STATUS_DOT_COLORS[detailOrder.status] ?? "bg-muted-foreground")} />
              <span className={cn("text-base font-medium", STATUS_TEXT_COLORS[detailOrder.status] ?? "text-muted-foreground")}>
                {ORDER_STATUS_LABELS[detailOrder.status as OrderStatus] ?? detailOrder.status}
              </span>
            </div>

            {/* Line items */}
            <div className="mt-5 space-y-3">
              {detailOrder.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {item.menuItem.name} <span className="text-muted-foreground">× {item.quantity}</span>
                    </p>
                    {item.instructions && (
                      <p className="text-xs italic text-muted-foreground mt-0.5">&quot;{item.instructions}&quot;</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">₹{(item.unitPrice * item.quantity).toFixed(0)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <Separator className="my-4" />
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">₹{detailOrder.totalAmount.toFixed(0)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Platform fee</span>
                <span className="tabular-nums">₹{(detailOrder.platformFee ?? 0).toFixed(0)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-1">
                <span>Total</span>
                <span className="tabular-nums">₹{(detailOrder.totalAmount + (detailOrder.platformFee ?? 0)).toFixed(0)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 space-y-3">
              {/* Pay Now */}
              {detailOrder.paymentStatus === "UNPAID" && detailOrder.status !== "CANCELLED" && (
                <Button
                  className="w-full h-12 rounded-2xl gap-2"
                  onClick={() => handlePayNow(detailOrder.id)}
                  disabled={payingId === detailOrder.id}
                >
                  {payingId === detailOrder.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  Pay Now
                </Button>
              )}

              {/* Cancel */}
              {detailOrder.status === "PLACED" && (
                <button
                  className="w-full text-center text-sm text-red-500 py-2 active:opacity-70 transition-opacity disabled:opacity-40"
                  onClick={() => { setCancelReasonOrderId(detailOrder.id); setDetailOrder(null); }}
                  disabled={cancellingId === detailOrder.id}
                >
                  {cancellingId === detailOrder.id ? "Cancelling…" : "Cancel Order"}
                </button>
              )}

              {/* Rate */}
              {detailOrder.status === "SERVED" && !feedbackSubmitted.has(detailOrder.id) && (
                <button
                  className="w-full flex items-center justify-center gap-1.5 text-sm text-primary py-2 active:opacity-70 transition-opacity"
                  onClick={() => { setFeedbackOrderId(detailOrder.id); setDetailOrder(null); }}
                >
                  <Star className="h-4 w-4" />
                  Rate this order
                </button>
              )}
            </div>
          </div>
        )}
      </BottomSheet>

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
