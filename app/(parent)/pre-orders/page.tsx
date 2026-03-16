"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CalendarClock,
  Loader2,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Plus,
  Minus,
  ShieldAlert,
  Search,
  Sparkles,
} from "lucide-react";
import {
  MENU_CATEGORY_LABELS,
  PRE_ORDER_STATUS_LABELS,
  CERTE_PLUS_PLAN_LIST,
  type MenuCategory,
  type PreOrderStatus,
} from "@/lib/constants";

type ChildOption = {
  id: string;
  name: string;
};

type MenuOption = {
  id: string;
  name: string;
  price: number;
  discountedPrice?: number | null;
  category: MenuCategory;
  available: boolean;
  subscribable?: boolean;
};

type ChildControl = {
  childId: string;
  childName: string;
  dailySpendLimit: number | null;
  perOrderLimit: number | null;
  blockedCategories: string[];
  blockedItemIds: string[];
};

type PreOrderWithItems = {
  id: string;
  childName: string;
  mode: "ONE_DAY" | "SUBSCRIPTION";
  scheduledDate: string;
  subscriptionUntil: string | null;
  lastFulfilledDate: string | null;
  status: PreOrderStatus;
  createdAt: string;
  items: {
    name: string;
    quantity: number;
  }[];
};

type DraftItem = {
  menuItemId: string;
  name: string;
  quantity: number;
};

