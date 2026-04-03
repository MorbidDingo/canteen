"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Download,
  Fingerprint,
  IndianRupee,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  Search,
  Send,
  Smartphone,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useSSE } from "@/lib/events";

type EventTargetType = "BOTH" | "ALL_PARENTS" | "ALL_GENERAL" | "CLASS" | "SELECTED" | "KIOSK";

type PaymentAccount = {
  id: string;
  label: string;
  method: "UPI" | "BANK_ACCOUNT";
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
};

type PaymentEvent = {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  targetType: string;
  targetClass: string | null;
  targetAccountIds: string | null;
  dueDate: string | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  kioskMode: boolean;
  receiptCount: number;
  createdAt: string;
  paymentAccountId: string | null;
  paymentAccountLabel: string | null;
  paymentAccountMethod: "UPI" | "BANK_ACCOUNT" | null;
};

type ChildInfo = {
  id: string;
  name: string;
  grNumber: string | null;
  className: string | null;
  section: string | null;
  parentId: string;
};

type ReceiptEntry = {
  id: string;
  childId: string | null;
  paymentMode: "KIOSK_TAP" | "CASH" | "SENT";
  amount: number;
  receiptNumber: string;
  notes: string | null;
  paidAt: string;
};

type RecipientAccount = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "PARENT" | "GENERAL";
};

type EventForm = {
  title: string;
  description: string;
  amount: string;
  paymentAccountId: string;
  targetType: EventTargetType;
  targetClass: string[];
  dueDate: string;
  kioskMode: boolean;
};

