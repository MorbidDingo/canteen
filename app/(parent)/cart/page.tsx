"use client";

import { useCartStore } from "@/lib/store/cart-store";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingCart,
  Loader2,
  UtensilsCrossed,
  ArrowRight,
  Smartphone,
  Banknote,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { PREDEFINED_INSTRUCTIONS } from "@/lib/constants";
import Link from "next/link";
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");

  // Load Razorpay checkout script
  useEffect(() => {
    if (typeof window !== "undefined" && !window.Razorpay) {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const handleRazorpayPayment = async (orderId: string) => {
    // Step 1: Create Razorpay order
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

    // Step 2: Open Razorpay checkout
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
        name: "Venus Café",
        description: "Food order payment",
        order_id: razorpayOrderId,
        handler: async (response: RazorpayResponse) => {
          try {
            // Step 3: Verify payment on server
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
        theme: {
          color: "#1a3a8f", // Venus brand primary
        },
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

    setLoading(true);
    try {
      // Step 1: Create the order in our system
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
          paymentMethod,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to place order");
      }

      const { order: createdOrder } = await res.json();

      // Step 2: If ONLINE payment, trigger Razorpay
      if (paymentMethod === "ONLINE") {
        try {
          await handleRazorpayPayment(createdOrder.id);
          toast.success("Payment successful! Order placed.");
        } catch (paymentError) {
          // Order is created but payment failed/cancelled
          // The order will stay as UNPAID, user can pay later
          if (
            paymentError instanceof Error &&
            paymentError.message === "Payment cancelled"
          ) {
            toast.info(
              "Payment cancelled. Your order is saved — you can pay later from your orders page.",
            );
          } else {
            toast.error(
              "Payment failed. Your order is saved — you can retry payment from your orders page.",
            );
          }
        }
      } else {
        toast.success("Order placed successfully!");
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
      <div className="container mx-auto flex flex-col items-center justify-center px-4 py-16 text-center">
        <ShoppingCart className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h1 className="text-2xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">
          Add some items from the menu to get started
        </p>
        <Link href="/menu">
          <Button className="mt-6 gap-2">
            <UtensilsCrossed className="h-4 w-4" />
            Browse Menu
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Cart</h1>
        <p className="text-muted-foreground">
          Review your items and place your order
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Cart Items */}
        <div className="space-y-4 lg:col-span-2">
          {items.map((item, index) => (
            <Card
              key={item.menuItemId}
              className="animate-fade-in-up"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{item.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      ₹{item.price} each
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
                    ₹{(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>

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

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <Card className="sticky top-20 animate-scale-in">
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
                  </span>
                  <span>₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span>
                <span>₹{getTotal().toFixed(2)}</span>
              </div>

              <div className="pt-2 space-y-2">
                <Label className="text-sm text-muted-foreground">
                  Payment Method
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("CASH")}
                    className={`flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all ${
                      paymentMethod === "CASH"
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <Banknote
                      className={`h-5 w-5 shrink-0 ${paymentMethod === "CASH" ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <div>
                      <p className="text-sm font-medium">Cash</p>
                      <p className="text-[11px] text-muted-foreground">
                        Pay on serving
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("UPI")}
                    className={`flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all ${
                      paymentMethod === "UPI"
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <Smartphone
                      className={`h-5 w-5 shrink-0 ${paymentMethod === "UPI" ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <div>
                      <p className="text-sm font-medium">UPI</p>
                      <p className="text-[11px] text-muted-foreground">
                        Scan &amp; pay
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("ONLINE")}
                    className={`flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all ${
                      paymentMethod === "ONLINE"
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <CreditCard
                      className={`h-5 w-5 shrink-0 ${paymentMethod === "ONLINE" ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <div>
                      <p className="text-sm font-medium">Online</p>
                      <p className="text-[11px] text-muted-foreground">
                        Razorpay
                      </p>
                    </div>
                  </button>
                </div>

                {paymentMethod === "UPI" && (
                  <Card className="border-dashed animate-in fade-in slide-in-from-top-1 duration-300">
                    <CardContent className="py-3 text-center space-y-2">
                      <div className="mx-auto w-32 h-32 rounded-lg bg-muted flex items-center justify-center">
                        <div className="text-center">
                          <Smartphone className="h-8 w-8 text-muted-foreground mx-auto mb-1" />
                          <p className="text-[10px] text-muted-foreground">
                            QR Code
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-medium">schoolcafe@upi</p>
                      <p className="text-xs text-muted-foreground">
                        Pay ₹{getTotal().toFixed(2)} via any UPI app.
                        <br />
                        Order will be marked{" "}
                        <Badge
                          variant="outline"
                          className="ml-1 text-[10px] px-1.5 py-0"
                        >
                          UNPAID
                        </Badge>{" "}
                        until admin confirms.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {paymentMethod === "ONLINE" && (
                  <Card className="border-dashed border-[#1a3a8f]/30 bg-[#1a3a8f]/5 animate-in fade-in slide-in-from-top-1 duration-300">
                    <CardContent className="py-3 text-center space-y-2">
                      <CreditCard className="h-8 w-8 text-[#1a3a8f] mx-auto" />
                      <p className="text-sm font-medium text-[#1a3a8f]">
                        Pay securely via Razorpay
                      </p>
                      <p className="text-xs text-muted-foreground">
                        UPI, Cards, Net Banking, Wallets &amp; more.
                        <br />
                        You&apos;ll be redirected to Razorpay after placing the
                        order.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button
                className="w-full gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                size="lg"
                onClick={handlePlaceOrder}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : paymentMethod === "ONLINE" ? (
                  <CreditCard className="h-4 w-4" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {paymentMethod === "ONLINE"
                  ? "Place Order & Pay"
                  : "Place Order"}
              </Button>
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
    </div>
  );
}
