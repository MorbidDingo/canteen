"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CerteWordmark } from "@/components/certe-logo";
import Link from "next/link";
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
  CreditCard,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Search,
  X,
  Timer,
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
import { getCurrentBreakSlot, parseBreakSlots, type BreakSlot } from "@/lib/break-slots";

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
  currentBreakName?: string | null;
  pendingParentOrders?: { id: string; shortId: string; status: string; totalAmount: number; createdAt: string; items: { name: string; quantity: number }[] }[];
};

type OrgContextDevice = {
  id: string;
  deviceType: "GATE" | "KIOSK" | "LIBRARY";
  deviceName: string;
  deviceCode: string;
  status: "ACTIVE" | "DISABLED";
};

export default function KioskPage() {
  const MAX_SAME_CARD_TAPS = 2;
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
  const [browseTimer, setBrowseTimer] = useState(20);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeRfid, setActiveRfid] = useState("");
  const [activeChildName, setActiveChildName] = useState<string | null>(null);
  const [breakSlots, setBreakSlots] = useState<BreakSlot[]>([]);
  const [currentBreakName, setCurrentBreakName] = useState<string | null>(null);
  const [lastTappedCard, setLastTappedCard] = useState("");
  const [sameCardTapCount, setSameCardTapCount] = useState(0);
  const [orgName, setOrgName] = useState<string>("Organization");
  const [deviceLabel, setDeviceLabel] = useState<string>("Kiosk");
  const [selectedDeviceCode, setSelectedDeviceCode] = useState<string>("");

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
    const syncBreakInfo = async () => {
      try {
        const res = await fetch("/api/menu/subscription-settings");
        if (!res.ok) return;
        const data = await res.json();
        const slots = parseBreakSlots(JSON.stringify(data.subscription_break_slots ?? []));
        setBreakSlots(slots);
        const current = getCurrentBreakSlot(slots, { timeZone: "Asia/Kolkata" });
        setCurrentBreakName(current?.name ?? null);
      } catch {
        // non-blocking on kiosk
      }
    };

    void syncBreakInfo();
  }, []);

  useEffect(() => {
    const fetchOrgContext = async () => {
      try {
        const res = await fetch("/api/org/context");
        if (!res.ok) return;
        const data = await res.json();
        setOrgName(data.organization?.name || "Organization");
        // Find first KIOSK device
        const devices = ((data.devices || []) as OrgContextDevice[]).filter(
          (d) => d.deviceType === "KIOSK" && d.status === "ACTIVE",
        );

        const queryCode = typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("deviceCode")?.trim().toUpperCase() ?? null
          : null;
        const storedCode = typeof window !== "undefined" ? localStorage.getItem("selectedKioskDeviceCode") : null;
        const selected =
          devices.find((d) => d.deviceCode === queryCode) ||
          devices.find((d) => d.deviceCode === storedCode) ||
          devices[0] ||
          null;
        if (selected) {
          setSelectedDeviceCode(selected.deviceCode);
          setDeviceLabel(selected.deviceName || selected.deviceCode || "Kiosk");
          if (typeof window !== "undefined") {
            localStorage.setItem("selectedKioskDeviceCode", selected.deviceCode);
          }
        }
      } catch {
        // non-blocking on kiosk
      }
    };

    void fetchOrgContext();
  }, []);

  useEffect(() => {
    const updateCurrentBreak = () => {
      const current = getCurrentBreakSlot(breakSlots, { timeZone: "Asia/Kolkata" });
      setCurrentBreakName(current?.name ?? null);
    };

    updateCurrentBreak();
    const timer = setInterval(updateCurrentBreak, 30_000);
    return () => clearInterval(timer);
  }, [breakSlots]);

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

  // 20-second browse timer — resets when cart changes, expires to reset kiosk
  useEffect(() => {
    if (phase !== "browse") return;
    setBrowseTimer(20);
    const interval = setInterval(() => {
      setBrowseTimer((prev) => {
        if (prev <= 1) {
          resetKiosk();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, cart.length]);

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

  const isInsufficientBalanceReason = (reason?: string | null) => {
    if (!reason) return false;
    const normalized = reason.toLowerCase();
    return normalized.includes("insufficient") && normalized.includes("balance");
  };

  const resetToTapWithMessage = (message: string) => {
    setCart([]);
    setResult(null);
    setPhase("tap");
    setActiveCategory("ALL");
    setSearchQuery("");
    setActiveRfid("");
    setActiveChildName(null);
    toast.error(message);
  };

  const handleCardTap = async (rfidCardId: string) => {
    const card = rfidCardId.trim();
    if (!card) return;

    const nextTapCount = lastTappedCard === card ? sameCardTapCount + 1 : 1;
    setLastTappedCard(card);
    setSameCardTapCount(nextTapCount);

    if (nextTapCount > MAX_SAME_CARD_TAPS) {
      resetToTapWithMessage(
        "This card has been tapped too many times. Please contact admin or operator.",
      );
      return;
    }

    setOrderLoading(true);
    try {
      const res = await fetch("/api/kiosk/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfidCardId: card,
          mode: "AUTO_PREORDER",
          deviceCode: selectedDeviceCode || undefined,
        }),
      });
      const data = await res.json();
      if ("currentBreakName" in data) {
        setCurrentBreakName((data.currentBreakName as string | null) ?? null);
      }

      if (!data.success) {
        if (isInsufficientBalanceReason(data.reason)) {
          resetToTapWithMessage(data.reason || "Insufficient balance. Please use another card.");
          return;
        }
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

      if (data.pendingParentOrders && data.pendingParentOrders.length > 0) {
        setResult({
          success: true,
          childName: data.childName,
          pendingParentOrders: data.pendingParentOrders,
        });
        setPhase("result");
        return;
      }

      setPhase("browse");
      if (data.reason) {
        toast.message(data.reason);
      }
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
      deviceCode: selectedDeviceCode || undefined,
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

      if (!data.success && isInsufficientBalanceReason(data.reason)) {
        resetToTapWithMessage(data.reason || "Insufficient balance. Please use another card.");
        return;
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
              <Loader2 className="h-16 w-16 animate-spin text-[#d4891a] mx-auto" />
              <h1 className="text-2xl font-bold text-[#d4891a]">Checking pre-orders...</h1>
            </>
          ) : (
            <>
              <CreditCard className="h-20 w-20 text-[#d4891a] mx-auto animate-pulse" />
              <h1 className="text-3xl font-bold text-[#d4891a]">Tap Your RFID Card</h1>
              <p className="text-muted-foreground">
                If a pre-order/subscription exists for the current break, it will be placed automatically.
                Otherwise you can select items and place order.
              </p>
              <Badge variant={currentBreakName ? "default" : "outline"} className="mx-auto">
                {currentBreakName ? `Current Break: ${currentBreakName}` : "No active break right now"}
              </Badge>
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
        <div className="shrink-0 flex flex-col px-5 py-3 bg-white border-b shadow-sm">
          <div className="flex items-center justify-between gap-4">
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

            <Badge variant={currentBreakName ? "default" : "outline"} className="whitespace-nowrap">
              {currentBreakName ? currentBreakName : "No active break"}
            </Badge>

            <Badge
              variant={browseTimer <= 5 ? "destructive" : "outline"}
              className="whitespace-nowrap flex items-center gap-1 tabular-nums"
            >
              <Timer className="h-3.5 w-3.5" />
              {browseTimer}s
            </Badge>

            <CerteWordmark className="text-2xl" />
            <Link href="/kiosk/offline">
              <Button variant="outline" size="sm">Offline Ops</Button>
            </Link>
            <PrinterStatusBadge />
          </div>
          <p className="text-xs text-muted-foreground mt-2">{orgName} • {deviceLabel}</p>
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
                  ? "bg-[#d4891a] hover:bg-[#b87314]"
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
                        <Image
                          src={item.imageUrl}
                          alt={item.name}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                          className="object-cover"
                          priority={false}
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
                        <p className="text-[#d4891a] font-bold">Rs{item.price}</p>
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
                <div className="bg-[#d4891a]/10 rounded-full p-2">
                  <ShoppingCart className="h-5 w-5 text-[#d4891a]" />
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
      // Pending parent-placed orders view
      if (result.pendingParentOrders && result.pendingParentOrders.length > 0) {
        return (
          <div className="h-screen overflow-hidden flex flex-col items-center justify-center p-6 bg-gray-50">
            <div className="max-w-sm w-full text-center">
              <div className="bg-[#1a3a8f]/10 rounded-full p-5 mb-4 inline-block">
                <CheckCircle2 className="h-14 w-14 text-[#1a3a8f]" />
              </div>

              <h2 className="text-2xl font-bold text-[#1a3a8f] mb-1">
                Hi, {result.childName || "Student"}!
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Your pending order{result.pendingParentOrders.length > 1 ? "s" : ""}:
              </p>

              <div className="space-y-3 mb-4 text-left">
                {result.pendingParentOrders.map((po) => (
                  <Card key={po.id}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-mono font-bold text-[#d4891a] tracking-wider">
                          #{po.shortId}
                        </p>
                        <Badge
                          className={
                            po.status === "PREPARING"
                              ? "bg-[#f58220]/15 text-[#c66a10] border-[#f58220]/30 text-[10px] px-1.5 py-0"
                              : "bg-[#2eab57]/15 text-[#1e7a3c] border-[#2eab57]/30 text-[10px] px-1.5 py-0"
                          }
                        >
                          {po.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-snug">
                        {po.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                      </p>
                      <p className="text-sm font-semibold">₹{po.totalAmount.toFixed(0)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <p className="text-xs text-muted-foreground mb-3">
                Share your order ID{result.pendingParentOrders.length > 1 ? "s" : ""} (shown above) with the canteen admin to collect your food.
              </p>

              <Badge variant="outline" className="text-sm py-1 px-3 text-muted-foreground">
                Resetting in {countdown}s...
              </Badge>
            </div>
          </div>
        );
      }

      return (
        <div className="h-screen overflow-hidden flex flex-col items-center justify-center p-6 bg-gray-50">
          <div className="max-w-sm w-full text-center">
            <div className="bg-[#2eab57]/10 rounded-full p-5 mb-5 inline-block">
              <CheckCircle2 className="h-16 w-16 text-[#2eab57]" />
            </div>

            <h2 className="text-3xl font-bold text-[#2eab57] mb-4">ORDER PLACED!</h2>

            <Card className="bg-[#d4891a] text-white mb-4">
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
