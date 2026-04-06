"use client";

import { useCartStore } from "@/lib/store/cart-store";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { emitEvent } from "@/lib/events";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingCart,
  Loader2,
  CreditCard,
  Wallet,
  Check,
  ArrowRight,
  IndianRupee,
  Store,
} from "lucide-react";
import { toast } from "sonner";
import { CERTE_PLUS, getSuggestedInstructions } from "@/lib/constants";
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

type CanteenInfo = {
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
    getCanteenId,
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
  const [canteensById, setCanteensById] = useState<Record<string, string>>({});
  const [itemChildAllocations, setItemChildAllocations] = useState<ItemChildAllocations>({});
  const fetchedCanteenIdRef = useRef<string | null>(null);

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
    if (items.length === 0) return;
    const firstItem = items[0];
    if (!firstItem?.canteenId) return;
    const hasValidName = firstItem.canteenName && firstItem.canteenName !== "Unknown";
    if (hasValidName) return;
    if (canteensById[firstItem.canteenId]) return;
    if (fetchedCanteenIdRef.current === firstItem.canteenId) return;

    fetchedCanteenIdRef.current = firstItem.canteenId;

    (async () => {
      try {
        const res = await fetch("/api/org/canteens", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { canteens?: CanteenInfo[] };
        const nextMap: Record<string, string> = {};
        for (const c of data.canteens || []) {
          nextMap[c.id] = c.name;
        }
        setCanteensById(nextMap);
      } catch {
        // No-op fallback: UI will use static label.
      }
    })();
  }, [items, canteensById]);

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
  const subtotal = getTotal();
  const platformFee = Math.round(subtotal * (CERTE_PLUS.PRE_ORDER_PLATFORM_FEE_PERCENT / 100) * 100) / 100;
  const total = Math.round((subtotal + platformFee) * 100) / 100;
  const rawCanteenName = items[0]?.canteenName;
  const orderingCanteenName =
    (rawCanteenName && rawCanteenName !== "Unknown" ? rawCanteenName : null) ||
    (items[0]?.canteenId ? canteensById[items[0].canteenId] : null) ||
    "selected canteen";
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
  const childPayableTotals = new Map(
    [...childTotals.entries()].map(([childId, amount]) => {
      const fee = Math.round(amount * (CERTE_PLUS.PRE_ORDER_PLATFORM_FEE_PERCENT / 100) * 100) / 100;
      return [childId, Math.round((amount + fee) * 100) / 100] as const;
    }),
  );
  const familyWalletBalance = wallets[0]?.balance ?? 0;
  const familyWalletRequired = [...childPayableTotals.values()].reduce(
    (sum, amount) => sum + amount,
    0
  );
  const hasEnoughBalance =
    familyWalletRequired > 0 &&
    familyWalletBalance >= familyWalletRequired;

  // Check if all items are fully allocated to children
  const allItemsAllocated = useMemo(() => {
    if (children.length <= 1) return true; // single child = auto-allocated
    return items.every((item) => {
      const assigned = Object.values(itemChildAllocations[item.menuItemId] || {}).reduce(
        (sum, qty) => sum + qty,
        0
      );
      return assigned === item.quantity;
    });
  }, [items, itemChildAllocations, children.length]);

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
            canteenId: getCanteenId(),
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
          canteenId: getCanteenId(),
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

          const createdOrderPayableTotal =
            Math.round(((createdOrder.totalAmount ?? 0) + (createdOrder.platformFee ?? 0)) * 100) / 100;

          // Pick the first wallet with enough balance, or the first wallet
          const bestWallet =
            walletsData.find((w) => w.balance >= createdOrderPayableTotal) ||
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
      <div className="app-shell flex flex-col items-center justify-center py-20 text-center">
        <ShoppingCart className="h-12 w-12 text-muted-foreground/20 mb-4" />
        <h1 className="text-xl font-semibold tracking-tight">Nothing here yet</h1>
        <Link href="/menu" className="mt-3 text-[13px] font-medium text-primary">
          Browse the menu
        </Link>
      </div>
    );
  }

  return (
    <div className="app-shell pb-48">
      {/* Canteen label */}
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-5">
        <Store className="h-3.5 w-3.5" />
        <span>Ordering from {orderingCanteenName}</span>
      </div>

      {/* Cart items — no card borders, divider-separated */}
      <div className="divide-y divide-border/60">
        {items.map((item, index) => (
          <div
            key={item.menuItemId}
            className="py-4 first:pt-0 animate-fade-in-up"
            style={{ animationDelay: `${index * 40}ms` }}
          >
            {/* Item row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold leading-snug">{item.name}</p>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  {item.discountedPrice != null ? (
                    <>
                      <span className="line-through">₹{item.price}</span>{" "}
                      <span className="text-primary font-medium">₹{item.discountedPrice}</span> each
                    </>
                  ) : (
                    <>₹{item.price} each</>
                  )}
                </p>
              </div>
              <span className="text-[15px] font-bold tabular-nums shrink-0">
                ₹{((item.discountedPrice ?? item.price) * item.quantity).toFixed(0)}
              </span>
            </div>

            {/* Qty controls — compact pill */}
            <div className="flex items-center gap-3 mt-2">
              <div className="inline-flex items-center h-8 rounded-full border border-border">
                <button
                  type="button"
                  onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                  className="flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="text-[13px] font-semibold tabular-nums min-w-[1.5ch] text-center">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                  className="flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeItem(item.menuItemId)}
                className="text-destructive/70 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Child allocation — 11px muted */}
            {children.length > 1 && (
              <div className="mt-2 space-y-1.5">
                {children.map((c) => {
                  const allocatedQty = itemChildAllocations[item.menuItemId]?.[c.id] || 0;
                  const remainingQty = getItemRemainingQty(item.menuItemId, item.quantity);
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-muted-foreground">{c.name}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateChildAllocation(item.menuItemId, c.id, allocatedQty - 1)}
                          disabled={allocatedQty <= 0}
                          className="flex items-center justify-center h-6 w-6 rounded-full border border-border text-muted-foreground disabled:opacity-30"
                        >
                          <Minus className="h-2.5 w-2.5" />
                        </button>
                        <span className="text-[11px] font-medium tabular-nums min-w-[1ch] text-center">
                          {allocatedQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateChildAllocation(item.menuItemId, c.id, allocatedQty + 1)}
                          disabled={remainingQty <= 0}
                          className="flex items-center justify-center h-6 w-6 rounded-full border border-border text-muted-foreground disabled:opacity-30"
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {getItemRemainingQty(item.menuItemId, item.quantity) > 0 && (
                  <p className="text-[11px] text-primary">
                    Assign {getItemRemainingQty(item.menuItemId, item.quantity)} more
                  </p>
                )}
              </div>
            )}

            {children.length === 1 && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {children[0].name}
              </p>
            )}

            {/* Special instructions — inline toggles + text */}
            <div className="mt-2.5 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {getSuggestedInstructions(item.category ?? "", item.name).map((instr) => (
                  <button
                    key={instr}
                    type="button"
                    onClick={() => toggleInstruction(item.menuItemId, instr)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
                      item.instructions.toggles.includes(instr)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {instr}
                  </button>
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
                className="h-8 rounded-lg border-border/60 text-[12px] placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 space-y-2">
        <div className="flex justify-between text-[14px]">
          <span>Subtotal</span>
          <span className="tabular-nums">₹{subtotal.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-[12px] text-muted-foreground">
          <span>Platform fee</span>
          <span className="tabular-nums">₹{platformFee.toFixed(0)}</span>
        </div>
        <Separator />
        <div className="flex justify-between text-[20px] font-bold">
          <span>Total</span>
          <span className="tabular-nums">₹{total.toFixed(0)}</span>
        </div>
      </div>

      {/* ── Fixed bottom checkout ── */}
      <div className="fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-40 px-5 lg:hidden">
        <div className="space-y-2">
          {/* Primary CTA */}
          <Button
            className="w-full h-14 rounded-2xl text-[15px] font-semibold gap-2"
            onClick={() => {
              if (paymentMethod === "WALLET") {
                setCheckoutOpen(true);
              } else {
                handlePlaceOrder();
              }
            }}
            disabled={loading || !allItemsAllocated}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Pay ₹{total.toFixed(0)} · Razorpay
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
          {/* Wallet alternative */}
          <button
            type="button"
            onClick={() => {
              setPaymentMethod("WALLET");
              setCheckoutOpen(true);
            }}
            className="w-full text-center text-[13px] font-medium text-primary py-1"
          >
            or pay with Wallet
          </button>
        </div>
      </div>

      {/* Desktop sidebar checkout */}
      <div className="hidden lg:block mt-8">
        <div className="max-w-md mx-auto space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentMethod("ONLINE")}
              className={cn(
                "relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center transition-all duration-200",
                paymentMethod === "ONLINE"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30",
              )}
            >
              <CreditCard className={cn("h-5 w-5", paymentMethod === "ONLINE" ? "text-primary" : "text-muted-foreground")} />
              <p className="text-sm font-semibold">Razorpay</p>
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
                  ? "border-emerald-500 bg-emerald-500/5"
                  : "border-border hover:border-emerald-500/30",
              )}
            >
              <Wallet className={cn("h-5 w-5", paymentMethod === "WALLET" ? "text-emerald-500" : "text-muted-foreground")} />
              <p className="text-sm font-semibold">Wallet</p>
              {paymentMethod === "WALLET" && (
                <div className="absolute -top-1.5 -right-1.5 rounded-full bg-emerald-500 p-0.5">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
            </button>
          </div>

          {paymentMethod === "ONLINE" ? (
            <Button
              className="w-full h-14 rounded-2xl text-[15px] font-semibold gap-2"
              onClick={handlePlaceOrder}
              disabled={loading || !allItemsAllocated}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Pay ₹{total.toFixed(0)} with Razorpay
            </Button>
          ) : (
            paymentMethod === "WALLET" && selectedWallet && (
              <div className="space-y-3">
                {/* Wallet balance */}
                <div className="rounded-2xl border border-orange-400/10 bg-gradient-to-br from-orange-900 via-amber-950 to-orange text-white overflow-hidden p-4">
                  <p className="text-xs text-orange-200/70">{selectedWallet.childName}&apos;s Balance</p>
                  <p className="text-xl font-semibold flex items-center gap-1 mt-0.5 text-orange-300">
                    <IndianRupee className="h-4 w-4 text-orange-400" />
                    {selectedWallet.balance.toFixed(2)}
                  </p>
                </div>

                {/* Slide to pay */}
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
                      <div className="flex items-center gap-2 text-white animate-scale-in">
                        <Check className="h-5 w-5" />
                        <span className="text-sm font-bold">Paid ₹{total.toFixed(2)}!</span>
                      </div>
                    )}
                  </div>
                  {slideState === "idle" && slideX > 0 && (
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/20 to-emerald-500/30 rounded-full transition-none"
                      style={{ width: slideX + THUMB_SIZE }}
                    />
                  )}
                  {slideState === "idle" && (
                    <div
                      className={cn(
                        "absolute top-1 left-1 h-12 w-12 rounded-full flex items-center justify-center shadow-lg touch-none select-none",
                        hasEnoughBalance
                          ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white cursor-grab active:cursor-grabbing active:scale-95"
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
                  {slideState === "paying" && (
                    <div className="absolute top-1 right-1 h-12 w-12 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center shadow-lg animate-pulse">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── Mobile wallet checkout bottom sheet ── */}
      <BottomSheet
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        snapPoints={[85]}
      >
        <div className="space-y-4 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Order Summary</h2>
            <span className="text-[12px] text-muted-foreground">{items.reduce((s, i) => s + i.quantity, 0)} items</span>
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.menuItemId} className="flex justify-between text-[13px]">
                <span className="text-muted-foreground">
                  {item.name} × {item.quantity}
                  {getAllocationSummary(item.menuItemId)}
                </span>
                <span className="font-medium tabular-nums">₹{((item.discountedPrice ?? item.price) * item.quantity).toFixed(0)}</span>
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex justify-between text-[14px]">
            <span>Subtotal</span>
            <span className="tabular-nums">₹{subtotal.toFixed(0)}</span>
          </div>
          <div className="flex justify-between text-[12px] text-muted-foreground">
            <span>Platform fee</span>
            <span className="tabular-nums">₹{platformFee.toFixed(0)}</span>
          </div>
          <div className="flex justify-between text-[20px] font-bold">
            <span>Total</span>
            <span className="tabular-nums">₹{total.toFixed(0)}</span>
          </div>

          {/* Wallet balance */}
          {paymentMethod === "WALLET" && (
            <div className="space-y-3">
              {walletsLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : wallets.length === 0 ? (
                <p className="text-[13px] text-muted-foreground text-center py-3">
                  No wallets found. Add a child first.
                </p>
              ) : (
                <>
                  {wallets.length > 1 && (
                    <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                      <SelectTrigger className="h-10 rounded-xl">
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

                  {selectedWallet && (
                    <div className="rounded-2xl border border-orange-400/10 bg-gradient-to-br from-orange-900 via-amber-950 to-orange text-white overflow-hidden p-4">
                      <p className="text-xs text-orange-200/70">{selectedWallet.childName}&apos;s Balance</p>
                      <p className="text-xl font-semibold flex items-center gap-1 mt-0.5 text-orange-300">
                        <IndianRupee className="h-4 w-4 text-orange-400" />
                        {selectedWallet.balance.toFixed(2)}
                      </p>
                      {!hasEnoughBalance && (
                        <p className="text-[11px] text-orange-300/80 mt-1">Insufficient balance</p>
                      )}
                    </div>
                  )}

                  {childTotals.size > 1 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-muted-foreground">Required per child</p>
                      {[...childPayableTotals.entries()].map(([childId, amount]) => (
                        <div key={childId} className="flex justify-between text-[12px]">
                          <span>{childNameById.get(childId) || "Child"}</span>
                          <span className={familyWalletBalance >= amount ? "text-emerald-600" : "text-destructive"}>
                            ₹{amount.toFixed(0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Slide to pay */}
                  {selectedWallet && (
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
                      {slideState === "idle" && slideX > 0 && (
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/20 to-emerald-500/30 rounded-full transition-none"
                          style={{ width: slideX + THUMB_SIZE }}
                        />
                      )}
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
                      {slideState === "paying" && (
                        <div className="absolute top-1 right-1 h-12 w-12 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center shadow-lg animate-pulse">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
