"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Plus,
  Minus,
  ShoppingCart,
  ArrowLeft,
  ArrowRight,
  CreditCard,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { MENU_CATEGORY_LABELS, type MenuCategory } from "@/lib/constants";

// ─── Types ───────────────────────────────────────────────

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: MenuCategory;
  imageUrl: string | null;
  available: boolean;
};

type CartItem = {
  menuItem: MenuItem;
  quantity: number;
};

type KioskPhase = "browse" | "checkout" | "result";

type OrderResult = {
  success: boolean;
  tokenCode?: string;
  items?: { name: string; quantity: number; subtotal: number }[];
  total?: number;
  balanceAfter?: number;
  childName?: string;
  reason?: string;
};

// ─── Kiosk Page ──────────────────────────────────────────

export default function KioskPage() {
  const [phase, setPhase] = useState<KioskPhase>("browse");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<MenuCategory | "ALL">(
    "ALL",
  );
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [orderLoading, setOrderLoading] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [countdown, setCountdown] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const rfidInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch menu items ────────────────────────────────

  const fetchMenu = useCallback(async () => {
    try {
      const res = await fetch("/api/menu");
      if (res.ok) {
        const data = await res.json();
        const items: MenuItem[] = data.items || data;
        setMenuItems(items.filter((item) => item.available));
      }
    } catch {
      toast.error("Failed to load menu");
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  // ─── Auto-focus RFID input in checkout phase ─────────

  useEffect(() => {
    if (phase === "checkout" && rfidInputRef.current) {
      rfidInputRef.current.focus();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "checkout") return;
    const interval = setInterval(() => {
      if (
        rfidInputRef.current &&
        document.activeElement !== rfidInputRef.current
      ) {
        rfidInputRef.current.focus();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [phase]);

  // ─── Auto-reset after result ─────────────────────────

  useEffect(() => {
    if (phase !== "result") return;
    setCountdown(10);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          resetKiosk();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ─── Cart helpers ────────────────────────────────────

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItem.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.menuItem.id === itemId ? { ...c, quantity: c.quantity + delta } : c,
        )
        .filter((c) => c.quantity > 0),
    );
  };

  const cartTotal = cart.reduce(
    (sum, c) => sum + c.menuItem.price * c.quantity,
    0,
  );
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const resetKiosk = () => {
    setCart([]);
    setPhase("browse");
    setResult(null);
    setActiveCategory("ALL");
    setSearchQuery("");
  };

  // ─── RFID scan handler ──────────────────────────────

  const handleRfidScan = async (rfidCardId: string) => {
    if (!rfidCardId.trim() || cart.length === 0) return;
    setOrderLoading(true);
    try {
      const res = await fetch("/api/kiosk/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfidCardId: rfidCardId.trim(),
          items: cart.map((c) => ({
            menuItemId: c.menuItem.id,
            quantity: c.quantity,
          })),
        }),
      });
      const data = await res.json();
      setResult(data);
      setPhase("result");
    } catch {
      setResult({ success: false, reason: "Network error. Please try again." });
      setPhase("result");
    } finally {
      setOrderLoading(false);
    }
  };

  // ─── Filtered items ─────────────────────────────────

  const searchFiltered = searchQuery.trim()
    ? menuItems.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : null;

  const filteredItems = searchFiltered
    ? searchFiltered
    : activeCategory === "ALL"
      ? menuItems
      : menuItems.filter((item) => item.category === activeCategory);

  const categories = [
    { key: "ALL" as const, label: "All" },
    ...Object.entries(MENU_CATEGORY_LABELS).map(([key, label]) => ({
      key: key as MenuCategory,
      label,
    })),
  ];

  // ═════════════════════════════════════════════════════
  // PHASE A — Browse & Add to Cart
  // ═════════════════════════════════════════════════════

  if (phase === "browse") {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        {/* Top bar — search + logo */}
        <div className="shrink-0 flex items-center justify-between gap-4 px-5 py-3 bg-white border-b shadow-sm">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search menu items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 text-base h-11"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Image
            src="/cropped-logo-venus-1-2.png"
            alt="Venus World Schools"
            width={52}
            height={52}
            className="shrink-0"
          />
        </div>

        {/* Category tabs */}
        <div
          className={`shrink-0 bg-white border-b px-4 py-2.5 flex gap-2 overflow-x-auto ${searchQuery ? "opacity-40 pointer-events-none" : ""}`}
        >
          {categories.map((cat) => (
            <Button
              key={cat.key}
              variant={activeCategory === cat.key ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCategory(cat.key)}
              className={`text-sm whitespace-nowrap px-4 py-2 ${
                activeCategory === cat.key
                  ? "bg-[#1a3a8f] hover:bg-[#15307a]"
                  : ""
              }`}
            >
              {cat.label}
            </Button>
          ))}
        </div>

        {/* Menu grid — only this area scrolls */}
        <div className="flex-1 overflow-y-auto p-4 pb-24">
          {menuLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-lg text-muted-foreground">
                No items available
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filteredItems.map((item) => {
                const inCart = cart.find((c) => c.menuItem.id === item.id);
                return (
                  <Card
                    key={item.id}
                    className="overflow-hidden cursor-pointer hover:shadow-lg active:scale-[0.97] transition-all touch-manipulation select-none"
                    onClick={() => addToCart(item)}
                  >
                    <div className="aspect-square bg-gray-100 relative">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl">
                          🍽️
                        </div>
                      )}
                      {inCart && (
                        <div className="absolute top-2 right-2 bg-[#2eab57] text-white rounded-full w-7 h-7 flex items-center justify-center font-bold text-xs shadow-lg">
                          {inCart.quantity}
                        </div>
                      )}
                    </div>
                    <CardContent className="p-2.5">
                      <p className="font-semibold text-sm truncate">
                        {item.name}
                      </p>
                      <p className="text-[#1a3a8f] font-bold">₹{item.price}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating cart bar */}
        {cartCount > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-white border-t shadow-[0_-4px_16px_rgba(0,0,0,0.08)] px-5 py-3 z-20">
            <div className="flex items-center justify-between max-w-4xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="bg-[#1a3a8f]/10 rounded-full p-2">
                  <ShoppingCart className="h-5 w-5 text-[#1a3a8f]" />
                </div>
                <div>
                  <p className="font-semibold">
                    {cartCount} item{cartCount > 1 ? "s" : ""}
                  </p>
                  <p className="text-[#2eab57] font-bold text-lg leading-tight">
                    ₹{cartTotal.toFixed(0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={resetKiosk}
                  className="text-[#e32726] border-[#e32726]/30 hover:bg-[#e32726]/5 hover:text-[#e32726] px-5"
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  onClick={() => setPhase("checkout")}
                  className="bg-[#2eab57] hover:bg-[#259a4a] px-6"
                >
                  Checkout
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═════════════════════════════════════════════════════
  // PHASE B — Cart Review & RFID Tap
  // ═════════════════════════════════════════════════════

  if (phase === "checkout") {
    return (
      <div className="h-screen overflow-hidden bg-gray-50 flex flex-col">
        {/* Compact header */}
        <div className="shrink-0 bg-white border-b px-5 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPhase("browse")}
            disabled={orderLoading}
            className="text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Menu
          </Button>
          <h2 className="font-bold text-lg">Checkout</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={resetKiosk}
            disabled={orderLoading}
            className="text-[#e32726] border-[#e32726]/30 hover:bg-[#e32726]/5 hover:text-[#e32726]"
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        </div>

        {/* Two-column layout */}
        <div className="flex-1 flex gap-6 p-6 min-h-0">
          {/* LEFT — RFID Tap */}
          <div className="flex-1 flex items-center justify-center">
            <Card className="w-full max-w-md shadow-lg border-2 border-dashed border-[#1a3a8f]">
              <CardContent className="py-16 text-center">
                {orderLoading ? (
                  <div className="space-y-4">
                    <Loader2 className="h-16 w-16 animate-spin text-[#1a3a8f] mx-auto" />
                    <p className="text-xl font-semibold text-[#1a3a8f]">
                      Processing...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <CreditCard className="h-20 w-20 text-[#1a3a8f] mx-auto animate-pulse" />
                    <p className="text-2xl font-bold text-[#1a3a8f]">
                      TAP YOUR RFID CARD
                    </p>
                    <p className="text-muted-foreground">
                      Place your card on the reader to pay from your wallet
                    </p>
                  </div>
                )}
                <input
                  ref={rfidInputRef}
                  type="text"
                  className="opacity-0 absolute -z-10"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const value = (e.target as HTMLInputElement).value;
                      (e.target as HTMLInputElement).value = "";
                      handleRfidScan(value);
                    }
                  }}
                  aria-label="RFID card scan input"
                />
              </CardContent>
            </Card>
          </div>

          {/* RIGHT — Order summary */}
          <div className="w-[360px] lg:w-[400px] flex flex-col min-h-0">
            {/* Items card — scrollable inside */}
            <Card className="shadow-lg flex flex-col min-h-0 flex-1">
              <div className="shrink-0 px-4 py-3 border-b">
                <h3 className="font-bold flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-[#1a3a8f]" />
                  Your Order
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-1">
                {cart.map((c) => (
                  <div key={c.menuItem.id}>
                    <div className="flex items-center justify-between py-2">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="font-medium text-sm truncate">
                          {c.menuItem.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ₹{c.menuItem.price} each
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(c.menuItem.id, -1)}
                        >
                          {c.quantity === 1 ? (
                            <Trash2 className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                        </Button>
                        <span className="w-5 text-center font-bold text-sm">
                          {c.quantity}
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => updateQuantity(c.menuItem.id, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <p className="w-14 text-right font-semibold text-sm">
                          ₹{(c.menuItem.price * c.quantity).toFixed(0)}
                        </p>
                      </div>
                    </div>
                    <Separator />
                  </div>
                ))}
              </div>
            </Card>

            {/* Total card */}
            <Card className="shadow-lg mt-3 shrink-0">
              <CardContent className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg">Total</p>
                    <p className="text-xs text-muted-foreground">
                      {cartCount} item{cartCount > 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="text-3xl font-bold text-[#1a3a8f]">
                    ₹{cartTotal.toFixed(0)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════
  // PHASE C — Result (Success / Failure)
  // ═════════════════════════════════════════════════════

  if (phase === "result" && result) {
    if (result.success) {
      return (
        <div className="h-screen overflow-hidden flex flex-col items-center justify-center p-6 bg-gray-50">
          <div className="max-w-sm w-full text-center">
            <div className="bg-[#2eab57]/10 rounded-full p-5 mb-5 inline-block">
              <CheckCircle2 className="h-16 w-16 text-[#2eab57]" />
            </div>

            <h2 className="text-3xl font-bold text-[#2eab57] mb-4">
              ORDER PLACED!
            </h2>

            <Card className="bg-[#1a3a8f] text-white mb-4">
              <CardContent className="py-6 text-center">
                <p className="text-sm opacity-75 mb-1">Your Token</p>
                <p className="text-5xl font-mono font-bold tracking-widest">
                  {result.tokenCode}
                </p>
                <p className="text-xs opacity-60 mt-2">
                  Show this to the server
                </p>
              </CardContent>
            </Card>

            {result.items && (
              <Card className="mb-4 text-left">
                <CardContent className="pt-5 space-y-1.5">
                  {result.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>
                        {item.name} × {item.quantity}
                      </span>
                      <span className="font-medium">
                        ₹{item.subtotal.toFixed(0)}
                      </span>
                    </div>
                  ))}
                  <Separator className="my-2" />
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span>₹{result.total?.toFixed(0)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {result.childName && (
              <p className="text-sm text-muted-foreground mb-3">
                {result.childName} • Balance: ₹{result.balanceAfter?.toFixed(0)}
              </p>
            )}

            <Badge
              variant="outline"
              className="text-sm py-1 px-3 text-muted-foreground"
            >
              Resetting in {countdown}s...
            </Badge>
          </div>
        </div>
      );
    }

    return (
      <div className="h-screen overflow-hidden flex flex-col items-center justify-center p-6 bg-gray-50">
        <div className="max-w-sm w-full text-center">
          <div className="bg-[#e32726]/10 rounded-full p-5 mb-5 inline-block">
            <XCircle className="h-16 w-16 text-[#e32726]" />
          </div>

          <h2 className="text-3xl font-bold text-[#e32726] mb-2">
            ORDER FAILED
          </h2>

          <p className="text-lg text-muted-foreground mb-6">{result.reason}</p>

          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              setResult(null);
              setPhase("checkout");
            }}
            className="px-8"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Try Again
          </Button>

          <Badge
            variant="outline"
            className="mt-5 text-sm py-1 px-3 text-muted-foreground block mx-auto w-fit"
          >
            Resetting in {countdown}s...
          </Badge>
        </div>
      </div>
    );
  }

  return null;
}
