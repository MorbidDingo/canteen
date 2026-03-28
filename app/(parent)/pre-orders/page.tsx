"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { BottomSheet } from "@/components/ui/motion";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Plus,
  Minus,
  Trash2,
  CalendarClock,
  PencilLine,
  Search,
  ChevronRight,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import {
  CERTE_PLUS,
  MENU_CATEGORY_LABELS,
  PRE_ORDER_STATUS_LABELS,
  MAX_ACTIVE_PREORDERS_PER_CHILD,
  type MenuCategory,
  type PreOrderStatus,
} from "@/lib/constants";
import { type BreakSlot, parseBreakSlots } from "@/lib/break-slots";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";

type ChildOption = { id: string; name: string };
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
  blockedCategories: string[];
  blockedItemIds: string[];
  dailySpendLimit: number | null;
  perOrderLimit: number | null;
};
type PreOrderWithItems = {
  id: string;
  childId: string;
  childName: string;
  mode: "ONE_DAY" | "SUBSCRIPTION";
  scheduledDate: string;
  subscriptionUntil: string | null;
  status: PreOrderStatus;
  createdAt: string;
  items: {
    id: string;
    menuItemId: string;
    name: string;
    quantity: number;
    breakName: string | null;
  }[];
};
type DraftAllocation = {
  id: string;
  childId: string;
  menuItemId: string;
  quantity: number;
  breakName: string;
};
type EditRow = {
  id: string;
  menuItemId: string;
  quantity: number;
  breakName: string;
};

const DEFAULT_BREAKS = ["Short Break", "Lunch Break", "High Tea"];
const DEFAULT_BREAK_SLOTS: BreakSlot[] = [
  { name: "Short Break", startTime: "10:30", endTime: "10:50" },
  { name: "Lunch Break", startTime: "12:30", endTime: "13:30" },
  { name: "High Tea", startTime: "15:30", endTime: "15:50" },
];
const DEFAULT_MIN_ORDER = 60;
const DEFAULT_MIN_DAYS = 3;
const DEFAULT_MAX_DAYS = 180;

function isSchoolDay(date: Date) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function getNextSchoolDayIso() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 1);
  while (!isSchoolDay(date)) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function addSchoolDays(startIso: string, schoolDaysToAdd: number) {
  const date = new Date(`${startIso}T00:00:00.000Z`);
  let left = Math.max(0, schoolDaysToAdd);
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isSchoolDay(date)) left -= 1;
  }
  return date.toISOString().slice(0, 10);
}

