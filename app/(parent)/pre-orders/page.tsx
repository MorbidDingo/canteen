"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Plus,
  Minus,
  Trash2,
  CalendarClock,
  PencilLine,
  Search,
} from "lucide-react";
import {
  MENU_CATEGORY_LABELS,
  PRE_ORDER_STATUS_LABELS,
  MAX_ACTIVE_PREORDERS_PER_CHILD,
  type MenuCategory,
  type PreOrderStatus,
} from "@/lib/constants";
import { type BreakSlot, parseBreakSlots } from "@/lib/break-slots";

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

type CertePlusResponse = {
  active: boolean;
  subscription: {
    id: string;
    plan: string;
    startDate: string;
    endDate: string;
    status: string;
  } | null;
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
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [certePlusActive, setCertePlusActive] = useState<boolean | null>(null);

  const [children, setChildren] = useState<ChildOption[]>([]);
  const [controls, setControls] = useState<ChildControl[]>([]);
  const [menuItems, setMenuItems] = useState<MenuOption[]>([]);
  const [preOrders, setPreOrders] = useState<PreOrderWithItems[]>([]);

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

  const [editOpen, setEditOpen] = useState(false);
  const [editingPreOrder, setEditingPreOrder] = useState<PreOrderWithItems | null>(null);
  const [editRows, setEditRows] = useState<EditRow[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const [preOrdersRes, childrenRes, menuRes, controlsRes, certeRes, settingsRes] = await Promise.all([
        fetch("/api/pre-orders"),
        fetch("/api/children"),
        fetch("/api/menu"),
        fetch("/api/controls"),
        fetch("/api/certe-plus"),
        fetch("/api/menu/subscription-settings"),
      ]);

      if (!preOrdersRes.ok || !childrenRes.ok || !menuRes.ok || !controlsRes.ok || !certeRes.ok || !settingsRes.ok) {
        throw new Error("load failed");
      }

      const preOrdersData = (await preOrdersRes.json()) as PreOrderWithItems[];
      const childrenData = (await childrenRes.json()) as ChildOption[];
      const menuRaw = await menuRes.json();
      const menuData = ((menuRaw.items || menuRaw) as MenuOption[]).filter(
        (m) => m.available && m.subscribable !== false,
      );
      const controlsData = (await controlsRes.json()) as ChildControl[];
      const certeData = (await certeRes.json()) as CertePlusResponse;
      const settingsData = await settingsRes.json();

      const breakSlots = Array.isArray(settingsData.subscription_break_slots)
        ? parseBreakSlots(JSON.stringify(settingsData.subscription_break_slots))
        : DEFAULT_BREAK_SLOTS;
      const breaks = breakSlots.map((slot) => slot.name);

      setPreOrders(preOrdersData);
      setChildren(childrenData);
      setMenuItems(menuData);
      setControls(controlsData);
      setCertePlusActive(certeData.active === true);
      setSubscriptionEndDate(certeData.subscription?.endDate ?? null);
      setSubscriptionPlan(certeData.subscription?.plan ?? null);
      setSettings({
        minOrderValue: Number(settingsData.subscription_min_order_value) || DEFAULT_MIN_ORDER,
        minDays: Number(settingsData.subscription_min_days) || DEFAULT_MIN_DAYS,
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
    void fetchAll();
  }, [fetchAll]);

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

  const createPreOrders = async () => {
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
    if (hasBelowMin) return toast.error(`Each child must meet min Rs${settings.minOrderValue}`);
    if (hasBlocks) return toast.error("Some allocations are blocked by controls");

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
      if (!res.ok) return toast.error(data.error || "Failed to create pre-order");
      toast.success("Subscription pre-order created");
      setAllocations([]);
      await fetchAll();
    } catch {
      toast.error("Failed to create pre-order");
    } finally {
      setCreating(false);
    }
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
    <div className="container mx-auto max-w-5xl space-y-5 px-4 py-6 pb-28">
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-[#f58220] via-[#e27417] to-[#c45f0d] text-white">
        <CardContent className="py-5">
          <p className="text-xs uppercase tracking-wider text-white/70">Certe+ Subscription</p>
          <h2 className="text-xl font-bold mt-1">Create Pre-Orders</h2>
          <p className="text-sm text-white/80 mt-1">
            Meal schedule is auto-derived from your active Certe+ plan.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="text-[11px] text-white/70">Plan</p>
              <p className="text-sm font-semibold">{subscriptionPlan || "ACTIVE"}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="text-[11px] text-white/70">School Days</p>
              <p className="text-sm font-semibold">{periodSchoolDays}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="text-[11px] text-white/70">Start</p>
              <p className="text-sm font-semibold">{startDate}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="text-[11px] text-white/70">End</p>
              <p className="text-sm font-semibold">{endDate}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-white/70">
            School days are not manually editable here.
          </p>
        </CardContent>
      </Card>

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
                    {MENU_CATEGORY_LABELS[item.category]} - Rs{item.discountedPrice ?? item.price}
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

          <div className="rounded-md border p-3 text-sm">
            <p className="text-muted-foreground">Min value per child: Rs{settings.minOrderValue}</p>
            <p className="text-muted-foreground">
              Available from subscription: {periodSchoolDays} school days
              {subscriptionEndIso ? ` (until ${subscriptionEndIso})` : ""}
            </p>
            {Array.from(summaryByChild.entries()).map(([childId, s]) => (
              <p key={childId}>
                {childById.get(childId)}: Rs{Math.round(s.total)}
                {s.belowMin ? " (below min)" : ""}
                {s.hasBlocks ? " (blocked by controls)" : ""}
              </p>
            ))}
            <p className="text-muted-foreground">
              Maximum active pre-orders: {MAX_ACTIVE_PREORDERS_PER_CHILD} per child.
            </p>
            {periodSchoolDays < settings.minDays ? (
              <p className="text-amber-700">
                Remaining subscription school days ({periodSchoolDays}) are below minimum required ({settings.minDays}).
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              Existing subscriptions stay active if minimum changes; break-only edits remain allowed even when below new minimum.
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
              periodSchoolDays <= 0
            }
            onClick={createPreOrders}
          >
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create Pre-Order
          </Button>
        </CardContent>
      </Card>

      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 backdrop-blur p-3">
        <Button
          className="w-full h-11"
          disabled={
            creating ||
            allocations.length === 0 ||
            hasBelowMin ||
            hasBlocks ||
            periodSchoolDays < settings.minDays ||
            periodSchoolDays <= 0
          }
          onClick={createPreOrders}
        >
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create Pre-Order
        </Button>
      </div>

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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Pre-Order</DialogTitle>
            <DialogDescription>You can edit food and break only.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
            {editRows.map((row) => (
              <div key={row.id} className="rounded-md border p-2">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Select value={row.menuItemId} onValueChange={(value) => setEditRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, menuItemId: value } : x)))}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {menuItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={row.breakName} onValueChange={(value) => setEditRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, breakName: value } : x)))}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set([...settings.breaks, ...editRows.map((x) => x.breakName)])).map((breakName) => (
                        <SelectItem key={breakName} value={breakName}>{breakLabelByName.get(breakName) ?? breakName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center justify-between rounded-md border px-2">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-sm font-semibold">{row.quantity}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, quantity: x.quantity + 1 } : x)))}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="mt-1 text-red-600" onClick={() => setEditRows((prev) => prev.filter((x) => x.id !== row.id))}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={savingEdit || editRows.length === 0}>
              {savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LabelText({ children }: { children: string }) {
  return <p className="mb-1 text-xs text-muted-foreground">{children}</p>;
}