const DEFAULT_MIN_PREORDER_VALUE = 60;
const DEFAULT_MIN_SUBSCRIPTION_DAYS = 3;
const DEFAULT_MAX_SUBSCRIPTION_DAYS = 180;

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateIso: string, daysToAdd: number) {
  const dt = new Date(`${dateIso}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + daysToAdd);
  return dt.toISOString().slice(0, 10);
}

function addMonths(dateIso: string, monthsToAdd: number) {
  const dt = new Date(`${dateIso}T00:00:00.000Z`);
  dt.setUTCMonth(dt.getUTCMonth() + monthsToAdd);
  return dt.toISOString().slice(0, 10);
}

function inclusiveDaysBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  return Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

export default function PreOrdersPage() {
  const [preOrders, setPreOrders] = useState<PreOrderWithItems[]>([]);
  const [children, setChildren] = useState<ChildOption[]>([]);
  const [controls, setControls] = useState<ChildControl[]>([]);
  const [menuItems, setMenuItems] = useState<MenuOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [removingBlocks, setRemovingBlocks] = useState(false);
  const [removeBlocksModalOpen, setRemoveBlocksModalOpen] = useState(false);
  const [certePlusActive, setCertePlusActive] = useState<boolean | null>(null);
  const [subscriptionSettings, setSubscriptionSettings] = useState({
    minOrderValue: DEFAULT_MIN_PREORDER_VALUE,
    minDays: DEFAULT_MIN_SUBSCRIPTION_DAYS,
    maxDays: DEFAULT_MAX_SUBSCRIPTION_DAYS,
  });

  const [subscribing, setSubscribing] = useState(false);
  const [selectedSubPlan, setSelectedSubPlan] = useState<string>("MONTHLY");
  const [showCelebration, setShowCelebration] = useState(false);

  const [childId, setChildId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(todayDateInput());
  const [subscriptionUntil, setSubscriptionUntil] = useState(addDays(todayDateInput(), 2));
  const [menuSearchQuery, setMenuSearchQuery] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);

  const fetchPreOrders = useCallback(async () => {
    const res = await fetch("/api/pre-orders");
    if (!res.ok) throw new Error("Failed pre-orders");
    const data = (await res.json()) as PreOrderWithItems[];
    setPreOrders(data);
  }, []);

  const fetchChildren = useCallback(async () => {
    const res = await fetch("/api/children");
    if (!res.ok) throw new Error("Failed children");
    const data = (await res.json()) as { id: string; name: string }[];
    const mapped = data.map((c) => ({ id: c.id, name: c.name }));
    setChildren(mapped);
    if (mapped.length > 0 && !childId) setChildId(mapped[0].id);
  }, [childId]);

  const fetchMenu = useCallback(async () => {
    const res = await fetch("/api/menu");
    if (!res.ok) throw new Error("Failed menu");
    const data = await res.json();
    const items = (data.items || data) as MenuOption[];
    // Only show available items that are subscribable
    setMenuItems(items.filter((m) => m.available && m.subscribable !== false));
  }, []);

  const fetchControls = useCallback(async () => {
    const res = await fetch("/api/controls");
    if (!res.ok) throw new Error("Failed controls");
    const data = (await res.json()) as ChildControl[];
    setControls(data);
  }, []);

  const fetchCertePlusStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/certe-plus");
      if (res.ok) {
        const data = await res.json();
        setCertePlusActive(data.active === true);
      }
    } catch {
      setCertePlusActive(false);
    }
  }, []);

  const fetchSubscriptionSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/menu/subscription-settings");
      if (res.ok) {
        const data = await res.json();
        setSubscriptionSettings({
          minOrderValue: Number(data.subscription_min_order_value) || DEFAULT_MIN_PREORDER_VALUE,
          minDays: Number(data.subscription_min_days) || DEFAULT_MIN_SUBSCRIPTION_DAYS,
          maxDays: Number(data.subscription_max_days) || DEFAULT_MAX_SUBSCRIPTION_DAYS,
        });
      }
    } catch { /* use defaults */ }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      await Promise.all([fetchPreOrders(), fetchChildren(), fetchMenu(), fetchControls(), fetchCertePlusStatus(), fetchSubscriptionSettings()]);
    } catch {
      toast.error("Failed to load pre-order data");
    } finally {
      setLoading(false);
    }
  }, [fetchPreOrders, fetchChildren, fetchMenu, fetchControls, fetchCertePlusStatus, fetchSubscriptionSettings]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const menuLookup = useMemo(() => new Map(menuItems.map((m) => [m.id, m])), [menuItems]);

  const filteredMenuOptions = useMemo(() => {
    const q = menuSearchQuery.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (MENU_CATEGORY_LABELS[m.category] || m.category).toLowerCase().includes(q),
    );
  }, [menuItems, menuSearchQuery]);

  const selectedControl = useMemo(
    () => controls.find((c) => c.childId === childId) ?? null,
    [controls, childId],
  );

  const orderTotal = useMemo(
    () =>
      draftItems.reduce((sum, d) => {
        const menu = menuLookup.get(d.menuItemId);
        const unitPrice = menu?.discountedPrice ?? menu?.price ?? 0;
        return sum + unitPrice * d.quantity;
      }, 0),
    [draftItems, menuLookup],
  );

  const durationDays = useMemo(
    () => inclusiveDaysBetween(scheduledDate, subscriptionUntil),
    [scheduledDate, subscriptionUntil],
  );

  const controlFindings = useMemo(() => {
    const selected = draftItems
      .map((item) => {
        const menu = menuLookup.get(item.menuItemId);
        return menu ? { menu, quantity: item.quantity } : null;
      })
      .filter((v): v is { menu: MenuOption; quantity: number } => Boolean(v));

    const selectedCategorySet = new Set(selected.map((s) => s.menu.category));
    const selectedItemIdSet = new Set(selected.map((s) => s.menu.id));

    const blockedCategories =
      selectedControl?.blockedCategories.filter((c) => selectedCategorySet.has(c as MenuCategory)) ?? [];
    const blockedItems =
      selectedControl?.blockedItemIds
        .filter((id) => selectedItemIdSet.has(id))
        .map((id) => menuLookup.get(id)?.name ?? id) ?? [];

    const perOrderLimit = selectedControl?.perOrderLimit ?? null;
    const dailySpendLimit = selectedControl?.dailySpendLimit ?? null;

    return {
      blockedCategories,
      blockedItems,
      perOrderLimit,
      dailySpendLimit,
      perOrderExceeded: !!perOrderLimit && orderTotal > perOrderLimit,
      dailyLimitRisk: !!dailySpendLimit && orderTotal > dailySpendLimit,
      belowMinValue: orderTotal < subscriptionSettings.minOrderValue,
      invalidDuration:
        durationDays < subscriptionSettings.minDays || durationDays > subscriptionSettings.maxDays,
    };
  }, [draftItems, menuLookup, selectedControl, orderTotal, durationDays, subscriptionSettings]);

  const hasBlockingControls =
    controlFindings.blockedCategories.length > 0 ||
    controlFindings.blockedItems.length > 0 ||
    controlFindings.perOrderExceeded ||
    controlFindings.dailyLimitRisk;

  const addDraftItem = (menuItemId: string) => {
    const menu = menuLookup.get(menuItemId);
    if (!menu) return;

    setDraftItems((prev) => {
      const exists = prev.find((p) => p.menuItemId === menuItemId);
      if (exists) {
        return prev.map((p) =>
          p.menuItemId === menuItemId
            ? { ...p, quantity: Math.min(10, p.quantity + 1) }
            : p,
        );
      }
      return [...prev, { menuItemId, name: menu.name, quantity: 1 }];
    });
  };

  const changeDraftQty = (menuItemId: string, delta: number) => {
    setDraftItems((prev) =>
      prev
        .map((p) => (p.menuItemId === menuItemId ? { ...p, quantity: p.quantity + delta } : p))
        .filter((p) => p.quantity > 0),
    );
  };

  const handleCreate = async () => {
    if (!childId) {
      toast.error("Select a child");
      return;
    }
    if (draftItems.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    if (!scheduledDate) {
      toast.error("Select start date");
      return;
    }
    if (!subscriptionUntil) {
      toast.error("Select subscription end date");
      return;
    }
    if (controlFindings.invalidDuration) {
      toast.error(
        `Subscription must be ${subscriptionSettings.minDays} to ${subscriptionSettings.maxDays} days`,
      );
      return;
    }
    if (controlFindings.belowMinValue) {
      toast.error(`Minimum pre-order value is ₹${subscriptionSettings.minOrderValue}`);
      return;
    }
    if (hasBlockingControls) {
      toast.error("Blocking controls are active for this selection");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/pre-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId,
          scheduledDate,
          subscriptionUntil,
          items: draftItems.map((d) => ({
            menuItemId: d.menuItemId,
            quantity: d.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (Array.isArray(data.blockedReasons) && data.blockedReasons.length > 0) {
          toast.error(data.blockedReasons[0]);
          return;
        }
        toast.error(data.error || "Failed to create pre-order");
        return;
      }

      toast.success("Subscription pre-order created");
      setDraftItems([]);
      setMenuSearchQuery("");
      await fetchPreOrders();
    } catch {
      toast.error("Failed to create pre-order");
    } finally {
      setCreating(false);
    }
  };

  const removeRelevantBlocks = async () => {
    if (!selectedControl || !childId) return;

    const selectedCategories = Array.from(
      new Set(
        draftItems
          .map((d) => menuLookup.get(d.menuItemId)?.category)
          .filter((c): c is MenuCategory => Boolean(c)),
      ),
    );
    const selectedIds = new Set(draftItems.map((d) => d.menuItemId));

    const nextBlockedCategories = selectedControl.blockedCategories.filter(
      (cat) => !selectedCategories.includes(cat as MenuCategory),
    );
    const nextBlockedItemIds = selectedControl.blockedItemIds.filter(
      (id) => !selectedIds.has(id),
    );

    const nextPerOrderLimit =
      selectedControl.perOrderLimit && orderTotal > selectedControl.perOrderLimit
        ? Math.ceil(orderTotal)
        : selectedControl.perOrderLimit;
    const nextDailyLimit =
      selectedControl.dailySpendLimit && orderTotal > selectedControl.dailySpendLimit
        ? Math.ceil(orderTotal)
        : selectedControl.dailySpendLimit;

    setRemovingBlocks(true);
    try {
      const res = await fetch("/api/controls", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childId,
          blockedCategories: nextBlockedCategories,
          blockedItemIds: nextBlockedItemIds,
          perOrderLimit: nextPerOrderLimit,
          dailySpendLimit: nextDailyLimit,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update controls");
        return;
      }

      toast.success("Relevant controls updated for this selection");
      setRemoveBlocksModalOpen(false);
      await fetchControls();
    } catch {
      toast.error("Failed to update controls");
    } finally {
      setRemovingBlocks(false);
    }
  };

  const statusIcon = (status: PreOrderStatus) => {
    switch (status) {
      case "PENDING":
        return <Clock className="h-4 w-4 text-[#f58220]" />;
      case "FULFILLED":
        return <CheckCircle className="h-4 w-4 text-[#2eab57]" />;
      case "CANCELLED":
        return <XCircle className="h-4 w-4 text-[#e32726]" />;
      case "EXPIRED":
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const statusColor = (status: PreOrderStatus) => {
    switch (status) {
      case "PENDING":
        return "bg-[#f58220]/15 text-[#c66a10]";
      case "FULFILLED":
        return "bg-[#2eab57]/15 text-[#1e7a3c]";
      case "CANCELLED":
        return "bg-[#e32726]/10 text-[#e32726]";
      case "EXPIRED":
        return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-4 sm:py-6 space-y-5 sm:space-y-6">
      <div className="md:hidden rounded-xl border p-1 inline-flex gap-1 bg-background">
        <Link href="/menu">
          <Button type="button" variant="ghost" size="sm" className="rounded-lg">
            Menu
          </Button>
        </Link>
        <Link href="/pre-orders">
          {certePlusActive ? (
            <Button
              type="button"
              size="sm"
              className="rounded-lg bg-gradient-to-r from-gray-900 to-black border-0 shadow-sm"
            >
              <span className="bg-gradient-to-r from-[#f5c862] via-[#e8a230] to-[#d4891a] bg-clip-text text-transparent font-semibold flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-[#e8a230]" />
                Pre-Order
              </span>
            </Button>
          ) : (
            <Button type="button" variant="secondary" size="sm" className="rounded-lg">
              Pre-Order
            </Button>
          )}
        </Link>
      </div>

      {/* ── Celebration overlay when subscribing to Certe+ ── */}
      {showCelebration && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="flex flex-col items-center gap-3 animate-scale-in">
            <div className="relative">
              <Sparkles className="h-16 w-16 text-amber-400 animate-bounce-subtle" />
              <div className="absolute inset-0 h-16 w-16 animate-ping rounded-full bg-amber-400/20" />
            </div>
            <p className="text-xl font-bold text-white text-engraved-gold">Welcome to Certe+</p>
            <p className="text-sm text-amber-200">You can now create meal subscriptions!</p>
          </div>
        </div>
      )}

      {certePlusActive === false ? (
        /* ── Subscription-only card when not subscribed ── */
        <Card className="rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-amber-950/40">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <CardTitle className="text-lg">Unlock Pre-Orders with Certe+</CardTitle>
              <CardDescription>
                Subscribe to Certe+ to create and manage meal subscriptions for your child.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              {children.length > 0 && (
                <div>
                  <LabelText>Select Child</LabelText>
                  <Select value={childId} onValueChange={setChildId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select child" />
                    </SelectTrigger>
                    <SelectContent>
                      {children.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {CERTE_PLUS_PLAN_LIST.map((plan) => (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => setSelectedSubPlan(plan.key)}
                    className={`rounded-lg border p-2.5 text-left transition-all ${
                      selectedSubPlan === plan.key
                        ? "border-amber-500 bg-amber-100/80 dark:bg-amber-900/30 ring-1 ring-amber-400"
                        : "border-amber-200 dark:border-amber-800 bg-white/60 dark:bg-white/5 hover:border-amber-300"
                    }`}
                  >
                    <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">{plan.label}</p>
                    <p className="text-sm font-bold text-amber-700 dark:text-amber-400">₹{plan.price}</p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-500">{plan.duration}</p>
                  </button>
                ))}
              </div>
              <Button
                size="lg"
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md"
                disabled={subscribing || !childId}
                onClick={async () => {
                  setSubscribing(true);
                  try {
                    const res = await fetch("/api/certe-plus", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        paymentMethod: "WALLET",
                        childId: childId || undefined,
                        plan: selectedSubPlan,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      toast.error(data.error || "Subscription failed");
                      return;
                    }
                    setShowCelebration(true);
                    setTimeout(() => setShowCelebration(false), 2500);
                    setCertePlusActive(true);
                    toast.success("Certe+ activated! You can now create meal subscriptions.");
                  } catch {
                    toast.error("Failed to subscribe");
                  } finally {
                    setSubscribing(false);
                  }
                }}
              >
                {subscribing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Subscribing...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Subscribe to Certe+</>
                )}
              </Button>
              {!childId && children.length > 0 && (
                <p className="text-[10px] text-center text-amber-600">Select a child to subscribe.</p>
              )}
              <p className="text-[10px] text-center text-amber-600 dark:text-amber-500">
                Payment deducted from your child&apos;s wallet. Or <Link href="/settings" className="underline font-medium">subscribe from settings</Link>.
              </p>
            </CardContent>
          </div>
        </Card>
      ) : (
        /* ── Full pre-order creation card when subscribed ── */
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Create Subscription</CardTitle>
            <CardDescription>
              Choose child, period and items. Minimum order value is ₹{subscriptionSettings.minOrderValue}.
            </CardDescription>
          </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <LabelText>Child</LabelText>
              <Select value={childId} onValueChange={setChildId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select child" />
                </SelectTrigger>
                <SelectContent>
                  {children.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <LabelText>Start Date</LabelText>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => {
                  const nextStart = e.target.value;
                  setScheduledDate(nextStart);
                  const minEnd = addDays(nextStart, subscriptionSettings.minDays - 1);
                  if (subscriptionUntil < minEnd) {
                    setSubscriptionUntil(minEnd);
                  }
                }}
              />
            </div>

            <div>
              <LabelText>End Date</LabelText>
              <Input
                type="date"
                min={addDays(scheduledDate, subscriptionSettings.minDays - 1)}
                max={addDays(scheduledDate, subscriptionSettings.maxDays - 1)}
                value={subscriptionUntil}
                onChange={(e) => setSubscriptionUntil(e.target.value)}
              />
            </div>

            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-sm font-semibold mt-0.5">{durationDays} day(s)</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Allowed range: {subscriptionSettings.minDays} to {subscriptionSettings.maxDays} days.
              </p>
            </div>
          </div>

          <div className="rounded-xl border p-3 sm:p-4 space-y-3">
            <LabelText>Quick Presets</LabelText>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setSubscriptionUntil(addMonths(scheduledDate, 1))}>
                1 Month
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setSubscriptionUntil(addMonths(scheduledDate, 3))}>
                3 Months
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setSubscriptionUntil(addMonths(scheduledDate, 6))}>
                6 Months
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <LabelText>Search and add food</LabelText>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={menuSearchQuery}
                onChange={(e) => setMenuSearchQuery(e.target.value)}
                placeholder="Search meal, snack, drink or category"
                className="pl-9"
              />
            </div>

            <div className="rounded-xl border max-h-56 overflow-auto">
              {filteredMenuOptions.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">No items found</p>
              ) : (
                <div className="divide-y">
                  {filteredMenuOptions.slice(0, 40).map((item) => {
                    const unitPrice = item.discountedPrice ?? item.price;
                    return (
                      <div key={item.id} className="px-3 py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {MENU_CATEGORY_LABELS[item.category]} - ₹{unitPrice}
                          </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => addDraftItem(item.id)}>
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {draftItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No food selected yet</p>
            ) : (
              <div className="space-y-2">
                {draftItems.map((d) => {
                  const menu = menuLookup.get(d.menuItemId);
                  const unitPrice = menu?.discountedPrice ?? menu?.price ?? 0;
                  return (
                    <div key={d.menuItemId} className="flex items-center justify-between rounded-xl border px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{d.name}</p>
                        <p className="text-xs text-muted-foreground">₹{unitPrice} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" size="icon" variant="outline" onClick={() => changeDraftQty(d.menuItemId, -1)}>
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="w-5 text-center text-sm font-semibold">{d.quantity}</span>
                        <Button type="button" size="icon" variant="outline" onClick={() => changeDraftQty(d.menuItemId, 1)}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border p-3 sm:p-4 space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Selected total</span>
              <span className="font-semibold">₹{Math.round(orderTotal)}</span>
            </div>

            <ul className="text-sm space-y-1">
              {controlFindings.belowMinValue ? (
                <li className="text-amber-700">Minimum pre-order value is ₹{subscriptionSettings.minOrderValue}.</li>
              ) : null}
              {controlFindings.invalidDuration ? (
                <li className="text-amber-700">
                  Subscription duration must be {subscriptionSettings.minDays} to {subscriptionSettings.maxDays} days.
                </li>
              ) : null}
              {controlFindings.blockedCategories.length > 0 ? (
                <li className="text-red-600">
                  Blocked categories: {controlFindings.blockedCategories
                    .map((c) => MENU_CATEGORY_LABELS[c as MenuCategory] ?? c)
                    .join(", ")}
                </li>
              ) : null}
              {controlFindings.blockedItems.length > 0 ? (
                <li className="text-red-600">
                  Blocked items: {controlFindings.blockedItems.join(", ")}
                </li>
              ) : null}
              {controlFindings.perOrderExceeded && controlFindings.perOrderLimit ? (
                <li className="text-red-600">
                  Per-order limit exceeded: ₹{controlFindings.perOrderLimit}
                </li>
              ) : null}
              {controlFindings.dailyLimitRisk && controlFindings.dailySpendLimit ? (
                <li className="text-red-600">
                  Daily limit can block this order: ₹{controlFindings.dailySpendLimit}
                </li>
              ) : null}
              {!controlFindings.belowMinValue &&
              !controlFindings.invalidDuration &&
              !hasBlockingControls ? (
                <li className="text-emerald-700">Selection is valid for pre-order.</li>
              ) : null}
            </ul>

            {hasBlockingControls && (
              <Button
                type="button"
                variant="outline"
                className="gap-2 mt-1"
                onClick={() => setRemoveBlocksModalOpen(true)}
                disabled={!selectedControl || removingBlocks}
              >
                {removingBlocks ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                Remove Relevant Blocks
              </Button>
            )}
          </div>

          <Button
            onClick={handleCreate}
            disabled={
              creating ||
              controlFindings.belowMinValue ||
              controlFindings.invalidDuration ||
              hasBlockingControls
            }
            className="w-full h-11 text-base"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create Pre-Order
          </Button>
          {hasBlockingControls ? (
            <p className="text-xs text-red-600">
              Create is disabled because blocking controls are active for selected items.
            </p>
          ) : null}
        </CardContent>
        </Card>
      )}

      {preOrders.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="pt-8 pb-8 text-center">
            <CalendarClock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No pre-orders yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Upcoming And Recent</h2>
          {preOrders.map((po) => (
            <Card key={po.id} className="rounded-2xl">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base truncate">{po.childName}</CardTitle>
                  <Badge className={statusColor(po.status)}>
                    {statusIcon(po.status)}
                    <span className="ml-1">{PRE_ORDER_STATUS_LABELS[po.status]}</span>
                  </Badge>
                </div>
                <CardDescription>
                  {po.mode === "SUBSCRIPTION"
                    ? `Subscription: ${po.scheduledDate} to ${po.subscriptionUntil || "-"}`
                    : `One Day: ${po.scheduledDate}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Separator className="mb-3" />
                <div className="space-y-1">
                  {po.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Package className="h-3 w-3 text-muted-foreground" />
                      <span>
                        {item.name} x {item.quantity}
                      </span>
                    </div>
                  ))}
                </div>
                {po.lastFulfilledDate ? (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last fulfilled: {po.lastFulfilledDate}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground mt-1">
                  Created: {new Date(po.createdAt).toLocaleString("en-IN")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={removeBlocksModalOpen} onOpenChange={setRemoveBlocksModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Blocking Controls?</DialogTitle>
            <DialogDescription>
              This will remove category and item blocks relevant to current selection and may increase spend limits so this pre-order can be placed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveBlocksModalOpen(false)}
              disabled={removingBlocks}
            >
              Cancel
            </Button>
            <Button type="button" onClick={removeRelevantBlocks} disabled={removingBlocks}>
              {removingBlocks ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm And Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LabelText({ children }: { children: string }) {
  return <p className="text-xs text-muted-foreground mb-1">{children}</p>;
}
