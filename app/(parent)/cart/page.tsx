"use client";

import { useCartStore } from "@/lib/store/cart-store";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { emitEvent } from "@/lib/events";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingCart,
  Loader2,
  UtensilsCrossed,
  CreditCard,
  Wallet,
  Check,
  ArrowRight,
  IndianRupee,
} from "lucide-react";
import { toast } from "sonner";
import { PREDEFINED_INSTRUCTIONS } from "@/lib/constants";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/constants";

// Extend Window for Razorpay checkout
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

type ChildWallet = {
  childId: string;
  childName: string;
  balance: number;
};

type ChildInfo = {
  id: string;
  name: string;
};

type ItemChildAllocations = Record<string, Record<string, number>>;

type SlideState = "idle" | "sliding" | "paying" | "paid";

export default function CartPage() {
  const {
    items,
    updateQuantity,
    removeItem,
    updateInstructions,
    clearCart,
    getTotal,
  } = useCartStore();
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("ONLINE");

  // Wallet state
  const [wallets, setWallets] = useState<ChildWallet[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [itemChildAllocations, setItemChildAllocations] = useState<ItemChildAllocations>({});

  // Slide-to-pay state
  const [slideState, setSlideState] = useState<SlideState>("idle");
  const [slideX, setSlideX] = useState(0);
  const slideTrackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Load Razorpay checkout script
  useEffect(() => {
    if (typeof window !== "undefined" && !window.Razorpay) {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // Fetch wallets when wallet payment is selected
  const fetchWallets = useCallback(async () => {
    setWalletsLoading(true);
    try {
      const res = await fetch("/api/wallet");
      if (res.ok) {
        const data: ChildWallet[] = await res.json();
        setWallets(data);
        setSelectedChildId((prev) => {
          if (!prev && data.length > 0) return data[0].childId;
          return prev;
        });
      }
    } catch {
      toast.error("Failed to load wallets");
    } finally {
      setWalletsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (paymentMethod === "WALLET") {
      fetchWallets();
    }
  }, [paymentMethod, fetchWallets]);



  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/children");
        if (!res.ok) return;
        const data = await res.json();
        const kids: ChildInfo[] = data.children || data || [];
        setChildren(kids);
      } catch {
        // silently fail
      }
    })();
  }, []);

  useEffect(() => {
    if (children.length === 0) return;
    setItemChildAllocations((prev) => {
      const next = { ...prev };
      for (const item of items) {
        const existing = next[item.menuItemId] || {};
        const filtered = Object.fromEntries(
          Object.entries(existing).filter(([childId]) =>
            children.some((child) => child.id === childId)
          )
        );
        const assigned = Object.values(filtered).reduce((sum, qty) => sum + qty, 0);
        const defaultChildId = Object.keys(filtered)[0] || children[0]?.id;

        if (defaultChildId) {
          if (assigned === 0) {
            filtered[defaultChildId] = item.quantity;
          } else if (assigned !== item.quantity) {
            filtered[defaultChildId] = Math.max(
              0,
              (filtered[defaultChildId] || 0) + (item.quantity - assigned)
            );
          }
          next[item.menuItemId] = filtered;
        } else {
          delete next[item.menuItemId];
        }
      }
      for (const key of Object.keys(next)) {
        if (!items.some((item) => item.menuItemId === key)) {
          delete next[key];
        }
      }
      return next;
    });
  }, [items, children]);

  // Reset slide state when payment method changes
  useEffect(() => {
    setSlideState("idle");
    setSlideX(0);
  }, [paymentMethod]);

  const selectedWallet = wallets.find((w) => w.childId === selectedChildId);
  const total = getTotal();
  const childNameById = useMemo(
    () => new Map(children.map((c) => [c.id, c.name])),
    [children]
  );
  const getAssignedQty = (menuItemId: string) =>
    Object.values(itemChildAllocations[menuItemId] || {}).reduce(
      (sum, qty) => sum + qty,
      0
    );

  const getItemRemainingQty = (menuItemId: string, totalQty: number) =>
    Math.max(0, totalQty - getAssignedQty(menuItemId));

  const getAllocationSummary = (menuItemId: string) => {
    const parts = Object.entries(itemChildAllocations[menuItemId] || {})
      .filter(([, qty]) => qty > 0)
      .map(([childId, qty]) => {
        const childName = children.find((c) => c.id === childId)?.name || "Child";
        return `${childName} × ${qty}`;
      });

    return parts.length > 0 ? ` (${parts.join(", ")})` : "";
  };

  const updateChildAllocation = (
    menuItemId: string,
    childId: string,
    nextQty: number
  ) => {
    const item = items.find((i) => i.menuItemId === menuItemId);
    if (!item) return;
    const clamped = Math.max(0, Math.min(item.quantity, nextQty));
    setItemChildAllocations((prev) => ({
      ...prev,
      [menuItemId]: {
        ...(prev[menuItemId] || {}),
        [childId]: clamped,
      },
    }));
  };

  const getChildTotals = () => {
    const totals = new Map<string, number>();
    for (const item of items) {
      const allocations = itemChildAllocations[item.menuItemId] || {};
      const itemPrice = item.discountedPrice ?? item.price;
      for (const [childId, qty] of Object.entries(allocations)) {
        if (qty <= 0) continue;
        totals.set(childId, (totals.get(childId) || 0) + itemPrice * qty);
      }
    }
    return totals;
  };

  const childTotals = getChildTotals();
  const familyWalletBalance = wallets[0]?.balance ?? 0;
  const familyWalletRequired = [...childTotals.values()].reduce(
    (sum, amount) => sum + amount,
    0
  );
  const hasEnoughBalance =
    familyWalletRequired > 0 &&
    familyWalletBalance >= familyWalletRequired;

  const buildChildOrderGroups = () => {
    const groups = new Map<string, typeof items>();
    for (const item of items) {
      const allocations = itemChildAllocations[item.menuItemId] || {};
      const assignedQty = Object.values(allocations).reduce(
        (sum, qty) => sum + qty,
        0
      );

      if (assignedQty !== item.quantity) {
        const remainingQty = Math.max(0, item.quantity - assignedQty);
        const itemLabel = remainingQty === 1 ? "item" : "items";
        throw new Error(
          `Please allocate the remaining ${remainingQty} ${item.name} ${itemLabel} across children before placing your order.`
        );
      }

      for (const [childIdForItem, quantity] of Object.entries(allocations)) {
        if (quantity <= 0) continue;
        groups.set(childIdForItem, [
          ...(groups.get(childIdForItem) || []),
          { ...item, quantity },
        ]);
      }
    }
    return groups;
  };

  // ─── Slide-to-pay handlers ──────────────────────────
  const THUMB_SIZE = 52;

  const getTrackWidth = () => {
    if (!slideTrackRef.current) return 300;
    return slideTrackRef.current.offsetWidth - THUMB_SIZE;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (slideState !== "idle" || !hasEnoughBalance) return;
    isDragging.current = true;
    startX.current = e.clientX - slideX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const maxX = getTrackWidth();
    const newX = Math.max(0, Math.min(e.clientX - startX.current, maxX));
    setSlideX(newX);
  };

  const handlePointerUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const maxX = getTrackWidth();
    if (slideX > maxX * 0.85) {
      setSlideX(maxX);
      setSlideState("paying");
      handleWalletPayment();
    } else {
      setSlideX(0);
    }
  };

  // ─── Razorpay flow ─────────────────────────────────
  const handleRazorpayPayment = async (orderId: string) => {
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

    return new Promise<void>((resolve, reject) => {
      if (!window.Razorpay) {
        reject(
          new Error("Razorpay SDK not loaded. Please refresh and try again."),
        );
        return;
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

            resolve();
          } catch (err) {
            reject(err);
          }
        },
        prefill: {
          name: session?.user?.name || "",
          email: session?.user?.email || "",
        },
        theme: { color: "#6366f1" },
        modal: {
          ondismiss: () => {
            reject(new Error("Payment cancelled"));
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    });
  };

  // ─── Wallet payment flow ───────────────────────────
  const handleWalletPayment = async () => {
    if (!session) {
      toast.error("Please sign in to place an order");
      setSlideState("idle");
      setSlideX(0);
      router.push("/login");
      return;
    }

    try {
      const groups = buildChildOrderGroups();
      for (const [childId, groupItems] of groups.entries()) {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: groupItems.map((item) => ({
              menuItemId: item.menuItemId,
              quantity: item.quantity,
              instructions: [...item.instructions.toggles, item.instructions.text]
                .filter(Boolean)
                .join(", "),
            })),
            paymentMethod: "WALLET",
            childId,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to place order");
        }
      }

      // Animate: paying → paid
      await new Promise((r) => setTimeout(r, 1500));
      setSlideState("paid");

      await new Promise((r) => setTimeout(r, 1200));
      toast.success("Paid via wallet! Order placed.");
      clearCart();
      emitEvent("orders-updated");
      router.push("/orders");
    } catch (error) {
      setSlideState("idle");
      setSlideX(0);
      toast.error(
        error instanceof Error ? error.message : "Failed to place order",
      );
    }
  };

  // ─── Razorpay order flow ───────────────────────────
  const handlePlaceOrder = async () => {
    if (!session) {
      toast.error("Please sign in to place an order");
      router.push("/login");
      return;
    }

    if (items.length === 0) {
      toast.error("Your cart is empty");
      return;
    }

    if (paymentMethod === "WALLET") return;

    setLoading(true);
    try {
      const groups = buildChildOrderGroups();
      if (groups.size > 1) {
        toast.error("Online checkout supports one child per order. To order for multiple children, please use Wallet checkout.");
        return;
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            instructions: [...item.instructions.toggles, item.instructions.text]
              .filter(Boolean)
              .join(", "),
          })),
          paymentMethod: "ONLINE",
          childId: [...groups.keys()][0],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to place order");
      }

      const { order: createdOrder } = await res.json();

      try {
        await handleRazorpayPayment(createdOrder.id);
        toast.success("Payment successful! Order placed.");
      } catch {
        // Razorpay failed or was dismissed — try wallet fallback
        try {
          const walletsRes = await fetch("/api/wallet");
          const walletsData: ChildWallet[] = walletsRes.ok
            ? await walletsRes.json()
            : [];

          // Pick the first wallet with enough balance, or the first wallet
          const bestWallet =
            walletsData.find((w) => w.balance >= createdOrder.totalAmount) ||
            walletsData[0];

          if (bestWallet) {
            const fallbackRes = await fetch("/api/payments/wallet-fallback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: createdOrder.id,
                childId: bestWallet.childId,
              }),
            });

            const fallbackData = await fallbackRes.json();

            if (fallbackRes.ok && fallbackData.fallback === "paid") {
              toast.success(
                "Razorpay payment failed — paid via wallet instead!",
              );
            } else {
              toast.error(
                fallbackData.reason ||
                  "Payment failed and insufficient wallet balance. Order cancelled.",
              );
            }
          } else {
            // No wallets at all — cancel the order
            await fetch(`/api/orders/${createdOrder.id}/cancel`, {
              method: "PATCH",
            });
            toast.error(
              "Payment failed and no wallet available. Order cancelled.",
            );
          }
        } catch {
          toast.error("Payment failed. Order may remain unpaid.");
        }
      }

      clearCart();
      emitEvent("orders-updated");
      router.push("/orders");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to place order",
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleInstruction = (menuItemId: string, instruction: string) => {
    const item = items.find((i) => i.menuItemId === menuItemId);
    if (!item) return;

    const toggles = item.instructions.toggles.includes(instruction)
      ? item.instructions.toggles.filter((t) => t !== instruction)
      : [...item.instructions.toggles, instruction];

    updateInstructions(menuItemId, {
      ...item.instructions,
      toggles,
    });
  };

  if (items.length === 0) {
    return (
      <div className="app-shell flex flex-col items-center justify-center py-16 text-center">
        <ShoppingCart className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h1 className="text-2xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">
          Add some items from the menu to get started
        </p>
        <Link href="/menu">
          <Button className="mt-6 gap-2 btn-gradient">
            <UtensilsCrossed className="h-4 w-4" />
            Browse Menu
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-header-card mb-5 animate-fade-in">
        <h1 className="app-title">Cart</h1>
        <p className="app-subtitle">
          Review your items and place your order
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Cart Items */}
        <div className="space-y-4 lg:col-span-2">
          {items.map((item, index) => (
            <Card
              key={item.menuItemId}
              className="animate-fade-in-up glass-card"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{item.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {item.discountedPrice != null ? (
                        <>
                          <span className="line-through">₹{item.price}</span>{" "}
                          <span className="text-emerald-600 font-medium">₹{item.discountedPrice}</span> each
                        </>
                      ) : (
                        <>₹{item.price} each</>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeItem(item.menuItemId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Quantity controls */}
                <div className="flex items-center gap-3">
                  <Label className="text-sm">Qty:</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        updateQuantity(item.menuItemId, item.quantity - 1)
                      }
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center font-medium">
                      {item.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        updateQuantity(item.menuItemId, item.quantity + 1)
                      }
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="ml-auto font-semibold">
                    ₹{((item.discountedPrice ?? item.price) * item.quantity).toFixed(2)}
                  </span>
                </div>

                {children.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm">Split between children</Label>
                    <div className="space-y-2 rounded-md border p-2.5">
                      {children.map((c) => {
                        const allocatedQty =
                          itemChildAllocations[item.menuItemId]?.[c.id] || 0;
                        const remainingQty = getItemRemainingQty(
                          item.menuItemId,
                          item.quantity
                        );
                        return (
                          <div key={c.id} className="flex items-center justify-between gap-3">
                            <span className="text-sm text-muted-foreground">{c.name}</span>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() =>
                                  updateChildAllocation(
                                    item.menuItemId,
                                    c.id,
                                    allocatedQty - 1
                                  )
                                }
                                disabled={allocatedQty <= 0}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-5 text-center text-sm font-medium">
                                {allocatedQty}
                              </span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() =>
                                  updateChildAllocation(
                                    item.menuItemId,
                                    c.id,
                                    allocatedQty + 1
                                  )
                                }
                                disabled={remainingQty <= 0}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {getItemRemainingQty(item.menuItemId, item.quantity) > 0 && (
                      <p className="text-xs text-amber-600">
                        Assign{" "}
                        {getItemRemainingQty(item.menuItemId, item.quantity)} more to continue.
                      </p>
                    )}
                  </div>
                )}

                {/* Instructions */}
                <div className="space-y-2">
                  <Label className="text-sm">Special Instructions:</Label>
                  <div className="flex flex-wrap gap-2">
                    {PREDEFINED_INSTRUCTIONS.map((instr) => (
                      <Badge
                        key={instr}
                        variant={
                          item.instructions.toggles.includes(instr)
                            ? "default"
                            : "outline"
                        }
                        className="cursor-pointer select-none"
                        onClick={() =>
                          toggleInstruction(item.menuItemId, instr)
                        }
                      >
                        {instr}
                      </Badge>
                    ))}
                  </div>
                  <Input
                    placeholder="Any other requests..."
                    value={item.instructions.text}
                    onChange={(e) =>
                      updateInstructions(item.menuItemId, {
                        ...item.instructions,
                        text: e.target.value,
                      })
                    }
                    className="text-sm"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Order Summary — Desktop only */}
        <div className="hidden lg:block lg:col-span-1">
          <Card className="sticky top-20 animate-scale-in glass-card">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.menuItemId}
                  className="flex justify-between text-sm"
                >
                  <span className="text-muted-foreground">
                    {item.name} × {item.quantity}
                    {getAllocationSummary(item.menuItemId)}
                  </span>
                  <span>₹{((item.discountedPrice ?? item.price) * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span>
                <span>₹{total.toFixed(2)}</span>
              </div>

              {/* Payment Method */}
              <div className="pt-3 space-y-3">
                <Label className="text-sm text-muted-foreground">
                  Payment Method
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Razorpay Option */}
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("ONLINE")}
                    className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all duration-300 ${
                      paymentMethod === "ONLINE"
                        ? "border-primary bg-gradient-to-br from-primary/5 to-primary/10 shadow-md shadow-primary/10"
                        : "border-border hover:border-primary/30 hover:bg-muted/50"
                    }`}
                  >
                    <div
                      className={`rounded-full p-2.5 transition-all duration-300 ${
                        paymentMethod === "ONLINE"
                          ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Razorpay</p>
                      <p className="text-[11px] text-muted-foreground">
                        UPI · Cards · Wallets
                      </p>
                    </div>
                    {paymentMethod === "ONLINE" && (
                      <div className="absolute -top-1.5 -right-1.5 rounded-full bg-primary p-0.5 animate-scale-in">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </button>

                  <button
                      type="button"
                      onClick={() => setPaymentMethod("WALLET")}
                      className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all duration-300 ${
                        paymentMethod === "WALLET"
                          ? "border-emerald-500 bg-gradient-to-br from-emerald-500/5 to-emerald-500/10 shadow-md shadow-emerald-500/10"
                          : "border-border hover:border-emerald-500/30 hover:bg-muted/50"
                      }`}
                    >
                      <div
                        className={`rounded-full p-2.5 transition-all duration-300 ${
                          paymentMethod === "WALLET"
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Wallet className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Wallet</p>
                        <p className="text-[11px] text-muted-foreground">
                          Instant pay
                        </p>
                      </div>
                      {paymentMethod === "WALLET" && (
                        <div className="absolute -top-1.5 -right-1.5 rounded-full bg-emerald-500 p-0.5 animate-scale-in">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </button>
                </div>
                {children.length > 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    Online checkout currently supports one child per order. Use Wallet for multi-child checkout.
                  </p>
                )}

                {/* Razorpay info panel */}
                {paymentMethod === "ONLINE" && (
                  <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent animate-in fade-in slide-in-from-top-2 duration-300">
                    <CardContent className="py-3 text-center space-y-1.5">
                      <p className="text-sm font-medium text-primary">
                        Secure payment via Razorpay
                      </p>
                      <p className="text-xs text-muted-foreground">
                        You&apos;ll be redirected after placing the order
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Wallet panel */}
                {paymentMethod === "WALLET" && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    {walletsLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : wallets.length === 0 ? (
                      <Card className="border-dashed">
                        <CardContent className="py-4 text-center">
                          <Wallet className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">
                            No wallets found. Add a child first.
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                        {/* Child selector */}
                        {wallets.length > 1 && (
                          <Select
                            value={selectedChildId}
                            onValueChange={setSelectedChildId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select child" />
                            </SelectTrigger>
                            <SelectContent>
                              {wallets.map((w) => (
                                <SelectItem key={w.childId} value={w.childId}>
                                  {w.childName} — ₹{w.balance.toFixed(2)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {/* Balance card */}
                        {selectedWallet && (
                          <Card className="border border-orange-400/10 bg-gradient-to-br from-orange-900 via-amber-950 to-orange text-white overflow-hidden shadow-xl">
                            <CardContent className="py-3 flex items-center justify-between">
                              <div>
                                <p className="text-xs text-orange-200/70 tracking-wide">
                                  {selectedWallet.childName}&apos;s Balance
                                </p>

                                <p className="text-xl font-semibold flex items-center gap-1 mt-0.5 text-orange-300">
                                  <IndianRupee className="h-4 w-4 text-orange-400" />
                                  {selectedWallet.balance.toFixed(2)}
                                </p>
                              </div>

                              {!hasEnoughBalance && (
                                <Badge className="bg-orange-500/15 text-orange-300 border border-orange-400/20 text-[10px] font-medium">
                                  Insufficient
                                </Badge>
                              )}
                            </CardContent>
                          </Card>
                        )}

                        {childTotals.size > 0 && (
                          <Card className="border-dashed">
                            <CardContent className="py-3 space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                Required per child wallet
                              </p>
                              {[...childTotals.entries()].map(([childId, amount]) => {
                                const childName = childNameById.get(childId);
                                const wallet = wallets.find((w) => w.childId === childId);
                                const amountClassName =
                                  familyWalletBalance >= amount
                                    ? "text-emerald-600"
                                    : "text-destructive";
                                return (
                                  <div
                                    key={childId}
                                    className="flex items-center justify-between text-sm"
                                  >
                                    <span>{childName || wallet?.childName || "Child"}</span>
                                    <span className={amountClassName}>
                                      Need ₹{amount.toFixed(2)}
                                    </span>
                                  </div>
                                );
                              })}
                              <Separator />
                              <div className="flex items-center justify-between text-sm font-semibold">
                                <span>Total required</span>
                                <span className={familyWalletBalance >= familyWalletRequired ? "text-emerald-600" : "text-destructive"}>
                                  ₹{familyWalletRequired.toFixed(2)} / ₹{familyWalletBalance.toFixed(2)}
                                </span>
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        {/* Slide-to-pay */}
                        {selectedWallet && (
                          <div className="pt-1">
                            <div
                              ref={slideTrackRef}
                              className={`relative h-14 rounded-full overflow-hidden transition-colors duration-300 ${
                                slideState === "paid"
                                  ? "bg-emerald-500"
                                  : slideState === "paying"
                                    ? "bg-gradient-to-r from-emerald-500/20 to-emerald-500/40"
                                    : hasEnoughBalance
                                      ? "bg-gradient-to-r from-muted to-muted/80"
                                      : "bg-muted/50 opacity-50"
                              }`}
                            >
                              {/* Track label */}
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                {slideState === "idle" && (
                                  <span
                                    className={`text-sm font-medium transition-opacity duration-200 ${
                                      slideX > 20 ? "opacity-0" : "opacity-60"
                                    }`}
                                  >
                                    {hasEnoughBalance
                                      ? "Slide to pay"
                                      : "Insufficient balance"}
                                  </span>
                                )}
                                {slideState === "paying" && (
                                  <div className="flex items-center gap-2 text-emerald-600">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span className="text-sm font-medium">
                                      Processing...
                                    </span>
                                  </div>
                                )}
                                {slideState === "paid" && (
                                  <div className="flex items-center gap-2 text-white animate-scale-in">
                                    <Check className="h-5 w-5" />
                                    <span className="text-sm font-bold">
                                      Paid ₹{total.toFixed(0)}!
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Sliding progress fill */}
                              {slideState === "idle" && slideX > 0 && (
                                <div
                                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/20 to-emerald-500/30 rounded-full transition-none"
                                  style={{ width: slideX + THUMB_SIZE }}
                                />
                              )}

                              {/* Thumb */}
                              {slideState === "idle" && (
                                <div
                                  className={`absolute top-1 left-1 h-12 w-12 rounded-full flex items-center justify-center shadow-lg touch-none select-none ${
                                    hasEnoughBalance
                                      ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white cursor-grab active:cursor-grabbing active:scale-95"
                                      : "bg-muted text-muted-foreground cursor-not-allowed"
                                  }`}
                                  style={{
                                    transform: `translateX(${slideX}px)`,
                                    transition: isDragging.current
                                      ? "none"
                                      : "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                                  }}
                                  onPointerDown={handlePointerDown}
                                  onPointerMove={handlePointerMove}
                                  onPointerUp={handlePointerUp}
                                  onPointerCancel={handlePointerUp}
                                >
                                  <ArrowRight className="h-5 w-5" />
                                </div>
                              )}

                              {/* Paying spinner in thumb position */}
                              {slideState === "paying" && (
                                <div className="absolute top-1 right-1 h-12 w-12 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center shadow-lg animate-pulse">
                                  <Loader2 className="h-5 w-5 animate-spin" />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              {paymentMethod === "ONLINE" && (
                <Button
                  className="w-full gap-2 btn-gradient btn-shimmer text-base h-12"
                  size="lg"
                  onClick={handlePlaceOrder}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  Place Order &amp; Pay
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-destructive hover:text-destructive"
                onClick={clearCart}
              >
                Clear Cart
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* ── Mobile: Fixed checkout bar + BottomSheet ── */}
      {items.length > 0 && (
        <>
          <div className="fixed inset-x-0 bottom-[calc(5.4rem+env(safe-area-inset-bottom))] z-40 px-4 lg:hidden">
            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl bg-primary px-5 py-3.5 text-primary-foreground shadow-[0_8px_30px_rgba(0,0,0,0.2)] active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4.5 w-4.5" />
                <span className="text-sm font-semibold">
                  {items.reduce((s, i) => s + i.quantity, 0)} item{items.length !== 1 ? "s" : ""}
                </span>
              </div>
              <span className="text-base font-bold">
                Checkout · ₹{total.toFixed(0)}
              </span>
            </button>
          </div>

          <BottomSheet
            open={checkoutOpen}
            onClose={() => setCheckoutOpen(false)}
            snapPoints={[85]}
          >
            <div className="space-y-4 pb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Order Summary</h2>
                <span className="text-sm text-muted-foreground">{items.reduce((s, i) => s + i.quantity, 0)} items</span>
              </div>

              {/* Line items */}
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.menuItemId} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {item.name} × {item.quantity}
                      {getAllocationSummary(item.menuItemId)}
                    </span>
                    <span className="font-medium">₹{((item.discountedPrice ?? item.price) * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>₹{total.toFixed(2)}</span>
              </div>

              {/* Payment method */}
              <div className="space-y-3 pt-2">
                <Label className="text-sm text-muted-foreground">Payment Method</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("ONLINE")}
                    className={cn(
                      "relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center transition-all duration-200",
                      paymentMethod === "ONLINE"
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/30",
                    )}
                  >
                    <div className={cn(
                      "rounded-full p-2.5 transition-colors",
                      paymentMethod === "ONLINE"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}>
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-semibold">Razorpay</p>
                    <p className="text-[11px] text-muted-foreground">UPI · Cards · Wallets</p>
                    {paymentMethod === "ONLINE" && (
                      <div className="absolute -top-1.5 -right-1.5 rounded-full bg-primary p-0.5">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </button>

                  <button
                      type="button"
                      onClick={() => setPaymentMethod("WALLET")}
                      className={cn(
                        "relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center transition-all duration-200",
                        paymentMethod === "WALLET"
                          ? "border-emerald-500 bg-emerald-500/5 shadow-sm"
                          : "border-border hover:border-emerald-500/30",
                      )}
                    >
                      <div className={cn(
                        "rounded-full p-2.5 transition-colors",
                        paymentMethod === "WALLET"
                          ? "bg-emerald-500 text-white"
                          : "bg-muted text-muted-foreground",
                      )}>
                        <Wallet className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold">Wallet</p>
                      <p className="text-[11px] text-muted-foreground">Instant pay</p>
                      {paymentMethod === "WALLET" && (
                        <div className="absolute -top-1.5 -right-1.5 rounded-full bg-emerald-500 p-0.5">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </button>
                </div>
              </div>

              {/* Wallet balance (when wallet selected) */}
              {paymentMethod === "WALLET" && selectedWallet && (
                <Card className="border border-orange-400/10 bg-gradient-to-br from-orange-900 via-amber-950 to-orange text-white overflow-hidden">
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-orange-200/70">{selectedWallet.childName}&apos;s Balance</p>
                      <p className="text-xl font-semibold flex items-center gap-1 mt-0.5 text-orange-300">
                        <IndianRupee className="h-4 w-4 text-orange-400" />
                        {selectedWallet.balance.toFixed(2)}
                      </p>
                    </div>
                    {!hasEnoughBalance && (
                      <Badge className="bg-orange-500/15 text-orange-300 border border-orange-400/20 text-[10px]">
                        Insufficient
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Action button */}
              {paymentMethod === "ONLINE" ? (
                <Button
                  className="w-full gap-2 text-base h-13 rounded-2xl"
                  size="lg"
                  onClick={() => {
                    setCheckoutOpen(false);
                    handlePlaceOrder();
                  }}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  Pay ₹{total.toFixed(0)} with Razorpay
                </Button>
              ) : paymentMethod === "WALLET" && selectedWallet ? (
                <div className="pt-1">
                  <div
                    ref={slideTrackRef}
                    className={cn(
                      "relative h-14 rounded-full overflow-hidden transition-colors duration-300",
                      slideState === "paid"
                        ? "bg-emerald-500"
                        : slideState === "paying"
                          ? "bg-gradient-to-r from-emerald-500/20 to-emerald-500/40"
                          : hasEnoughBalance
                            ? "bg-gradient-to-r from-muted to-muted/80"
                            : "bg-muted/50 opacity-50",
                    )}
                  >
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {slideState === "idle" && (
                        <span className={cn("text-sm font-medium transition-opacity duration-200", slideX > 20 ? "opacity-0" : "opacity-60")}>
                          {hasEnoughBalance ? "Slide to pay" : "Insufficient balance"}
                        </span>
                      )}
                      {slideState === "paying" && (
                        <div className="flex items-center gap-2 text-emerald-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm font-medium">Processing...</span>
                        </div>
                      )}
                      {slideState === "paid" && (
                        <div className="flex items-center gap-2 text-white">
                          <Check className="h-5 w-5" />
                          <span className="text-sm font-bold">Paid ₹{total.toFixed(0)}!</span>
                        </div>
                      )}
                    </div>
                    {slideState === "idle" && (
                      <div
                        className={cn(
                          "absolute top-1 left-1 h-12 w-12 rounded-full flex items-center justify-center shadow-lg touch-none select-none",
                          hasEnoughBalance
                            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white cursor-grab active:cursor-grabbing"
                            : "bg-muted text-muted-foreground cursor-not-allowed",
                        )}
                        style={{
                          transform: `translateX(${slideX}px)`,
                          transition: isDragging.current ? "none" : "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                        }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                      >
                        <ArrowRight className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <Button
                variant="ghost"
                size="sm"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => {
                  clearCart();
                  setCheckoutOpen(false);
                }}
              >
                Clear Cart
              </Button>
            </div>
          </BottomSheet>
        </>
      )}
    </div>
  );
}
