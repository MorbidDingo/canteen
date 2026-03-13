"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
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
import {
  cacheMenuItems,
  enqueueOfflineAction,
  getCachedMenuItems,
} from "@/lib/store/offline-db";
import { printCanteenReceipt } from "@/lib/printer";
import { PrinterStatusBadge } from "@/components/kiosk/printer-status";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  discountedPrice?: number | null;
  discountInfo?: { type: string; value: number; mode: string } | null;
  category: MenuCategory;
  imageUrl: string | null;
  available: boolean;
  availableUnits?: number | null;
};

type CartItem = {
  menuItem: MenuItem;
  quantity: number;
};

type KioskPhase = "tap" | "browse" | "result";

type OrderResult = {
  success: boolean;
  tokenCode?: string;
  items?: { name: string; quantity: number; subtotal: number }[];
  total?: number;
  balanceAfter?: number;
  childName?: string;
  reason?: string;
};

export default function KioskPage() {
  const [phase, setPhase] = useState<KioskPhase>("tap");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<MenuCategory | "ALL">(
    "ALL",
  );
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [orderLoading, setOrderLoading] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeRfid, setActiveRfid] = useState("");
  const [activeChildName, setActiveChildName] = useState<string | null>(null);

  const rfidInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchMenu = useCallback(async () => {
    try {
      const res = await fetch("/api/menu");
      if (res.ok) {
        const data = await res.json();
        const items: MenuItem[] = (data.items || data).filter(
          (item: MenuItem) => item.available,
        );
        setMenuItems(items);
        void cacheMenuItems(items);
        setCart((prev) =>
          prev
            .map((c) => {
              const fresh = items.find((i) => i.id === c.menuItem.id);
              if (!fresh) return null;
              return { ...c, menuItem: fresh };
            })
            .filter((c): c is CartItem => c !== null),
        );
      } else {
        const cachedItems = await getCachedMenuItems<MenuItem>();
        if (cachedItems.length > 0) {
          setMenuItems(cachedItems.filter((item) => item.available));
          toast.warning("Showing cached menu (offline mode)");
        }
      }
    } catch {
      const cachedItems = await getCachedMenuItems<MenuItem>();
      if (cachedItems.length > 0) {
        setMenuItems(cachedItems.filter((item) => item.available));
        toast.warning("Showing cached menu (offline mode)");
      } else {
        toast.error("Failed to load menu");
      }
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  useEffect(() => {
    const eventSource = new EventSource("/api/events");
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "menu-updated") {
          fetchMenu();
        }
      } catch {}
    };
    return () => eventSource.close();
  }, [fetchMenu]);

  useEffect(() => {
    if (phase !== "tap") return;
    if (rfidInputRef.current) rfidInputRef.current.focus();

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

  useEffect(() => {
    if (phase !== "result") return;
    setCountdown(5);
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
  }, [phase]);

  const addToCart = (item: MenuItem) => {
    const MAX_QTY = 5;
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItem.id === item.id);
      if (existing) {
        const maxAllowed =
          item.availableUnits != null
            ? Math.min(MAX_QTY, item.availableUnits)
            : MAX_QTY;
        if (existing.quantity >= maxAllowed) return prev;
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
    (sum, c) => sum + (c.menuItem.discountedPrice ?? c.menuItem.price) * c.quantity,
    0,
  );
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const resetKiosk = () => {
    setCart([]);
    setPhase("tap");
    setResult(null);
    setActiveCategory("ALL");
    setSearchQuery("");
    setActiveRfid("");
    setActiveChildName(null);
  };

  const handleCardTap = async (rfidCardId: string) => {
    const card = rfidCardId.trim();
    if (!card) return;

    setOrderLoading(true);
    try {
      const res = await fetch("/api/kiosk/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfidCardId: card, mode: "AUTO_PREORDER" }),
      });
      const data = await res.json();

      if (!data.success) {
        setResult({ success: false, reason: data.reason || "Card check failed" });
        setPhase("result");
        return;
      }

      setActiveRfid(card);
      setActiveChildName(data.childName || null);

      if (data.autoPreOrder) {
        try {
          await printCanteenReceipt({
            tokenCode: data.tokenCode,
            items: (data.items ?? []) as { name: string; quantity: number; subtotal: number }[],
            total: data.total ?? 0,
            childName: data.childName,
            isOffline: false,
          });
        } catch {
          toast.warning("Pre-order placed, but receipt printer is disconnected.");
        }

        setResult({
          success: true,
          tokenCode: data.tokenCode,
          items: data.items,
          total: data.total,
          balanceAfter: data.balanceAfter,
          childName: data.childName,
          reason:
            data.preOrderMode === "SUBSCRIPTION"
              ? "Subscription pre-order placed automatically."
              : "Today pre-order placed automatically.",
        });
        setPhase("result");
        return;
      }

      setPhase("browse");
      toast.success(`Welcome ${data.childName || "Student"}. Select items to order.`);
    } catch {
      setResult({ success: false, reason: "Failed to verify card. Please try again." });
      setPhase("result");
    } finally {
      setOrderLoading(false);
    }
  };

  const placeManualOrder = async () => {
    if (!activeRfid || cart.length === 0) return;

    const payload = {
      rfidCardId: activeRfid,
      mode: "MANUAL",
      items: cart.map((c) => ({
        menuItemId: c.menuItem.id,
        quantity: c.quantity,
      })),
    };

    setOrderLoading(true);
    try {
      const res = await fetch("/api/kiosk/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        try {
          await printCanteenReceipt({
            tokenCode: data.tokenCode,
            items: (data.items ?? []) as { name: string; quantity: number; subtotal: number }[],
            total: data.total ?? cartTotal,
            childName: data.childName,
            isOffline: false,
          });
        } catch {
          toast.warning("Order placed, but receipt printer is disconnected.");
        }
      }
      setResult(data);
      setPhase("result");
    } catch {
      const queued = await enqueueOfflineAction({
        type: "KIOSK_ORDER",
        payload,
      });

      const offlineToken = `OFF-${queued.id.slice(0, 6).toUpperCase()}`;
      const offlineItems = cart.map((c) => ({
        name: c.menuItem.name,
        quantity: c.quantity,
        subtotal: (c.menuItem.discountedPrice ?? c.menuItem.price) * c.quantity,
      }));

      try {
        await printCanteenReceipt({
          tokenCode: offlineToken,
          items: offlineItems,
          total: cartTotal,
          isOffline: true,
        });
      } catch {
        toast.warning("Saved offline, but receipt printer is disconnected.");
      }

      setResult({
        success: true,
        tokenCode: offlineToken,
        items: offlineItems,
        total: cartTotal,
        reason: "Saved offline. Will sync automatically when network returns.",
      });
      setPhase("result");
    } finally {
      setOrderLoading(false);
    }
  };

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

  if (phase === "tap") {
    return (
      <div className="h-screen overflow-hidden bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="max-w-lg w-full text-center space-y-5">
          {orderLoading ? (
            <>
              <Loader2 className="h-16 w-16 animate-spin text-[#1a3a8f] mx-auto" />
              <h1 className="text-2xl font-bold text-[#1a3a8f]">Checking pre-orders...</h1>
            </>
          ) : (
            <>
              <CreditCard className="h-20 w-20 text-[#1a3a8f] mx-auto animate-pulse" />
              <h1 className="text-3xl font-bold text-[#1a3a8f]">Tap Your RFID Card</h1>
              <p className="text-muted-foreground">
                If a pre-order/subscription exists for today, it will be placed automatically.
                Otherwise you can select items and place order.
              </p>
            </>
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
                void handleCardTap(value);
              }
            }}
            aria-label="RFID card scan input"
          />
          <div className="flex justify-center gap-3">
            <Link href="/kiosk/offline">
              <Button variant="outline" size="sm">Offline Ops</Button>
            </Link>
            <PrinterStatusBadge />
          </div>
        </div>
      </div>
    );
  }

  if (phase === "browse") {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
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

          {activeChildName && (
            <Badge variant="secondary" className="whitespace-nowrap">
              {activeChildName}
            </Badge>
          )}

          <Image
            src="/cropped-logo-venus-1-2.png"
            alt="Venus World Schools"
            width={52}
            height={52}
            className="shrink-0"
          />
          <Link href="/kiosk/offline">
            <Button variant="outline" size="sm">Offline Ops</Button>
          </Link>
          <PrinterStatusBadge />
        </div>

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

        <div className="flex-1 overflow-y-auto p-4 pb-24">
          {menuLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-lg text-muted-foreground">No items available</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filteredItems.map((item) => {
                const inCart = cart.find((c) => c.menuItem.id === item.id);
                const isSoldOut = item.availableUnits === 0;
                return (
                  <Card
                    key={item.id}
                    className={`overflow-hidden cursor-pointer hover:shadow-lg active:scale-[0.97] transition-all touch-manipulation select-none ${isSoldOut ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={() => !isSoldOut && addToCart(item)}
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
                      {item.discountedPrice != null && !isSoldOut && (
                        <div className="absolute bottom-2 left-2 bg-emerald-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-md">
                          {item.discountInfo?.type === "PERCENTAGE"
                            ? `${item.discountInfo.value}% OFF`
                            : `Rs${item.discountInfo?.value} OFF`}
                        </div>
                      )}
                      {isSoldOut && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                            SOLD OUT
                          </span>
                        </div>
                      )}
                      {inCart && !isSoldOut && (
                        <div className="absolute top-2 right-2 bg-[#2eab57] text-white rounded-full w-7 h-7 flex items-center justify-center font-bold text-xs shadow-lg">
                          {inCart.quantity}
                        </div>
                      )}
                      {item.availableUnits != null && item.availableUnits > 0 && (
                        <div className="absolute top-2 left-2 bg-white/90 text-xs px-1.5 py-0.5 rounded font-medium">
                          {item.availableUnits} left
                        </div>
                      )}
                    </div>
                    <CardContent className="p-2.5">
                      <p className="font-semibold text-sm truncate">{item.name}</p>
                      {item.discountedPrice != null ? (
                        <div className="flex items-center gap-1.5">
                          <span className="line-through text-muted-foreground text-xs">Rs{item.price}</span>
                          <span className="text-[#2eab57] font-bold">Rs{item.discountedPrice}</span>
                        </div>
                      ) : (
                        <p className="text-[#1a3a8f] font-bold">Rs{item.price}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

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
                    Rs{cartTotal.toFixed(0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCart([])}
                  className="text-[#e32726] border-[#e32726]/30 hover:bg-[#e32726]/5 hover:text-[#e32726] px-5"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
                <Button
                  onClick={() => void placeManualOrder()}
                  disabled={orderLoading}
                  className="bg-[#2eab57] hover:bg-[#259a4a] px-6"
                >
                  {orderLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Place Order"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (phase === "result" && result) {
    if (result.success) {
      return (
        <div className="h-screen overflow-hidden flex flex-col items-center justify-center p-6 bg-gray-50">
          <div className="max-w-sm w-full text-center">
            <div className="bg-[#2eab57]/10 rounded-full p-5 mb-5 inline-block">
              <CheckCircle2 className="h-16 w-16 text-[#2eab57]" />
            </div>

            <h2 className="text-3xl font-bold text-[#2eab57] mb-4">ORDER PLACED!</h2>

            <Card className="bg-[#1a3a8f] text-white mb-4">
              <CardContent className="py-6 text-center">
                <p className="text-sm opacity-75 mb-1">Your Token</p>
                <p className="text-5xl font-mono font-bold tracking-widest">{result.tokenCode}</p>
                <p className="text-xs opacity-60 mt-2">Show this to the server</p>
              </CardContent>
            </Card>

            {result.items && (
              <Card className="mb-4 text-left">
                <CardContent className="pt-5 space-y-1.5">
                  {result.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>
                        {item.name} x {item.quantity}
                      </span>
                      <span className="font-medium">Rs{item.subtotal.toFixed(0)}</span>
                    </div>
                  ))}
                  <Separator className="my-2" />
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span>Rs{result.total?.toFixed(0)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {result.childName && (
              <p className="text-sm text-muted-foreground mb-3">
                {result.childName} - Balance: Rs{result.balanceAfter?.toFixed(0)}
              </p>
            )}

            <Badge variant="outline" className="text-sm py-1 px-3 text-muted-foreground">
              Resetting in {countdown}s...
            </Badge>
            {result.reason ? <p className="mt-2 text-xs text-muted-foreground">{result.reason}</p> : null}
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

          <h2 className="text-3xl font-bold text-[#e32726] mb-2">ORDER FAILED</h2>
          <p className="text-lg text-muted-foreground mb-6">{result.reason}</p>

          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              setResult(null);
              setPhase(activeRfid ? "browse" : "tap");
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
