"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BottomSheet } from "@/components/ui/motion";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Plus,
  Minus,
  Trash2,
  CalendarClock,
  Search,
  ChevronRight,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import {
  CERTE_PLUS,
  MENU_CATEGORY_LABELS,
  type MenuCategory,
  type PreOrderStatus,
} from "@/lib/constants";
import { type BreakSlot, parseBreakSlots } from "@/lib/break-slots";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { usePersistedSelection } from "@/lib/use-persisted-selection";
import { cn } from "@/lib/utils";

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

type CanteenInfo = {
  id: string;
  name: string;
  location: string | null;
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

function createClientId() {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `po-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDateShort(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default function PreOrdersPage({ embedded = false }: { embedded?: boolean }) {
  const certePlusStatus = useCertePlusStore((s) => s.status);
  const ensureCertePlusFresh = useCertePlusStore((s) => s.ensureFresh);
  const { value: selectedCanteen, setValue: setSelectedCanteen } = usePersistedSelection(
    "certe:selected-canteen-id",
  );
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [certePlusActive, setCertePlusActive] = useState<boolean | null>(null);

  const [children, setChildren] = useState<ChildOption[]>([]);
  const [controls, setControls] = useState<ChildControl[]>([]);
  const [menuItems, setMenuItems] = useState<MenuOption[]>([]);
  const [canteens, setCanteens] = useState<CanteenInfo[]>([]);
  const [preOrders, setPreOrders] = useState<PreOrderWithItems[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [subscriptionEndDate, setSubscriptionEndDate] = useState<string | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);
  const [wizardMenuItems, setWizardMenuItems] = useState<MenuOption[]>([]);
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
  const [editCanteenId, setEditCanteenId] = useState<string | null>(null);
  const [editMenuItems, setEditMenuItems] = useState<MenuOption[]>([]);
  const [editMenuLoading, setEditMenuLoading] = useState(false);
  const [editAddingItem, setEditAddingItem] = useState(false);

  const fetchEditMenu = useCallback(async (canteenId: string | null) => {
    setEditMenuLoading(true);
    try {
      const url = canteenId
        ? `/api/menu?canteenId=${encodeURIComponent(canteenId)}`
        : "/api/menu";
      const res = await fetch(url);
      if (!res.ok) return;
      const raw = await res.json();
      const items = ((raw.items || raw) as MenuOption[]).filter(
        (m) => m.available && m.subscribable !== false,
      );
      setEditMenuItems(items);
    } catch {
      toast.error("Failed to load menu");
    } finally {
      setEditMenuLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const menuUrl = selectedCanteen
        ? `/api/menu?canteenId=${encodeURIComponent(selectedCanteen)}`
        : "/api/menu";
      const [preOrdersRes, childrenRes, menuRes, controlsRes, settingsRes, walletRes] = await Promise.all([
        fetch("/api/pre-orders"),
        fetch("/api/children"),
        fetch(menuUrl),
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
      const canteenData = Array.isArray(menuRaw.canteens)
        ? (menuRaw.canteens as CanteenInfo[])
        : [];
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
      setCanteens(canteenData);
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
  }, [assignBreak, assignChildId, selectedCanteen]);

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
  const wizardMenuById = useMemo(() => new Map(wizardMenuItems.map((m) => [m.id, m])), [wizardMenuItems]);
  const childById = useMemo(() => new Map(children.map((c) => [c.id, c.name])), [children]);
  const controlByChild = useMemo(() => new Map(controls.map((c) => [c.childId, c])), [controls]);
  const breakLabelByName = useMemo(
    () =>
      new Map(
        settings.breakSlots.map((slot) => [slot.name, `${slot.name} (${slot.startTime}-${slot.endTime})`] as const),
      ),
    [settings.breakSlots],
  );

  // Edit calculation memos (need menuById to be defined above)
  const editOriginalTotal = useMemo(() => {
    if (!editingPreOrder) return 0;
    return editingPreOrder.items.reduce((sum, item) => {
      const menu = menuById.get(item.menuItemId);
      return sum + (menu?.discountedPrice ?? menu?.price ?? 0) * item.quantity;
    }, 0);
  }, [editingPreOrder, menuById]);

  const editCurrentTotal = useMemo(() => {
    return editRows.reduce((sum, row) => {
      const menu = menuById.get(row.menuItemId);
      return sum + (menu?.discountedPrice ?? menu?.price ?? 0) * row.quantity;
    }, 0);
  }, [editRows, menuById]);

  const editDailyDiff = editCurrentTotal - editOriginalTotal;

  const editRemainingDays = useMemo(() => {
    if (!editingPreOrder) return 0;
    const todayIso = new Date().toISOString().slice(0, 10);
    const effectiveStart = todayIso > editingPreOrder.scheduledDate
      ? todayIso
      : editingPreOrder.scheduledDate;
    const endIso = editingPreOrder.subscriptionUntil ?? editingPreOrder.scheduledDate;
    return countSchoolDaysInclusive(effectiveStart, endIso);
  }, [editingPreOrder]);

  const editExtraPayment = useMemo(() => {
    if (editDailyDiff <= 0 || editRemainingDays <= 0) return 0;
    const platformFeeMultiplier = 1 + CERTE_PLUS.PRE_ORDER_PLATFORM_FEE_PERCENT / 100;
    return Math.round(editDailyDiff * editRemainingDays * platformFeeMultiplier * 100) / 100;
  }, [editDailyDiff, editRemainingDays]);

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
    // Use wizard menu data when in wizard, otherwise the main menu data
    const lookupMap = wizardMenuItems.length > 0 ? wizardMenuById : menuById;

    for (const childId of new Set(allocations.map((a) => a.childId))) {
      const rows = allocations.filter((a) => a.childId === childId);
      const total = rows.reduce((sum, row) => {
        const menu = lookupMap.get(row.menuItemId);
        return sum + (menu?.discountedPrice ?? menu?.price ?? 0) * row.quantity;
      }, 0);

      const control = controlByChild.get(childId);
      const hasBlocks = rows.some((row) => {
        const menu = lookupMap.get(row.menuItemId);
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
  }, [allocations, menuById, wizardMenuById, wizardMenuItems.length, controlByChild, settings.minOrderValue]);

  const hasBelowMin = Array.from(summaryByChild.values()).some((v) => v.belowMin);
  const hasBlocks = Array.from(summaryByChild.values()).some((v) => v.hasBlocks);

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
          id: createClientId(),
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

  // Wizard step state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [wizardCanteenId, setWizardCanteenId] = useState<string | null>(null);

  const openWizard = () => {
    setAllocations([]);
    setWizardCanteenId(selectedCanteen || null);
    setWizardStep(1);
    setWizardOpen(true);
  };

  // Refetch menu when wizard canteen changes
  const [wizardMenuLoading, setWizardMenuLoading] = useState(false);
  const fetchWizardMenu = useCallback(async (canteenId: string | null) => {
    setWizardMenuLoading(true);
    try {
      const url = canteenId
        ? `/api/menu?canteenId=${encodeURIComponent(canteenId)}`
        : "/api/menu";
      const res = await fetch(url);
      if (!res.ok) return;
      const raw = await res.json();
      const items = ((raw.items || raw) as MenuOption[]).filter(
        (m) => m.available && m.subscribable !== false,
      );
      setWizardMenuItems(items);
    } catch {
      toast.error("Failed to load menu");
    } finally {
      setWizardMenuLoading(false);
    }
  }, []);

  const filteredWizardMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return wizardMenuItems;
    return wizardMenuItems.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (MENU_CATEGORY_LABELS[m.category] || m.category).toLowerCase().includes(q),
    );
  }, [wizardMenuItems, search]);

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
    setEditAddingItem(false);
    setEditCanteenId(selectedCanteen || null);
    setEditMenuItems([]);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editingPreOrder) return;
    if (editRows.length === 0) return toast.error("Add at least one row");
    if (editExtraPayment > 0 && walletBalance !== null && walletBalance < editExtraPayment) {
      return toast.error(`Insufficient wallet balance. Extra required: ₹${editExtraPayment.toFixed(2)}, Available: ₹${walletBalance.toFixed(2)}.`);
    }
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
      if (data.extraPaymentAmount > 0) {
        toast.success(`Pre-order updated! ₹${(data.extraPaymentAmount as number).toFixed(2)} deducted from wallet.`);
        setWalletBalance((prev) => prev !== null ? prev - (data.extraPaymentAmount as number) : null);
      } else {
        toast.success("Pre-order updated");
      }
      setEditOpen(false);
      setEditingPreOrder(null);
      setEditAddingItem(false);
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
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Certe+ Required</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Meal passes are available for Certe+ subscribers.
        </p>
        <Link href="/settings">
          <Button className="mt-5">Upgrade to Certe+</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-6 pb-28" : "mx-auto max-w-2xl px-4 py-5 space-y-6 pb-28"}>
      {/* ── Header ── */}
      <div>
        {preOrders.length === 0 && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            Create a pass for daily food subscriptions
          </p>
        )}
      </div>

      {/* ── Plan summary strip ── */}
      <div className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
          <CalendarClock className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{subscriptionPlan || "Active"}</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
              {periodSchoolDays} days left
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDateShort(startDate)} → {formatDateShort(endDate)}
          </p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            Mon–Fri only · Weekends are not included in the pass
          </p>
        </div>
      </div>

      {/* ── Active Passes ── */}
      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Active
        </p>

        {preOrders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CalendarClock className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No passes yet</p>
          </div>
        ) : (
          preOrders.map((po) => (
            <div
              key={po.id}
              className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-snug">
                    {po.childName} · {po.items[0]?.breakName ?? "—"}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground truncate">
                    {po.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDateShort(po.scheduledDate)} → {po.subscriptionUntil ? formatDateShort(po.subscriptionUntil) : "—"}
                    {po.mode === "SUBSCRIPTION" && po.status === "PENDING" && (
                      <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                        · {countSchoolDaysInclusive(new Date().toISOString().slice(0, 10), po.subscriptionUntil || po.scheduledDate)} days left
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">Mon–Fri only</p>
                </div>
                {po.status === "PENDING" && (
                  <button
                    type="button"
                    onClick={() => openEdit(po)}
                    className="shrink-0 text-xs font-medium text-primary active:opacity-70 transition-opacity"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── New Pass dashed card ── */}
      <button
        type="button"
        onClick={openWizard}
        className="w-full rounded-2xl border-2 border-dashed border-primary/30 py-5 text-center text-sm font-medium text-primary active:scale-[0.98] transition-transform"
      >
        + New Pass
      </button>

      {/* ── Priority access badge — fixed above bottom nav ── */}
      <div className="fixed bottom-20 left-0 right-0 z-10 flex justify-center pointer-events-none">
        <div className="flex items-center gap-1.5 rounded-full bg-primary/5 border border-primary/10 px-4 py-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-medium text-primary">Priority access</span>
        </div>
      </div>

      {/* ── New Pass Wizard Sheet ── */}
      <BottomSheet
        open={wizardOpen}
        onClose={() => { if (!creating) setWizardOpen(false); }}
        snapPoints={[92]}
      >
        <div className="px-5 pb-8 pt-2">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-5">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  s <= wizardStep ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>

          {/* Step 1 — Select canteen */}
          {wizardStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Choose canteen</h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">Select which canteen to order from</p>
              </div>

              <div className="space-y-2">
                {canteens.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No canteens available</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {canteens.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setWizardCanteenId(c.id)}
                        className={cn(
                          "rounded-2xl p-4 text-left transition-all",
                          wizardCanteenId === c.id
                            ? "bg-primary/10 border border-primary"
                            : "bg-card border border-border",
                        )}
                      >
                        <p className={cn("text-sm font-medium", wizardCanteenId === c.id && "text-primary")}>
                          {c.name}
                        </p>
                        {c.location && (
                          <p className="text-xs text-muted-foreground mt-0.5">{c.location}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button
                className="w-full h-12 rounded-2xl"
                disabled={!wizardCanteenId && canteens.length > 0}
                onClick={() => {
                  void fetchWizardMenu(wizardCanteenId);
                  setWizardStep(2);
                }}
              >
                Next
              </Button>
            </div>
          )}

          {/* Step 2 — Select child + break */}
          {wizardStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Who is this for?</h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">Pick a child and break slot</p>
              </div>

              {/* Child selection — large tap targets */}
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Child</p>
                <div className="grid grid-cols-2 gap-2">
                  {children.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setAssignChildId(c.id)}
                      className={cn(
                        "rounded-2xl p-4 text-left text-sm font-medium transition-all",
                        assignChildId === c.id
                          ? "bg-primary/10 border border-primary text-primary"
                          : "bg-card border border-border",
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Break selection — large tap targets */}
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Break</p>
                <div className="grid grid-cols-1 gap-2">
                  {settings.breaks.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setAssignBreak(b)}
                      className={cn(
                        "rounded-2xl p-4 text-left transition-all",
                        assignBreak === b
                          ? "bg-primary/10 border border-primary"
                          : "bg-card border border-border",
                      )}
                    >
                      <p className={cn("text-sm font-medium", assignBreak === b && "text-primary")}>
                        {b}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {settings.breakSlots.find((s) => s.name === b)?.startTime} – {settings.breakSlots.find((s) => s.name === b)?.endTime}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={() => setWizardStep(1)}>
                  Back
                </Button>
                <Button
                  className="flex-1 h-12 rounded-2xl"
                  disabled={!assignChildId}
                  onClick={() => setWizardStep(3)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 — Pick items */}
          {wizardStep === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Pick items</h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  {childById.get(assignChildId)} · {assignBreak}
                  {wizardCanteenId && canteens.find(c => c.id === wizardCanteenId) && (
                    <span> · {canteens.find(c => c.id === wizardCanteenId)!.name}</span>
                  )}
                </p>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-11 rounded-full bg-muted/40 border-0 pl-9"
                  placeholder="Search menu..."
                />
              </div>

              {wizardMenuLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Menu grid — 2 columns */}
                  <div className="grid grid-cols-2 gap-3 max-h-[50vh] overflow-auto overscroll-contain pb-2">
                    {filteredWizardMenu.slice(0, 50).map((item) => {
                      const qty = allocations
                        .filter((a) => a.menuItemId === item.id && a.childId === assignChildId && a.breakName === assignBreak)
                        .reduce((s, a) => s + a.quantity, 0);

                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
                        >
                          <div className="p-3">
                            <p className="text-sm font-semibold truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {MENU_CATEGORY_LABELS[item.category]}
                            </p>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-base font-bold tabular-nums">
                                ₹{item.discountedPrice ?? item.price}
                              </span>
                              {qty === 0 ? (
                                <button
                                  type="button"
                                  onClick={() => addItem(item.id)}
                                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md active:scale-95 transition-transform"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              ) : (
                                <div className="flex items-center gap-1 rounded-full bg-primary px-1.5 py-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const alloc = allocations.find(
                                        (a) => a.menuItemId === item.id && a.childId === assignChildId && a.breakName === assignBreak,
                                      );
                                      if (alloc) changeQty(alloc.id, -1);
                                    }}
                                    className="flex h-6 w-6 items-center justify-center rounded-full text-primary-foreground"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="w-5 text-center text-xs font-bold text-primary-foreground tabular-nums">{qty}</span>
                                  <button
                                    type="button"
                                    onClick={() => addItem(item.id)}
                                    className="flex h-6 w-6 items-center justify-center rounded-full text-primary-foreground"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filteredWizardMenu.length === 0 && (
                      <p className="col-span-2 py-8 text-center text-xs text-muted-foreground">No items found</p>
                    )}
                  </div>
                </>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={() => setWizardStep(2)}>
                  Back
                </Button>
                <Button
                  className="flex-1 h-12 rounded-2xl"
                  disabled={allocations.length === 0}
                  onClick={() => setWizardStep(4)}
                >
                  Review ({allocations.reduce((s, a) => s + a.quantity, 0)} items)
                </Button>
              </div>
            </div>
          )}

          {/* Step 4 — Review + pay */}
          {wizardStep === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Review</h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  {childById.get(assignChildId)} · {assignBreak} · {periodSchoolDays} school days
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                  Mon–Fri only · Weekends excluded
                </p>
              </div>

              {/* Line items */}
              <div className="space-y-3">
                {allocations.map((row) => {
                  const menu = wizardMenuById.get(row.menuItemId) ?? menuById.get(row.menuItemId);
                  return (
                    <div key={row.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{menu?.name ?? "Item"}</p>
                        <p className="text-xs text-muted-foreground">
                          {childById.get(row.childId)} · {breakLabelByName.get(row.breakName) ?? row.breakName}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1 rounded-full border border-border px-2 py-1">
                          <button type="button" onClick={() => changeQty(row.id, -1)} className="h-5 w-5 flex items-center justify-center">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-4 text-center text-xs font-semibold tabular-nums">{row.quantity}</span>
                          <button type="button" onClick={() => changeQty(row.id, 1)} className="h-5 w-5 flex items-center justify-center">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="text-sm font-medium tabular-nums w-14 text-right">
                          ₹{((menu?.discountedPrice ?? menu?.price ?? 0) * row.quantity).toFixed(0)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Cost summary */}
              <Separator />
              <div className="space-y-1.5 text-sm">
                {Array.from(summaryByChild.entries()).map(([childId, s]) => (
                  <div key={childId} className="flex justify-between">
                    <span className="text-muted-foreground">{childById.get(childId)}</span>
                    <span className={cn("tabular-nums", s.belowMin && "text-amber-600", s.hasBlocks && "text-red-600")}>
                      ₹{Math.round(s.total)}/day
                      {s.belowMin ? " (below min)" : ""}
                    </span>
                  </div>
                ))}
                {periodSchoolDays >= settings.minDays && estimatedTotal > 0 && (
                  <>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>₹{dailyTotalBase.toFixed(0)} × {periodSchoolDays} days + 2% fee</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold pt-1">
                      <span>Total</span>
                      <span className="tabular-nums">₹{estimatedTotal.toFixed(2)}</span>
                    </div>
                    {walletBalance !== null && (
                      <p className={cn("text-xs", walletBalance < estimatedTotal ? "text-red-600" : "text-emerald-600")}>
                        Wallet: ₹{walletBalance.toFixed(2)} {walletBalance < estimatedTotal ? "— top up needed" : "✓"}
                      </p>
                    )}
                  </>
                )}
                <p className="text-xs text-muted-foreground pt-1">Min ₹{settings.minOrderValue}/child · {settings.minDays}+ school days</p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={() => setWizardStep(3)}>
                  Back
                </Button>
                <Button
                  className="flex-1 h-12 rounded-2xl"
                  disabled={
                    creating ||
                    allocations.length === 0 ||
                    hasBelowMin ||
                    hasBlocks ||
                    periodSchoolDays < settings.minDays ||
                    periodSchoolDays <= 0 ||
                    (walletBalance !== null && walletBalance < estimatedTotal)
                  }
                  onClick={openPaymentDialog}
                >
                  Pay ₹{estimatedTotal.toFixed(0)}
                </Button>
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* ── Edit Pass Sheet ── */}
      <BottomSheet open={editOpen} onClose={() => { setEditOpen(false); setEditAddingItem(false); }} snapPoints={[92]}>
        <div className="px-5 pb-8 pt-2 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <CalendarClock className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-tight">Edit Pass</h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                {editingPreOrder?.childName}
                {editRemainingDays > 0 && (
                  <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                    · {editRemainingDays} days left
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Current items */}
          {!editAddingItem && (
            <>
              <div className="max-h-[40vh] space-y-2 overflow-auto overscroll-contain">
                {editRows.map((row) => {
                  const menu = menuById.get(row.menuItemId);
                  const unitPrice = menu?.discountedPrice ?? menu?.price ?? 0;
                  return (
                    <div key={row.id} className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{menu?.name ?? "Item"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {breakLabelByName.get(row.breakName) ?? row.breakName} · ₹{unitPrice}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1 rounded-full bg-muted/50 px-1.5 py-1">
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center rounded-full active:scale-95 transition-transform"
                            onClick={() => setEditRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold tabular-nums">{row.quantity}</span>
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center rounded-full active:scale-95 transition-transform"
                            onClick={() => setEditRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, quantity: x.quantity + 1 } : x)))}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded-full text-destructive/60 hover:text-destructive active:scale-95 transition-all"
                          onClick={() => setEditRows((prev) => prev.filter((x) => x.id !== row.id))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Extra payment notice */}
              {editDailyDiff !== 0 && (
                <div className={cn(
                  "rounded-2xl p-3.5 text-sm",
                  editDailyDiff > 0 ? "bg-amber-50 dark:bg-amber-950/20" : "bg-emerald-50 dark:bg-emerald-950/20",
                )}>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Daily change</span>
                    <span className={cn("font-semibold tabular-nums", editDailyDiff > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400")}>
                      {editDailyDiff > 0 ? "+" : ""}₹{Math.round(editDailyDiff)}/day
                    </span>
                  </div>
                  {editExtraPayment > 0 && (
                    <>
                      <div className="flex justify-between mt-1.5 text-xs text-muted-foreground">
                        <span>+₹{Math.round(editDailyDiff)} × {editRemainingDays} days + 2% fee</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-bold">
                        <span>Extra payment</span>
                        <span className="tabular-nums text-amber-700 dark:text-amber-400">₹{editExtraPayment.toFixed(2)}</span>
                      </div>
                      {walletBalance !== null && (
                        <p className={cn("text-xs mt-1", walletBalance >= editExtraPayment ? "text-emerald-600" : "text-red-600")}>
                          Wallet: ₹{walletBalance.toFixed(2)} {walletBalance >= editExtraPayment ? "✓" : "— top up needed"}
                        </p>
                      )}
                    </>
                  )}
                  {editDailyDiff < 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Daily cost reduced. No refund for already-paid days.
                    </p>
                  )}
                </div>
              )}

              {/* Add item button */}
              <button
                type="button"
                className="w-full rounded-2xl border-2 border-dashed border-primary/30 py-3.5 text-center text-sm font-medium text-primary active:scale-[0.98] transition-transform"
                onClick={() => {
                  setEditAddingItem(true);
                  if (editMenuItems.length === 0) {
                    void fetchEditMenu(editCanteenId);
                  }
                }}
              >
                <Plus className="inline h-4 w-4 mr-1 -mt-0.5" />
                Add Item
              </button>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-12 rounded-2xl" onClick={() => { setEditOpen(false); setEditAddingItem(false); }} disabled={savingEdit}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 h-12 rounded-2xl"
                  onClick={saveEdit}
                  disabled={savingEdit || editRows.length === 0 || (editExtraPayment > 0 && walletBalance !== null && walletBalance < editExtraPayment)}
                >
                  {savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editExtraPayment > 0 ? `Save · Pay ₹${editExtraPayment.toFixed(0)}` : "Save"}
                </Button>
              </div>
            </>
          )}

          {/* Add item sub-view with canteen selector */}
          {editAddingItem && (
            <>
              <div>
                <h3 className="text-base font-semibold tracking-tight">Add an item</h3>
                <p className="text-[13px] text-muted-foreground mt-0.5">Select canteen and pick items</p>
              </div>

              {/* Canteen selector */}
              {canteens.length > 1 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Canteen</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {canteens.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setEditCanteenId(c.id);
                          void fetchEditMenu(c.id);
                        }}
                        className={cn(
                          "shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-all",
                          editCanteenId === c.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/50 text-muted-foreground",
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {editMenuLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-[40vh] overflow-auto overscroll-contain pb-2">
                  {editMenuItems.map((item) => {
                    const alreadyAdded = editRows.some((r) => r.menuItemId === item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (alreadyAdded) return;
                          setEditRows((prev) => [
                            ...prev,
                            {
                              id: crypto.randomUUID(),
                              menuItemId: item.id,
                              quantity: 1,
                              breakName: settings.breaks[0] || DEFAULT_BREAKS[0],
                            },
                          ]);
                          setEditAddingItem(false);
                        }}
                        disabled={alreadyAdded}
                        className={cn(
                          "rounded-2xl bg-card p-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all active:scale-[0.98]",
                          alreadyAdded && "opacity-40",
                        )}
                      >
                        <p className="text-sm font-semibold truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{MENU_CATEGORY_LABELS[item.category]}</p>
                        <p className="text-base font-bold tabular-nums mt-1.5">₹{item.discountedPrice ?? item.price}</p>
                        {alreadyAdded && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">Already added</p>
                        )}
                      </button>
                    );
                  })}
                  {editMenuItems.length === 0 && !editMenuLoading && (
                    <p className="col-span-2 py-8 text-center text-xs text-muted-foreground">No items available</p>
                  )}
                </div>
              )}

              <Button
                variant="outline"
                className="w-full h-12 rounded-2xl"
                onClick={() => setEditAddingItem(false)}
              >
                Back to edit
              </Button>
            </>
          )}
        </div>
      </BottomSheet>

      {/* ── Payment Confirmation BottomSheet ── */}
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
      >
        <div className="px-5 pb-8 pt-2 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Confirm Payment</h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Wallet deduction</p>
            </div>
          </div>

          {/* Amount breakdown */}
          <div className="rounded-2xl bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Daily meals</span>
              <span className="tabular-nums">₹{dailyTotalBase.toFixed(0)}/day</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration</span>
              <span>{periodSchoolDays} school days</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">₹{(dailyTotalBase * periodSchoolDays).toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Platform fee (2%)</span>
              <span className="text-primary tabular-nums">+₹{(dailyTotalBase * periodSchoolDays * CERTE_PLUS.PRE_ORDER_PLATFORM_FEE_PERCENT / 100).toFixed(0)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="tabular-nums">₹{estimatedTotal.toFixed(2)}</span>
            </div>
            {walletBalance !== null && (
              <p className={cn("text-xs", walletBalance - estimatedTotal >= 0 ? "text-emerald-600" : "text-red-600")}>
                Balance after: ₹{(walletBalance - estimatedTotal).toFixed(2)}
              </p>
            )}
          </div>

          {/* Period */}
          <p className="text-xs text-muted-foreground text-center">
            {formatDateShort(startDate)} → {formatDateShort(endDate)} · Mon–Fri only
          </p>

          {/* Slider */}
          <div>
            <p className="text-xs text-center text-muted-foreground mb-3">
              {paymentConfirmed ? "Payment confirmed!" : "Slide to confirm payment"}
            </p>

            <div
              ref={sliderTrackRef}
              className={cn(
                "relative h-14 rounded-full overflow-hidden select-none border transition-colors",
                paymentConfirmed
                  ? "bg-emerald-100 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-700"
                  : "bg-primary/5 border-primary/20",
              )}
            >
              {!paymentConfirmed && (
                <div
                  className="absolute left-0 top-0 bottom-0 rounded-full pointer-events-none bg-primary/10"
                  style={{
                    width: `${paymentSlideX + 56}px`,
                    transition: paymentSliding ? "none" : "width 0.3s ease",
                  }}
                />
              )}

              {paymentConfirmed && (
                <div className="absolute inset-0 flex items-center justify-center gap-2">
                  {creating ? (
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
                  ) : (
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  )}
                  <span className="text-sm font-semibold text-emerald-600">
                    {creating ? "Processing…" : "Confirmed!"}
                  </span>
                </div>
              )}

              {!paymentConfirmed && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-sm text-muted-foreground/50 tracking-wide ml-14">
                    Slide to pay ₹{estimatedTotal.toFixed(0)} →
                  </span>
                </div>
              )}

              {!paymentConfirmed && (
                <div
                  ref={sliderThumbRef}
                  onMouseDown={(e) => { e.preventDefault(); handleSliderStart(e.clientX); }}
                  onTouchStart={(e) => { e.preventDefault(); handleSliderStart(e.touches[0].clientX); }}
                  className="absolute top-1 bottom-1 left-1 w-12 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing z-10 touch-none bg-primary shadow-lg"
                  style={{
                    transform: `translateX(${paymentSlideX}px)`,
                    transition: paymentSliding ? "none" : "transform 0.3s ease",
                  }}
                  role="slider"
                  aria-label="Slide to confirm payment"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={paymentSlideX}
                >
                  <ChevronRight className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
            </div>

            <p className="text-[10px] text-center text-muted-foreground mt-3">
              This will deduct ₹{estimatedTotal.toFixed(2)} from your family wallet.
            </p>
          </div>

          {!paymentConfirmed && (
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground py-2 active:opacity-70 transition-opacity"
              onClick={() => { setPaymentOpen(false); setPaymentSlideX(0); }}
              disabled={creating}
            >
              Cancel
            </button>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