const EMPTY_FORM: EventForm = {
  title: "",
  description: "",
  amount: "",
  paymentAccountId: "",
  targetType: "BOTH",
  targetClass: [],
  dueDate: "",
  kioskMode: false,
};

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function statusVariant(status: PaymentEvent["status"]) {
  if (status === "ACTIVE") return "default" as const;
  if (status === "COMPLETED") return "secondary" as const;
  if (status === "CANCELLED") return "destructive" as const;
  return "outline" as const;
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function isDueCompleted(event: PaymentEvent) {
  return Boolean(event.dueDate && new Date(event.dueDate).getTime() <= Date.now());
}

function matchesTarget(child: ChildInfo, event: PaymentEvent) {
  const targetType = event.targetType;
  const targetClasses = parseJsonArray(event.targetClass).map((c) => c.toLowerCase());
  const targetAccountIds = new Set(parseJsonArray(event.targetAccountIds));

  if (targetType === "KIOSK" || targetType === "ALL_PARENTS" || targetType === "BOTH" || targetType === "ALL_USERS") {
    return true;
  }
  if (targetType === "CLASS") {
    return Boolean(child.className && targetClasses.includes(child.className.toLowerCase()));
  }
  if (targetType === "SELECTED") {
    return targetAccountIds.has(child.parentId);
  }
  if (targetType === "ALL_GENERAL") {
    return false;
  }
  return true;
}

function targetSummary(event: PaymentEvent) {
  if (event.targetType === "ALL_PARENTS") return "Parents";
  if (event.targetType === "ALL_GENERAL") return "General users";
  if (event.targetType === "BOTH" || event.targetType === "ALL_USERS") return "Parents + General";
  if (event.targetType === "KIOSK") return "Kiosk only";
  if (event.targetType === "CLASS") {
    const classes = parseJsonArray(event.targetClass);
    return classes.length > 0 ? `Classes: ${classes.join(", ")}` : "Class filtered";
  }
  if (event.targetType === "SELECTED") {
    const ids = parseJsonArray(event.targetAccountIds);
    return `Selected accounts (${ids.length})`;
  }
  return "Custom";
}

function toDateInput(raw: string | null) {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function OperatorPaymentEventsPage() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [approvedAccounts, setApprovedAccounts] = useState<PaymentAccount[]>([]);
  const [classes, setClasses] = useState<string[]>([]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PaymentEvent | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);

  const [selectedAccounts, setSelectedAccounts] = useState<RecipientAccount[]>([]);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountResults, setAccountResults] = useState<RecipientAccount[]>([]);
  const [searchingAccounts, setSearchingAccounts] = useState(false);

  const [kioskEvent, setKioskEvent] = useState<PaymentEvent | null>(null);
  const [kioskLoading, setKioskLoading] = useState(false);
  const [kioskSearch, setKioskSearch] = useState("");
  const [kioskChildren, setKioskChildren] = useState<ChildInfo[]>([]);
  const [kioskReceipts, setKioskReceipts] = useState<ReceiptEntry[]>([]);
  const [kioskCollectionMode, setKioskCollectionMode] = useState<"KIOSK_TAP" | "CASH">("KIOSK_TAP");
  const [collectingChildId, setCollectingChildId] = useState<string | null>(null);
  const [cashSelectedIds, setCashSelectedIds] = useState<string[]>([]);
  const [cashNotes, setCashNotes] = useState("");
  const [bulkCollecting, setBulkCollecting] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [eventsRes, accountsRes, classesRes] = await Promise.all([
        fetch("/api/operator/payment-events", { cache: "no-store" }),
        fetch("/api/operator/payment-accounts", { cache: "no-store" }),
        fetch("/api/operator/children?classesOnly=true", { cache: "no-store" }),
      ]);

      if (!eventsRes.ok || !accountsRes.ok || !classesRes.ok) {
        throw new Error("Failed to load payment event data");
      }

      const [eventsData, accountsData, classesData] = await Promise.all([
        eventsRes.json(),
        accountsRes.json(),
        classesRes.json(),
      ]);

      setEvents(eventsData.events ?? []);
      setApprovedAccounts((accountsData.accounts ?? []).filter((a: PaymentAccount) => a.status === "APPROVED"));
      setClasses((classesData.classes ?? []).filter((c: unknown): c is string => typeof c === "string"));
    } catch {
      if (!silent) toast.error("Failed to load payment events");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useSSE("payment-event", () => void fetchData(true));

  useEffect(() => {
    if (!editorOpen || form.targetType !== "SELECTED") return;

    const q = accountQuery.trim();
    if (q.length < 2) {
      setAccountResults([]);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setSearchingAccounts(true);
      try {
        const res = await fetch(`/api/operator/payment-events/accounts?q=${encodeURIComponent(q)}&limit=40`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (active) setAccountResults(data.accounts ?? []);
      } catch {
        if (active) setAccountResults([]);
      } finally {
        if (active) setSearchingAccounts(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [editorOpen, form.targetType, accountQuery]);

  const dueCompleteIds = useMemo(() => {
    return new Set(events.filter((event) => isDueCompleted(event)).map((event) => event.id));
  }, [events]);

  const activeEvents = useMemo(
    () => events.filter((event) => event.status === "ACTIVE" && !dueCompleteIds.has(event.id)),
    [events, dueCompleteIds],
  );

  const draftEvents = useMemo(
    () => events.filter((event) => event.status === "DRAFT" && !dueCompleteIds.has(event.id)),
    [events, dueCompleteIds],
  );

  const historyEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.status === "COMPLETED" ||
          event.status === "CANCELLED" ||
          dueCompleteIds.has(event.id),
      ),
    [events, dueCompleteIds],
  );

  const receiptByChildId = useMemo(() => {
    const map = new Map<string, ReceiptEntry>();
    for (const receipt of kioskReceipts) {
      if (receipt.childId && !map.has(receipt.childId)) {
        map.set(receipt.childId, receipt);
      }
    }
    return map;
  }, [kioskReceipts]);

  const paidChildIds = useMemo(() => new Set(Array.from(receiptByChildId.keys())), [receiptByChildId]);

  const filteredKioskChildren = useMemo(() => {
    const q = kioskSearch.trim().toLowerCase();
    return kioskChildren.filter((child) => {
      if (!q) return true;
      return (
        child.name.toLowerCase().includes(q) ||
        (child.grNumber ?? "").toLowerCase().includes(q) ||
        (child.className ?? "").toLowerCase().includes(q)
      );
    });
  }, [kioskChildren, kioskSearch]);

  const unpaidVisibleIds = useMemo(
    () => filteredKioskChildren.filter((child) => !paidChildIds.has(child.id)).map((child) => child.id),
    [filteredKioskChildren, paidChildIds],
  );

  const allVisibleCashSelected = useMemo(
    () => unpaidVisibleIds.length > 0 && unpaidVisibleIds.every((id) => cashSelectedIds.includes(id)),
    [unpaidVisibleIds, cashSelectedIds],
  );

  const selectedAccountIds = useMemo(() => selectedAccounts.map((account) => account.id), [selectedAccounts]);

  const visibleAccountResults = useMemo(
    () => accountResults.filter((account) => !selectedAccountIds.includes(account.id)),
    [accountResults, selectedAccountIds],
  );

  function resetEditor() {
    setEditingEvent(null);
    setForm(EMPTY_FORM);
    setSelectedAccounts([]);
    setAccountQuery("");
    setAccountResults([]);
  }

  function openCreateEditor() {
    resetEditor();
    setEditorOpen(true);
  }

  async function openEditEditor(event: PaymentEvent) {
    setEditingEvent(event);
    setForm({
      title: event.title,
      description: event.description ?? "",
      amount: String(event.amount),
      paymentAccountId: event.paymentAccountId ?? "",
      targetType: (["BOTH", "ALL_PARENTS", "ALL_GENERAL", "CLASS", "SELECTED", "KIOSK"] as const).includes(
        event.targetType as EventTargetType,
      )
        ? (event.targetType as EventTargetType)
        : "BOTH",
      targetClass: parseJsonArray(event.targetClass),
      dueDate: toDateInput(event.dueDate),
      kioskMode: Boolean(event.kioskMode),
    });
    setSelectedAccounts([]);
    setAccountQuery("");
    setAccountResults([]);
    setEditorOpen(true);

    const targetIds = parseJsonArray(event.targetAccountIds);
    if (targetIds.length === 0) return;

    try {
      const res = await fetch(
        `/api/operator/payment-events/accounts?ids=${encodeURIComponent(targetIds.join(","))}&limit=200`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelectedAccounts(data.accounts ?? []);
    } catch {
      toast.error("Failed to load selected accounts");
    }
  }

  function setTargetType(targetType: EventTargetType) {
    setForm((current) => ({
      ...current,
      targetType,
      kioskMode: targetType === "KIOSK" ? true : current.kioskMode,
      targetClass: targetType === "CLASS" ? current.targetClass : [],
    }));

    if (targetType !== "SELECTED") {
      setSelectedAccounts([]);
      setAccountQuery("");
      setAccountResults([]);
    }
  }

  function toggleClass(value: string) {
    setForm((current) => {
      const exists = current.targetClass.includes(value);
      return {
        ...current,
        targetClass: exists
          ? current.targetClass.filter((item) => item !== value)
          : [...current.targetClass, value],
      };
    });
  }

  function addSelectedAccount(account: RecipientAccount) {
    if (selectedAccounts.some((a) => a.id === account.id)) return;
    setSelectedAccounts((current) => [...current, account]);
    setAccountQuery("");
    setAccountResults([]);
  }

  function removeSelectedAccount(accountId: string) {
    setSelectedAccounts((current) => current.filter((account) => account.id !== accountId));
  }

  function buildEventPayload() {
    const amount = Number(form.amount);
    if (!form.title.trim()) {
      toast.error("Event title is required");
      return null;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return null;
    }
    if (form.targetType === "CLASS" && form.targetClass.length === 0) {
      toast.error("Select at least one class");
      return null;
    }
    if (form.targetType === "SELECTED" && selectedAccounts.length === 0) {
      toast.error("Select at least one account");
      return null;
    }

    return {
      title: form.title.trim(),
      description: form.description.trim() || null,
      amount,
      paymentAccountId: form.paymentAccountId || undefined,
      targetType: form.targetType,
      targetClass: form.targetType === "CLASS" ? form.targetClass : [],
      targetAccountIds: form.targetType === "SELECTED" ? selectedAccounts.map((account) => account.id) : [],
      dueDate: form.dueDate || undefined,
      kioskMode: form.targetType === "KIOSK" ? true : form.kioskMode,
    };
  }

  async function createEvent(activate: boolean) {
    const payload = buildEventPayload();
    if (!payload) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/operator/payment-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, activate }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create event");
      }

      toast.success(activate ? "Event created and activated" : "Draft saved");
      setEditorOpen(false);
      resetEditor();
      void fetchData(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateEvent() {
    if (!editingEvent) return;
    const payload = buildEventPayload();
    if (!payload) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/operator/payment-events/${editingEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update event");
      }

      toast.success("Event updated");
      setEditorOpen(false);
      resetEditor();
      void fetchData(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update event");
    } finally {
      setSubmitting(false);
    }
  }

  async function patchEvent(id: string, patch: Record<string, unknown>, successMessage: string) {
    try {
      const res = await fetch(`/api/operator/payment-events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Action failed");
      }
      toast.success(successMessage);
      void fetchData(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  }

  async function deleteEvent(id: string) {
    const confirmed = window.confirm("Delete this payment event?");
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/operator/payment-events/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Delete failed");
      }
      toast.success("Event deleted");
      void fetchData(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  }

  async function downloadReport(event: PaymentEvent) {
    try {
      const res = await fetch(`/api/operator/payment-events/${event.id}/report`, {
        method: "GET",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to generate CSV");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeTitle = event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      link.href = url;
      link.download = `${safeTitle || "payment-event"}-${event.id.slice(0, 6)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download CSV");
    }
  }

  async function openKioskMode(event: PaymentEvent) {
    setKioskEvent(event);
    setKioskSearch("");
    setKioskCollectionMode("KIOSK_TAP");
    setCashSelectedIds([]);
    setCashNotes("");
    setKioskLoading(true);

    try {
      const [eventRes, childrenRes] = await Promise.all([
        fetch(`/api/operator/payment-events/${event.id}`, { cache: "no-store" }),
        fetch("/api/operator/children?limit=500", { cache: "no-store" }),
      ]);

      if (!eventRes.ok || !childrenRes.ok) {
        throw new Error("Failed to load kiosk mode data");
      }

      const [eventData, childrenData] = await Promise.all([eventRes.json(), childrenRes.json()]);
      const children = (childrenData.results ?? []) as ChildInfo[];
      setKioskChildren(children.filter((child) => matchesTarget(child, event)));
      setKioskReceipts(eventData.receipts ?? []);
    } catch {
      toast.error("Failed to open kiosk mode");
      setKioskEvent(null);
    } finally {
      setKioskLoading(false);
    }
  }

  async function recordPayment(
    childId: string,
    paymentMode: "KIOSK_TAP" | "CASH",
    notes?: string,
    silent = false,
  ) {
    if (!kioskEvent) return null;

    const res = await fetch(`/api/operator/payment-events/${kioskEvent.id}/tap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId, paymentMode, notes: notes || undefined }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Payment failed" }));
      if (!silent) toast.error(data.error ?? "Payment failed");
      return null;
    }

    const data = await res.json();
    const receipt = data.receipt as ReceiptEntry;
    setKioskReceipts((current) => [receipt, ...current]);
    return receipt;
  }

  async function collectSingleChild(childId: string, paymentMode: "KIOSK_TAP" | "CASH") {
    setCollectingChildId(childId);
    try {
      const receipt = await recordPayment(
        childId,
        paymentMode,
        paymentMode === "CASH" ? cashNotes.trim() || undefined : undefined,
      );
      if (receipt) {
        toast.success(
          paymentMode === "KIOSK_TAP"
            ? "Tap payment collected"
            : "Cash payment recorded",
        );
        void fetchData(true);
      }
    } finally {
      setCollectingChildId(null);
    }
  }

  async function collectBulkCash() {
    if (cashSelectedIds.length === 0) {
      toast.error("Select at least one account for cash collection");
      return;
    }

    setBulkCollecting(true);
    let success = 0;
    let failed = 0;

    try {
      for (const childId of cashSelectedIds) {
        const receipt = await recordPayment(childId, "CASH", cashNotes.trim() || undefined, true);
        if (receipt) success += 1;
        else failed += 1;
      }

      if (success > 0) {
        toast.success(`${success} cash payment${success > 1 ? "s" : ""} recorded`);
      }
      if (failed > 0) {
        toast.error(`${failed} payment${failed > 1 ? "s" : ""} could not be recorded`);
      }
      setCashSelectedIds([]);
      setCashNotes("");
      void fetchData(true);
    } finally {
      setBulkCollecting(false);
    }
  }

  function toggleCashSelection(childId: string, checked: boolean) {
    setCashSelectedIds((current) => {
      if (checked) return current.includes(childId) ? current : [...current, childId];
      return current.filter((id) => id !== childId);
    });
  }

  function toggleSelectAllVisibleCash() {
    if (allVisibleCashSelected) {
      setCashSelectedIds((current) => current.filter((id) => !unpaidVisibleIds.includes(id)));
      return;
    }

    setCashSelectedIds((current) => {
      const merged = new Set([...current, ...unpaidVisibleIds]);
      return Array.from(merged);
    });
  }

  const targetOptions: Array<{
    value: EventTargetType;
    label: string;
    hint: string;
    icon: ReactNode;
  }> = [
    { value: "BOTH", label: "All", hint: "Parents + General", icon: <Users className="h-4 w-4" /> },
    { value: "ALL_PARENTS", label: "Parents", hint: "Only parent accounts", icon: <Users className="h-4 w-4" /> },
    { value: "ALL_GENERAL", label: "General", hint: "Only general accounts", icon: <Users className="h-4 w-4" /> },
    { value: "CLASS", label: "Class", hint: "Specific classes", icon: <Users className="h-4 w-4" /> },
    { value: "SELECTED", label: "Selected", hint: "Search and pick", icon: <Search className="h-4 w-4" /> },
    { value: "KIOSK", label: "Kiosk", hint: "Tap and collect", icon: <Smartphone className="h-4 w-4" /> },
  ];

  if (kioskEvent) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-50">
        <div className="border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:px-4 sm:py-3">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-2.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl shrink-0"
              onClick={() => {
                setKioskEvent(null);
                setKioskSearch("");
                setCashSelectedIds([]);
              }}
            >
              <X className="h-4 w-4" />
            </Button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">{kioskEvent.title}</p>
              <p className="text-[11px] text-slate-500">
                {formatMoney(kioskEvent.amount)} per account
                {kioskEvent.dueDate ? `  ·  Due ${new Date(kioskEvent.dueDate).toLocaleDateString()}` : ""}
              </p>
            </div>

            <Badge variant="outline" className="gap-1 border-slate-300 text-[10px] text-slate-700 shrink-0">
              <Smartphone className="h-3 w-3" />
              <span className="hidden sm:inline">Kiosk Collection</span>
              <span className="sm:hidden">Kiosk</span>
            </Badge>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Card className="border-slate-200/80 bg-white/90">
              <CardContent className="p-2.5 sm:p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Collected</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">{kioskReceipts.length}</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200/80 bg-white/90">
              <CardContent className="p-2.5 sm:p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Pending</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900 sm:text-xl">
                  {Math.max(kioskChildren.length - kioskReceipts.length, 0)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200/80 bg-white/90">
              <CardContent className="p-2.5 sm:p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">Total</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700 sm:text-xl">
                  {formatMoney(kioskReceipts.length * kioskEvent.amount)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 bg-white">
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={kioskCollectionMode === "KIOSK_TAP" ? "default" : "outline"}
                  className="rounded-xl"
                  onClick={() => setKioskCollectionMode("KIOSK_TAP")}
                >
                  <Fingerprint className="mr-1.5 h-4 w-4" />
                  Tap & Pay
                </Button>
                <Button
                  type="button"
                  variant={kioskCollectionMode === "CASH" ? "default" : "outline"}
                  className="rounded-xl"
                  onClick={() => setKioskCollectionMode("CASH")}
                >
                  <IndianRupee className="mr-1.5 h-4 w-4" />
                  Cash Collection
                </Button>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={kioskSearch}
                  onChange={(event) => setKioskSearch(event.target.value)}
                  placeholder="Search by student name, GR number, class"
                  className="rounded-xl border-slate-300 bg-white pl-9"
                />
              </div>

              {kioskCollectionMode === "CASH" && (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">
                      Bulk cash collection for remaining accounts
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 rounded-lg"
                      onClick={toggleSelectAllVisibleCash}
                      disabled={unpaidVisibleIds.length === 0}
                    >
                      {allVisibleCashSelected ? "Clear Visible" : "Select Visible"}
                    </Button>
                  </div>

                  <Textarea
                    placeholder="Optional notes for cash collection"
                    value={cashNotes}
                    onChange={(event) => setCashNotes(event.target.value)}
                    className="min-h-20 rounded-xl border-slate-300 bg-white"
                  />

                  <Button
                    type="button"
                    className="w-full rounded-xl"
                    onClick={() => void collectBulkCash()}
                    disabled={bulkCollecting || cashSelectedIds.length === 0}
                  >
                    {bulkCollecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Record Cash for {cashSelectedIds.length} Selected
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex-1 overflow-auto pb-2">
            {kioskLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              </div>
            ) : filteredKioskChildren.length === 0 ? (
              <Card className="border-dashed border-slate-300 bg-white">
                <CardContent className="py-12 text-center text-sm text-slate-500">
                  No accounts found for this payment event
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredKioskChildren.map((child) => {
                  const receipt = receiptByChildId.get(child.id);
                  const isPaid = Boolean(receipt);
                  const isSelected = cashSelectedIds.includes(child.id);

                  return (
                    <Card
                      key={child.id}
                      className={cn(
                        "border transition-all",
                        isPaid
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-slate-200 bg-white",
                      )}
                    >
                      <CardContent className="flex items-center gap-3 p-3">
                        {kioskCollectionMode === "CASH" && !isPaid ? (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => toggleCashSelection(child.id, Boolean(checked))}
                          />
                        ) : null}

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{child.name}</p>
                          <p className="truncate text-xs text-slate-500">
                            {child.grNumber ? `GR ${child.grNumber}` : ""}
                            {child.className ? `  ·  ${child.className}` : ""}
                            {child.section ? ` ${child.section}` : ""}
                          </p>
                        </div>

                        {isPaid ? (
                          <div className="text-right">
                            <div className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-medium text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              {receipt?.paymentMode === "CASH" ? "Cash" : "Tap"} Paid
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">{receipt?.receiptNumber}</p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {kioskCollectionMode === "KIOSK_TAP" ? (
                              <Button
                                type="button"
                                className="h-8 rounded-lg"
                                onClick={() => void collectSingleChild(child.id, "KIOSK_TAP")}
                                disabled={collectingChildId === child.id}
                              >
                                {collectingChildId === child.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <Fingerprint className="mr-1 h-3.5 w-3.5" />
                                    Tap & Pay
                                  </>
                                )}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 rounded-lg border-slate-300"
                                onClick={() => void collectSingleChild(child.id, "CASH")}
                                disabled={collectingChildId === child.id}
                              >
                                {collectingChildId === child.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <IndianRupee className="mr-1 h-3.5 w-3.5" />
                                    Mark Cash
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/80 px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-2xl space-y-4 sm:max-w-5xl sm:space-y-5">
        <div className="flex items-center gap-2.5">
          <Link href="/operator/topup">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-slate-700 hover:bg-white/70">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>

          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold text-slate-900 sm:text-base">Payment Events</p>
            <p className="text-[11px] text-slate-500">
              Create, collect & manage payments
            </p>
          </div>

          <Button onClick={openCreateEditor} className="h-9 gap-1.5 rounded-xl bg-slate-900 px-3.5 text-sm text-white hover:bg-slate-800 sm:px-4">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Event</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <StatsCard label="Active" value={String(activeEvents.length)} accent="bg-emerald-50 text-emerald-700" />
          <StatsCard label="Drafts" value={String(draftEvents.length)} accent="bg-amber-50 text-amber-700" />
          <StatsCard label="History" value={String(historyEvents.length)} accent="bg-slate-100 text-slate-700" />
          <StatsCard
            label="Collected"
            value={formatMoney(events.reduce((sum, event) => sum + event.amount * event.receiptCount, 0))}
            accent="bg-emerald-50 text-emerald-700"
          />
        </div>

        <Link href="/operator/payment-accounts">
          <Card className="border-slate-200/80 bg-white/90 shadow-sm backdrop-blur hover:shadow-md transition-shadow">
            <CardContent className="flex items-center gap-3 p-3 sm:p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <CreditCard className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Payment Accounts</p>
                <p className="text-[11px] text-slate-500">
                  {approvedAccounts.length} approved
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </CardContent>
          </Card>
        </Link>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : (
          <Tabs defaultValue="active" className="space-y-3">
            <TabsList className="w-full rounded-xl bg-white/90 p-1 shadow-sm backdrop-blur">
              <TabsTrigger value="active" className="flex-1 rounded-lg text-xs data-[state=active]:shadow-sm">Active ({activeEvents.length})</TabsTrigger>
              <TabsTrigger value="draft" className="flex-1 rounded-lg text-xs data-[state=active]:shadow-sm">Draft ({draftEvents.length})</TabsTrigger>
              <TabsTrigger value="history" className="flex-1 rounded-lg text-xs data-[state=active]:shadow-sm">History ({historyEvents.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-3">
              {activeEvents.length === 0 ? (
                <EmptyState icon={<Send className="h-7 w-7" />} title="No active payment events" />
              ) : (
                activeEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    dueComplete={dueCompleteIds.has(event.id)}
                    onOpenKiosk={openKioskMode}
                    onActivate={(id) => void patchEvent(id, { status: "ACTIVE" }, "Event activated")}
                    onComplete={(id) => void patchEvent(id, { status: "COMPLETED" }, "Event marked completed")}
                    onCancel={(id) => void patchEvent(id, { status: "CANCELLED" }, "Event cancelled")}
                    onEdit={openEditEditor}
                    onDelete={deleteEvent}
                    onDownload={downloadReport}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="draft" className="space-y-3">
              {draftEvents.length === 0 ? (
                <EmptyState icon={<Clock3 className="h-7 w-7" />} title="No draft payment events" />
              ) : (
                draftEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    dueComplete={dueCompleteIds.has(event.id)}
                    onOpenKiosk={openKioskMode}
                    onActivate={(id) => void patchEvent(id, { status: "ACTIVE" }, "Event activated")}
                    onComplete={(id) => void patchEvent(id, { status: "COMPLETED" }, "Event marked completed")}
                    onCancel={(id) => void patchEvent(id, { status: "CANCELLED" }, "Event cancelled")}
                    onEdit={openEditEditor}
                    onDelete={deleteEvent}
                    onDownload={downloadReport}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-3">
              {historyEvents.length === 0 ? (
                <EmptyState icon={<Receipt className="h-7 w-7" />} title="No completed history yet" />
              ) : (
                historyEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    dueComplete={dueCompleteIds.has(event.id)}
                    onOpenKiosk={openKioskMode}
                    onActivate={(id) => void patchEvent(id, { status: "ACTIVE" }, "Event activated")}
                    onComplete={(id) => void patchEvent(id, { status: "COMPLETED" }, "Event marked completed")}
                    onCancel={(id) => void patchEvent(id, { status: "CANCELLED" }, "Event cancelled")}
                    onEdit={openEditEditor}
                    onDelete={deleteEvent}
                    onDownload={downloadReport}
                  />
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) resetEditor();
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl border-slate-200 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">{editingEvent ? "Edit Payment Event" : "Create Payment Event"}</DialogTitle>
            <DialogDescription className="text-[11px]">
              Configure amount, due date, target filters, and kiosk collection.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Event Title</Label>
                <Input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Annual Sports Fee"
                  className="rounded-xl border-slate-300"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Amount</Label>
                <div className="relative">
                  <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="number"
                    value={form.amount}
                    onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                    placeholder="0.00"
                    className="rounded-xl border-slate-300 pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))}
                  className="rounded-xl border-slate-300"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Optional event details"
                  className="min-h-24 rounded-xl border-slate-300"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Payment Account (optional)</Label>
              <select
                value={form.paymentAccountId}
                onChange={(event) => setForm((current) => ({ ...current, paymentAccountId: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
              >
                <option value="">None (collect manually)</option>
                {approvedAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label} ({account.method === "UPI" ? "UPI" : "Bank"})
                  </option>
                ))}
              </select>
              {approvedAccounts.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No approved payment account available. Add one in Payment Accounts.
                </p>
              ) : null}
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Event Target Filters</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {targetOptions.map((option) => {
                  const selected = form.targetType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTargetType(option.value)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition",
                        selected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-500",
                      )}
                    >
                      <div className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold">
                        {option.icon}
                        {option.label}
                      </div>
                      <p
                        className={cn(
                          "text-xs",
                          selected ? "text-slate-200" : "text-slate-500",
                        )}
                      >
                        {option.hint}
                      </p>
                    </button>
                  );
                })}
              </div>

              {form.targetType === "CLASS" ? (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Select Classes
                  </p>
                  {classes.length === 0 ? (
                    <p className="text-sm text-slate-500">No class records found.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {classes.map((className) => {
                        const selected = form.targetClass.includes(className);
                        return (
                          <button
                            key={className}
                            type="button"
                            onClick={() => toggleClass(className)}
                            className={cn(
                              "rounded-full border px-3 py-1 text-sm",
                              selected
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-300 bg-white text-slate-700",
                            )}
                          >
                            {className}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              {form.targetType === "SELECTED" ? (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <Label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Search and Add Accounts
                  </Label>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={accountQuery}
                      onChange={(event) => setAccountQuery(event.target.value)}
                      placeholder="Search by name, email, or phone"
                      className="rounded-xl border-slate-300 bg-white pl-9"
                    />
                  </div>

                  {selectedAccounts.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedAccounts.map((account) => (
                        <span
                          key={account.id}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-xs text-white"
                        >
                          {account.name}
                          <button type="button" onClick={() => removeSelectedAccount(account.id)}>
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {searchingAccounts ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching accounts...
                    </div>
                  ) : visibleAccountResults.length > 0 ? (
                    <div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-slate-200 bg-white p-1">
                      {visibleAccountResults.map((account) => (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => addSelectedAccount(account)}
                          className="w-full rounded-md px-2 py-2 text-left hover:bg-slate-100"
                        >
                          <p className="text-sm font-medium text-slate-800">{account.name}</p>
                          <p className="text-xs text-slate-500">
                            {account.email}  ·  {account.role}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : accountQuery.trim().length >= 2 ? (
                    <p className="text-sm text-slate-500">No matching accounts found.</p>
                  ) : (
                    <p className="text-sm text-slate-500">Type at least 2 characters to search accounts.</p>
                  )}
                </div>
              ) : null}
            </div>

            {form.targetType !== "KIOSK" ? (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">Also enable kiosk tap mode</p>
                  <p className="text-xs text-slate-500">Allow operator device collection in parallel</p>
                </div>
                <Button
                  type="button"
                  variant={form.kioskMode ? "default" : "outline"}
                  className="rounded-lg"
                  onClick={() => setForm((current) => ({ ...current, kioskMode: !current.kioskMode }))}
                >
                  {form.kioskMode ? "Enabled" : "Enable"}
                </Button>
              </div>
            ) : null}

            <Separator />

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>

              {editingEvent ? (
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={submitting}
                  onClick={() => void updateEvent()}
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    disabled={submitting}
                    onClick={() => void createEvent(false)}
                  >
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Draft
                  </Button>
                  <Button
                    type="button"
                    className="rounded-xl"
                    disabled={submitting}
                    onClick={() => void createEvent(true)}
                  >
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create & Activate
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatsCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
      <CardContent className="p-3 sm:p-4">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">{label}</p>
        <p className={`mt-0.5 text-lg font-bold tabular-nums sm:text-xl ${accent ? accent.split(" ").filter((c) => c.startsWith("text-")).join(" ") : "text-slate-900"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <Card className="border-dashed border-slate-300/80 bg-white/60">
      <CardContent className="py-10 text-center sm:py-12">
        <div className="mx-auto mb-2.5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          {icon}
        </div>
        <p className="text-xs font-medium text-slate-500">{title}</p>
      </CardContent>
    </Card>
  );
}

function EventCard({
  event,
  dueComplete,
  onOpenKiosk,
  onActivate,
  onComplete,
  onCancel,
  onEdit,
  onDelete,
  onDownload,
}: {
  event: PaymentEvent;
  dueComplete: boolean;
  onOpenKiosk: (event: PaymentEvent) => void;
  onActivate: (id: string) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  onEdit: (event: PaymentEvent) => void;
  onDelete: (id: string) => void;
  onDownload: (event: PaymentEvent) => void;
}) {
  const showDownload = dueComplete || event.status === "COMPLETED" || event.status === "CANCELLED";

  return (
    <Card className="border-slate-200/80 bg-white/90 shadow-sm backdrop-blur overflow-hidden">
      <CardContent className="p-3.5 sm:p-4">
        {/* Top: Title + Amount */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-bold text-slate-900 leading-tight">{event.title}</p>
              <Badge variant={statusVariant(event.status)} className="text-[9px] px-1.5 py-0">
                {event.status}
              </Badge>
              {dueComplete ? (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] px-1.5 py-0 text-amber-700">
                  Overdue
                </Badge>
              ) : null}
            </div>
            {event.description ? (
              <p className="line-clamp-1 text-[11px] text-slate-500">{event.description}</p>
            ) : null}
          </div>
          <p className="text-base font-bold tabular-nums text-slate-900 shrink-0">{formatMoney(event.amount)}</p>
        </div>

        {/* Meta row */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Receipt className="h-3 w-3" />
            {event.receiptCount} collected
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            {targetSummary(event)}
          </span>
          {event.dueDate ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              Due {new Date(event.dueDate).toLocaleDateString()}
            </span>
          ) : null}
          {event.kioskMode ? (
            <span className="inline-flex items-center gap-1 text-slate-700">
              <Smartphone className="h-3 w-3" />
              Kiosk
            </span>
          ) : null}
          {event.paymentAccountLabel ? (
            <span className="inline-flex items-center gap-1">
              {event.paymentAccountMethod === "UPI" ? (
                <CreditCard className="h-3 w-3" />
              ) : (
                <Landmark className="h-3 w-3" />
              )}
              {event.paymentAccountLabel}
            </span>
          ) : null}
        </div>

        {/* Action buttons */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {event.status === "DRAFT" ? (
            <Button size="sm" className="h-7 rounded-lg px-2.5 text-[11px]" onClick={() => onActivate(event.id)}>
              <Send className="mr-1 h-3 w-3" />
              Activate
            </Button>
          ) : null}

          {event.status === "ACTIVE" && event.kioskMode ? (
            <Button size="sm" variant="outline" className="h-7 rounded-lg px-2.5 text-[11px] border-slate-300" onClick={() => onOpenKiosk(event)}>
              <Fingerprint className="mr-1 h-3 w-3" />
              Kiosk
            </Button>
          ) : null}

          {(event.status === "DRAFT" || event.status === "ACTIVE") ? (
            <Button size="sm" variant="outline" className="h-7 rounded-lg px-2.5 text-[11px] border-slate-300" onClick={() => onEdit(event)}>
              <Pencil className="mr-1 h-3 w-3" />
              Edit
            </Button>
          ) : null}

          {event.status === "ACTIVE" ? (
            <Button size="sm" variant="outline" className="h-7 rounded-lg px-2.5 text-[11px] border-slate-300" onClick={() => onComplete(event.id)}>
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Complete
            </Button>
          ) : null}

          {event.status === "ACTIVE" ? (
            <Button size="sm" variant="outline" className="h-7 rounded-lg px-2.5 text-[11px] border-slate-300" onClick={() => onCancel(event.id)}>
              Cancel
            </Button>
          ) : null}

          {event.receiptCount === 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 rounded-lg px-2.5 text-[11px] border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => onDelete(event.id)}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Delete
            </Button>
          ) : null}

          {showDownload ? (
            <Button size="sm" variant="outline" className="h-7 rounded-lg px-2.5 text-[11px] border-slate-300" onClick={() => onDownload(event)}>
              <Download className="mr-1 h-3 w-3" />
              CSV
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