function countSchoolDaysInclusive(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  if (end.getTime() < start.getTime()) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    if (isSchoolDay(cursor)) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export default function PreOrdersPage() {
  const certePlusStatus = useCertePlusStore((s) => s.status);
  const ensureCertePlusFresh = useCertePlusStore((s) => s.ensureFresh);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [certePlusActive, setCertePlusActive] = useState<boolean | null>(null);

  const [children, setChildren] = useState<ChildOption[]>([]);
  const [controls, setControls] = useState<ChildControl[]>([]);
  const [menuItems, setMenuItems] = useState<MenuOption[]>([]);
  const [preOrders, setPreOrders] = useState<PreOrderWithItems[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [subscriptionEndDate, setSubscriptionEndDate] = useState<string | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    minOrderValue: DEFAULT_MIN_ORDER,
    minDays: DEFAULT_MIN_DAYS,
    maxDays: DEFAULT_MAX_DAYS,
    breaks: DEFAULT_BREAKS,
    breakSlots: DEFAULT_BREAK_SLOTS,
  });

  const [assignChildId, setAssignChildId] = useState("");
  const [assignBreak, setAssignBreak] = useState(DEFAULT_BREAKS[0]);
  const [allocations, setAllocations] = useState<DraftAllocation[]>([]);

  // Payment confirmation dialog state
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentSlideX, setPaymentSlideX] = useState(0);
  const [paymentSliding, setPaymentSliding] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const sliderThumbRef = useRef<HTMLDivElement>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editingPreOrder, setEditingPreOrder] = useState<PreOrderWithItems | null>(null);
  const [editRows, setEditRows] = useState<EditRow[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const [preOrdersRes, childrenRes, menuRes, controlsRes, settingsRes, walletRes] = await Promise.all([
        fetch("/api/pre-orders"),
        fetch("/api/children"),
        fetch("/api/menu"),
        fetch("/api/controls"),
        fetch("/api/menu/subscription-settings"),
        fetch("/api/wallet"),
      ]);

      if (!preOrdersRes.ok || !childrenRes.ok || !controlsRes.ok) {
        throw new Error("load failed");
      }

      const preOrdersData = (await preOrdersRes.json()) as PreOrderWithItems[];
      const childrenData = (await childrenRes.json()) as ChildOption[];
      const menuRaw = menuRes.ok ? await menuRes.json() : { items: [] };
      const menuData = ((menuRaw.items || menuRaw) as MenuOption[]).filter(
        (m) => m.available && m.subscribable !== false,
      );
      const controlsData = (await controlsRes.json()) as ChildControl[];
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};

      if (walletRes.ok) {
        const walletData = await walletRes.json();
        const wList = Array.isArray(walletData) ? walletData : [];
        setWalletBalance(wList.length > 0 ? (wList[0].balance as number) : 0);
      }

      const breakSlots = Array.isArray(settingsData.subscription_break_slots)
        ? parseBreakSlots(JSON.stringify(settingsData.subscription_break_slots))
        : DEFAULT_BREAK_SLOTS;
      const breaks = breakSlots.map((slot) => slot.name);

      setPreOrders(preOrdersData);
      setChildren(childrenData);
      setMenuItems(menuData);
      setControls(controlsData);
      setSettings({
        minOrderValue: Number(settingsData.subscription_min_order_value) || DEFAULT_MIN_ORDER,
        minDays: Math.max(Number(settingsData.subscription_min_days) || DEFAULT_MIN_DAYS, CERTE_PLUS.PRE_ORDER_MIN_SCHOOL_DAYS),
        maxDays: Number(settingsData.subscription_max_days) || DEFAULT_MAX_DAYS,
        breaks,
        breakSlots,
      });

      if (!assignChildId && childrenData.length > 0) setAssignChildId(childrenData[0].id);
      if (!breaks.includes(assignBreak)) setAssignBreak(breaks[0]);
    } catch {
      toast.error("Failed to load pre-order data");
    } finally {
      setLoading(false);
    }
  }, [assignBreak, assignChildId]);

  useEffect(() => {
    if (!certePlusStatus) return;
    setCertePlusActive(certePlusStatus.active === true);
    setSubscriptionEndDate(certePlusStatus.subscription?.endDate ?? null);
    setSubscriptionPlan(certePlusStatus.subscription?.plan ?? null);
  }, [certePlusStatus]);

  useEffect(() => {
    void ensureCertePlusFresh(45_000);
    void fetchAll();
  }, [ensureCertePlusFresh, fetchAll]);

  const menuById = useMemo(() => new Map(menuItems.map((m) => [m.id, m])), [menuItems]);
  const childById = useMemo(() => new Map(children.map((c) => [c.id, c.name])), [children]);
  const controlByChild = useMemo(() => new Map(controls.map((c) => [c.childId, c])), [controls]);
  const breakLabelByName = useMemo(
    () =>
      new Map(
        settings.breakSlots.map((slot) => [slot.name, `${slot.name} (${slot.startTime}-${slot.endTime})`] as const),
      ),
    [settings.breakSlots],
  );

  const filteredMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (MENU_CATEGORY_LABELS[m.category] || m.category).toLowerCase().includes(q),
    );
  }, [menuItems, search]);

  const startDate = getNextSchoolDayIso();
  const subscriptionEndIso = subscriptionEndDate
    ? new Date(subscriptionEndDate).toISOString().slice(0, 10)
    : null;
  const schoolDaysFromSubscription = subscriptionEndIso
    ? countSchoolDaysInclusive(startDate, subscriptionEndIso)
    : 0;
  const maxAllowedBySettings = settings.maxDays;
  const periodSchoolDays = Math.min(schoolDaysFromSubscription, maxAllowedBySettings);
  const endDate = periodSchoolDays > 0 ? addSchoolDays(startDate, periodSchoolDays - 1) : startDate;

  const summaryByChild = useMemo(() => {
    const map = new Map<
      string,
      {
        total: number;
        belowMin: boolean;
        hasBlocks: boolean;
      }
    >();

    for (const childId of new Set(allocations.map((a) => a.childId))) {
      const rows = allocations.filter((a) => a.childId === childId);
      const total = rows.reduce((sum, row) => {
        const menu = menuById.get(row.menuItemId);
        return sum + (menu?.discountedPrice ?? menu?.price ?? 0) * row.quantity;
      }, 0);

      const control = controlByChild.get(childId);
      const hasBlocks = rows.some((row) => {
        const menu = menuById.get(row.menuItemId);
        if (!menu || !control) return false;
        return (
          control.blockedCategories.includes(menu.category) ||
          control.blockedItemIds.includes(menu.id) ||
          (!!control.perOrderLimit && total > control.perOrderLimit) ||
          (!!control.dailySpendLimit && total > control.dailySpendLimit)
        );
      });

      map.set(childId, {
        total,
        belowMin: total < settings.minOrderValue,
        hasBlocks,
      });
    }

    return map;
  }, [allocations, menuById, controlByChild, settings.minOrderValue]);

  const hasBelowMin = Array.from(summaryByChild.values()).some((v) => v.belowMin);
  const hasBlocks = Array.from(summaryByChild.values()).some((v) => v.hasBlocks);

  const getDisplayStatusLabel = (po: PreOrderWithItems) => {
    if (po.mode === "SUBSCRIPTION" && po.status === "PENDING") {
      return "Active";
    }
    return PRE_ORDER_STATUS_LABELS[po.status];
  };

  const addItem = (menuItemId: string) => {
    if (!assignChildId) return toast.error("Select child first");
    if (!assignBreak.trim()) return toast.error("Select break first");
    setAllocations((prev) => {
      const existing = prev.find(
        (row) =>
          row.childId === assignChildId &&
          row.menuItemId === menuItemId &&
          row.breakName === assignBreak,
      );
      if (existing) {
        return prev.map((row) =>
          row.id === existing.id ? { ...row, quantity: Math.min(10, row.quantity + 1) } : row,
        );
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          childId: assignChildId,
          menuItemId,
          quantity: 1,
          breakName: assignBreak,
        },
      ];
    });
  };

  const changeQty = (id: string, delta: number) => {
    setAllocations((prev) =>
      prev
        .map((row) => (row.id === id ? { ...row, quantity: row.quantity + delta } : row))
        .filter((row) => row.quantity > 0),
    );
  };

  // Calculate estimated payment amount for the pre-order
  const dailyTotalBase = useMemo(() => {
    let sum = 0;
    for (const [, s] of summaryByChild.entries()) {
      sum += s.total;
    }
    return sum;
  }, [summaryByChild]);

  const estimatedTotal = useMemo(() => {
    if (periodSchoolDays <= 0) return 0;
    return Math.round(dailyTotalBase * periodSchoolDays * (1 + CERTE_PLUS.PRE_ORDER_PLATFORM_FEE_PERCENT / 100) * 100) / 100;
  }, [dailyTotalBase, periodSchoolDays]);

  const submitPreOrder = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/pre-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodSchoolDays,
          allocations: allocations.map((a) => ({
            childId: a.childId,
            menuItemId: a.menuItemId,
            quantity: a.quantity,
            breakName: a.breakName,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create pre-order");
        setPaymentConfirmed(false);
        setPaymentSlideX(0);
        setPaymentOpen(false);
        return;
      }
      toast.success(`Pre-order created! ₹${(data.totalPaymentAmount as number).toFixed(2)} deducted from wallet.`);
      setAllocations([]);
      setPaymentOpen(false);
      setPaymentConfirmed(false);
      setPaymentSlideX(0);
      setWalletBalance((prev) => prev !== null ? prev - (data.totalPaymentAmount as number) : null);
      await fetchAll();
    } catch {
      toast.error("Failed to create pre-order");
      setPaymentConfirmed(false);
      setPaymentSlideX(0);
    } finally {
      setCreating(false);
    }
  }, [allocations, fetchAll, periodSchoolDays]);

  // Slider handlers
  const handleSliderStart = useCallback((clientX: number) => {
    if (paymentConfirmed || creating) return;
    setPaymentSliding(true);
    const track = sliderTrackRef.current;
    const thumb = sliderThumbRef.current;
    if (!track || !thumb) return;
    const trackRect = track.getBoundingClientRect();
    const maxX = trackRect.width - thumb.offsetWidth - 8;

    const onMove = (moveX: number) => {
      const x = Math.min(Math.max(0, moveX - trackRect.left - thumb.offsetWidth / 2), maxX);
      setPaymentSlideX(x);
      if (x >= maxX * 0.88) {
        setPaymentConfirmed(true);
        setPaymentSliding(false);
        document.removeEventListener("mousemove", mouseMoveHandler);
        document.removeEventListener("mouseup", mouseUpHandler);
        document.removeEventListener("touchmove", touchMoveHandler);
        document.removeEventListener("touchend", touchEndHandler);
        void submitPreOrder();
      }
    };

    const mouseMoveHandler = (e: MouseEvent) => onMove(e.clientX);
    const mouseUpHandler = () => {
      setPaymentSliding(false);
      setPaymentSlideX(0);
      document.removeEventListener("mousemove", mouseMoveHandler);
      document.removeEventListener("mouseup", mouseUpHandler);
    };
    const touchMoveHandler = (e: TouchEvent) => {
      e.preventDefault();
      onMove(e.touches[0].clientX);
    };
    const touchEndHandler = () => {
      setPaymentSliding(false);
      setPaymentSlideX(0);
      document.removeEventListener("touchmove", touchMoveHandler);
      document.removeEventListener("touchend", touchEndHandler);
    };

    document.addEventListener("mousemove", mouseMoveHandler);
    document.addEventListener("mouseup", mouseUpHandler);
    document.addEventListener("touchmove", touchMoveHandler, { passive: false });
    document.addEventListener("touchend", touchEndHandler);

    onMove(clientX);
  }, [paymentConfirmed, creating, submitPreOrder]);

  const openPaymentDialog = () => {
    if (allocations.length === 0) return toast.error("Add at least one allocation");
    if (!subscriptionEndIso) return toast.error("Subscription end date missing. Please refresh.");
    if (periodSchoolDays <= 0) {
      return toast.error("Your Certe+ subscription has no school days left for pre-orders.");
    }
    if (periodSchoolDays < settings.minDays) {
      return toast.error(
        `At least ${settings.minDays} school days are required. Remaining from your subscription: ${periodSchoolDays}.`,
      );
    }
    if (hasBelowMin) return toast.error(`Each child must meet min ₹${settings.minOrderValue}`);
    if (hasBlocks) return toast.error("Some allocations are blocked by controls");
    if (walletBalance !== null && walletBalance < estimatedTotal) {
      return toast.error(`Insufficient wallet balance. Required: ₹${estimatedTotal.toFixed(2)}, Available: ₹${walletBalance.toFixed(2)}. Please top up.`);
    }
    setPaymentConfirmed(false);
    setPaymentSlideX(0);
    setPaymentOpen(true);
  };

  // Keep old createPreOrders as alias for the dialog opener
  const createPreOrders = openPaymentDialog;

  const openEdit = (po: PreOrderWithItems) => {
    const fallbackBreak = settings.breaks[0] ?? DEFAULT_BREAKS[0];
    setEditingPreOrder(po);
    setEditRows(
      po.items.map((i) => ({
        id: i.id,
        menuItemId: i.menuItemId,
        quantity: i.quantity,
        breakName: i.breakName || fallbackBreak,
      })),
    );
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editingPreOrder) return;
    if (editRows.length === 0) return toast.error("Add at least one row");
    setSavingEdit(true);
    try {
      const res = await fetch("/api/pre-orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preOrderId: editingPreOrder.id,
          items: editRows.map((r) => ({
            menuItemId: r.menuItemId,
            quantity: r.quantity,
            breakName: r.breakName,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error || "Failed to update pre-order");
      toast.success("Pre-order updated");
      setEditOpen(false);
      setEditingPreOrder(null);
      await fetchAll();
    } catch {
      toast.error("Failed to update pre-order");
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (certePlusActive === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking Certe+ status...
      </div>
    );
  }

  if (certePlusActive === false) {
    return (
      <Card className="mx-auto mt-6 max-w-xl">
        <CardHeader>
          <CardTitle>Certe+ Required</CardTitle>
          <CardDescription>
            Subscription pre-orders are available for Certe+ parents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/settings">
            <Button>Open Subscription Settings</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="app-shell space-y-5 pb-28">
      {/* ── Premium Hero ──────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 p-5 text-white dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900 dark:border dark:border-white/5">
        <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">Certe+ Subscription</p>
        <h2 className="text-lg font-bold mt-1.5 tracking-tight">Pre-Orders</h2>
        <p className="text-xs text-white/50 mt-1 leading-relaxed">
          Meal schedule derived from your active plan.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/5 border border-white/8 p-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Plan</p>
            <p className="text-sm font-semibold mt-0.5">{subscriptionPlan || "ACTIVE"}</p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/8 p-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">School Days</p>
            <p className="text-sm font-semibold mt-0.5">{periodSchoolDays}</p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/8 p-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Start</p>
            <p className="text-sm font-semibold mt-0.5">{startDate}</p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/8 p-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">End</p>
            <p className="text-sm font-semibold mt-0.5">{endDate}</p>
          </div>
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Create Subscription Pre-Order</CardTitle>
          <CardDescription>
            Assign food to children with break windows. Kiosk will auto-place only during matching break time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <LabelText>Child</LabelText>
              <Select value={assignChildId} onValueChange={setAssignChildId}>
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
              <LabelText>Break</LabelText>
              <Select value={assignBreak} onValueChange={setAssignBreak}>
                <SelectTrigger>
                  <SelectValue placeholder="Select break" />
                </SelectTrigger>
                <SelectContent>
                  {settings.breaks.map((b) => (
                    <SelectItem key={b} value={b}>
                      {breakLabelByName.get(b) ?? b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              placeholder="Search menu"
            />
          </div>

          <div className="max-h-56 overflow-auto rounded-md border">
            {filteredMenu.slice(0, 50).map((item) => (
              <div key={item.id} className="flex items-center justify-between border-b px-3 py-2 last:border-b-0">
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {MENU_CATEGORY_LABELS[item.category]} · ₹{item.discountedPrice ?? item.price}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => addItem(item.id)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {allocations.map((row) => {
              const menu = menuById.get(row.menuItemId);
              return (
                <div key={row.id} className="rounded-md border p-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{menu?.name ?? row.menuItemId}</p>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAllocations((prev) => prev.filter((x) => x.id !== row.id))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <Select value={row.childId} onValueChange={(value) => setAllocations((prev) => prev.map((x) => (x.id === row.id ? { ...x, childId: value } : x)))}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {children.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={row.breakName} onValueChange={(value) => setAllocations((prev) => prev.map((x) => (x.id === row.id ? { ...x, breakName: value } : x)))}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {settings.breaks.map((b) => (
                          <SelectItem key={b} value={b}>{breakLabelByName.get(b) ?? b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center justify-between rounded-md border px-2">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => changeQty(row.id, -1)}>
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-sm font-semibold">{row.quantity}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => changeQty(row.id, 1)}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-md border p-3 text-sm space-y-1">
            <p className="text-muted-foreground">Min value per child: ₹{settings.minOrderValue}</p>
            <p className="text-muted-foreground">
              Minimum period: {settings.minDays} school days (1 week)
            </p>
            <p className="text-muted-foreground">
              Available from subscription: {periodSchoolDays} school days
              {subscriptionEndIso ? ` (until ${subscriptionEndIso})` : ""}
            </p>
            {Array.from(summaryByChild.entries()).map(([childId, s]) => (
              <p key={childId}>
                {childById.get(childId)}: ₹{Math.round(s.total)}/day
                {s.belowMin ? " (below min)" : ""}
                {s.hasBlocks ? " (blocked by controls)" : ""}
              </p>
            ))}
            {allocations.length > 0 && periodSchoolDays >= settings.minDays && (
              <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs space-y-0.5">
                <p className="font-medium text-amber-800">Estimated Payment (Wallet)</p>
                <p className="text-amber-700">Daily total: ₹{dailyTotalBase.toFixed(2)} × {periodSchoolDays} days = ₹{(dailyTotalBase * periodSchoolDays).toFixed(2)}</p>
                <p className="text-muted-foreground">Platform fee (2%): +₹{(dailyTotalBase * periodSchoolDays * CERTE_PLUS.PRE_ORDER_PLATFORM_FEE_PERCENT / 100).toFixed(2)}</p>
                <p className="font-semibold text-foreground">Total: ₹{estimatedTotal.toFixed(2)}</p>
                {walletBalance !== null && (
                  <p className={walletBalance < estimatedTotal ? "text-red-600 font-medium" : "text-emerald-700"}>
                    Wallet balance: ₹{walletBalance.toFixed(2)} {walletBalance < estimatedTotal ? "— Insufficient, please top up" : "✓"}
                  </p>
                )}
              </div>
            )}
            <p className="text-muted-foreground">
              Maximum active pre-orders: {MAX_ACTIVE_PREORDERS_PER_CHILD} per child.
            </p>
            {periodSchoolDays < settings.minDays ? (
              <p className="text-amber-700">
                Remaining subscription school days ({periodSchoolDays}) are below minimum required ({settings.minDays}).
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Payment is wallet-only. No online payment allowed for pre-orders.
            </p>
          </div>

          <Button
            className="w-full"
            disabled={
              creating ||
              allocations.length === 0 ||
              hasBelowMin ||
              hasBlocks ||
              periodSchoolDays < settings.minDays ||
              periodSchoolDays <= 0 ||
              (walletBalance !== null && walletBalance < estimatedTotal)
            }
            onClick={createPreOrders}
          >
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {allocations.length > 0 && estimatedTotal > 0 ? `Review & Pay ₹${estimatedTotal.toFixed(2)}` : "Create Pre-Order"}
          </Button>
        </CardContent>
      </Card>



      {preOrders.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CalendarClock className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No pre-orders yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {preOrders.map((po) => (
            <Card key={po.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{po.childName}</CardTitle>
                  <Badge variant="outline">{getDisplayStatusLabel(po)}</Badge>
                </div>
                <CardDescription>
                  {po.mode === "SUBSCRIPTION"
                    ? `Subscription: ${po.scheduledDate} to ${po.subscriptionUntil || "-"}`
                    : `One Day: ${po.scheduledDate}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Separator className="mb-2" />
                <div className="space-y-1">
                  {po.items.map((item) => (
                    <p key={item.id} className="text-sm">
                      {item.name} x {item.quantity} - {item.breakName ? (breakLabelByName.get(item.breakName) ?? item.breakName) : "No break"}
                    </p>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Created: {new Date(po.createdAt).toLocaleString("en-IN")}</p>
                {po.status === "PENDING" ? (
                  <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={() => openEdit(po)}>
                    <PencilLine className="h-3.5 w-3.5" />
                    Edit Food And Break
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} snapPoints={[85]}>
        <div className="space-y-4 pb-4">
          <div>
            <h2 className="text-base font-bold">Edit Pre-Order</h2>
            <p className="text-xs text-muted-foreground mt-0.5">You can edit food and break only.</p>
          </div>
          <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
            {editRows.map((row) => (
              <div key={row.id} className="rounded-xl border p-3 space-y-2">
                {/* Menu item selector — full width */}
                <Select value={row.menuItemId} onValueChange={(value) => setEditRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, menuItemId: value } : x)))}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {menuItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Break + Quantity row */}
                <div className="grid grid-cols-2 gap-2">
                  <Select value={row.breakName} onValueChange={(value) => setEditRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, breakName: value } : x)))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set([...settings.breaks, ...editRows.map((x) => x.breakName)])).map((breakName) => (
                        <SelectItem key={breakName} value={breakName}>{breakLabelByName.get(breakName) ?? breakName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center justify-between rounded-xl border px-3 h-9">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-sm font-semibold">{row.quantity}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, quantity: x.quantity + 1 } : x)))}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setEditRows((prev) => prev.filter((x) => x.id !== row.id))}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() =>
              setEditRows((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  menuItemId: menuItems[0]?.id || "",
                  quantity: 1,
                  breakName: settings.breaks[0] || DEFAULT_BREAKS[0],
                },
              ])
            }
            disabled={menuItems.length === 0}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Item
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={saveEdit} disabled={savingEdit || editRows.length === 0}>
              {savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* ── Payment Confirmation BottomSheet ─────────────────────────── */}
      <BottomSheet
        open={paymentOpen}
        onClose={() => {
          if (!creating) {
            setPaymentOpen(false);
            setPaymentSlideX(0);
            setPaymentConfirmed(false);
          }
        }}
        snapPoints={[85]}
        className="bg-[#0d1117]"
      >
        <div className="space-y-5 pb-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Confirm Pre-Order</h2>
              <p className="text-xs text-white/50 mt-0.5">Wallet deduction only</p>
            </div>
          </div>

          {/* Amount breakdown */}
          <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Daily meals ({children.length > 0 ? `${children.length} child${children.length > 1 ? "ren" : ""}` : ""})</span>
              <span className="text-white">₹{dailyTotalBase.toFixed(2)}/day</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Duration</span>
              <span className="text-white">{periodSchoolDays} school days</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Subtotal</span>
              <span className="text-white">₹{(dailyTotalBase * periodSchoolDays).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Platform fee (2%)</span>
              <span className="text-primary">+₹{(dailyTotalBase * periodSchoolDays * CERTE_PLUS.PRE_ORDER_PLATFORM_FEE_PERCENT / 100).toFixed(2)}</span>
            </div>
            <div className="border-t border-white/10 pt-1.5 flex justify-between">
              <span className="font-semibold text-white">Total</span>
              <span className="text-lg font-bold text-primary">₹{estimatedTotal.toFixed(2)}</span>
            </div>
            {walletBalance !== null && (
              <div className="flex justify-between text-xs mt-0.5">
                <span className="text-white/40">Balance after</span>
                <span className={walletBalance - estimatedTotal >= 0 ? "text-emerald-400" : "text-red-400"}>
                  ₹{(walletBalance - estimatedTotal).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Period */}
          <div className="flex gap-2 text-xs text-white/50">
            <span>{startDate}</span>
            <span>→</span>
            <span>{endDate}</span>
            <span className="ml-auto flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              Priority queue
            </span>
          </div>

          {/* Slider */}
          <div>
            <p className="text-xs text-center text-white/35 mb-3">
              {paymentConfirmed ? "Payment confirmed!" : "Slide to confirm payment"}
            </p>

            <div
              ref={sliderTrackRef}
              className="relative h-14 rounded-full overflow-hidden select-none"
              style={{
                background: paymentConfirmed
                  ? "linear-gradient(90deg, #065f46 0%, #047857 100%)"
                  : "linear-gradient(90deg, rgba(212,137,26,0.12) 0%, rgba(232,162,48,0.06) 100%)",
                border: paymentConfirmed ? "1px solid #10b981" : "1px solid rgba(255,255,255,0.10)",
                transition: "background 0.4s, border-color 0.4s",
              }}
            >
              {!paymentConfirmed && (
                <div
                  className="absolute left-0 top-0 bottom-0 rounded-full pointer-events-none"
                  style={{
                    width: `${paymentSlideX + 56}px`,
                    background: "linear-gradient(90deg, rgba(212,137,26,0.25) 0%, rgba(232,162,48,0.08) 100%)",
                    transition: paymentSliding ? "none" : "width 0.3s ease",
                  }}
                />
              )}

              {paymentConfirmed && (
                <div className="absolute inset-0 flex items-center justify-center gap-2">
                  {creating ? (
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
                  ) : (
                    <ShieldCheck className="h-5 w-5 text-emerald-300" />
                  )}
                  <span className="text-sm font-semibold text-emerald-300">
                    {creating ? "Processing…" : "Confirmed!"}
                  </span>
                </div>
              )}

              {!paymentConfirmed && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-sm text-white/25 tracking-wide ml-14">
                    Slide to pay ₹{estimatedTotal.toFixed(2)} →
                  </span>
                </div>
              )}

              {!paymentConfirmed && (
                <div
                  ref={sliderThumbRef}
                  onMouseDown={(e) => { e.preventDefault(); handleSliderStart(e.clientX); }}
                  onTouchStart={(e) => { e.preventDefault(); handleSliderStart(e.touches[0].clientX); }}
                  className="absolute top-1 bottom-1 left-1 w-12 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing z-10 touch-none"
                  style={{
                    transform: `translateX(${paymentSlideX}px)`,
                    background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.8) 100%)",
                    boxShadow: "0 2px 12px hsl(var(--primary)/0.5)",
                    transition: paymentSliding ? "none" : "transform 0.3s ease",
                  }}
                  role="slider"
                  aria-label="Slide to confirm payment"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={paymentSlideX}
                >
                  <ChevronRight className="h-5 w-5 text-white" />
                </div>
              )}
            </div>

            <p className="text-[10px] text-center text-white/25 mt-3">
              This will deduct ₹{estimatedTotal.toFixed(2)} from your family wallet.
            </p>
          </div>

          {!paymentConfirmed && (
            <Button
              variant="ghost"
              className="w-full text-white/35 hover:text-white/60 hover:bg-white/5"
              onClick={() => { setPaymentOpen(false); setPaymentSlideX(0); }}
              disabled={creating}
            >
              Cancel
            </Button>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

function LabelText({ children }: { children: string }) {
  return <p className="mb-1 text-xs text-muted-foreground">{children}</p>;
}
