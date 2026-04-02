"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2, Plus, IndianRupee, CreditCard, Landmark, CheckCircle2,
  ArrowLeft, Fingerprint, Users, Send, Receipt, Clock, CalendarDays,
  Smartphone, ChevronRight, X, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSSE } from "@/lib/events";

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
  dueDate: string | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  kioskMode: boolean;
  receiptCount: number;
  createdAt: string;
  paymentAccountId: string | null;
  paymentAccountLabel: string | null;
  paymentAccountMethod: string | null;
};

type ChildInfo = {
  id: string;
  name: string;
  grNumber: string | null;
  className: string | null;
};

type ReceiptEntry = {
  id: string;
  childId: string | null;
  paymentMode: string;
  amount: number;
  receiptNumber: string;
  paidAt: string;
};

function eventStatusColor(status: PaymentEvent["status"]) {
  if (status === "ACTIVE") return "default" as const;
  if (status === "COMPLETED") return "secondary" as const;
  if (status === "CANCELLED") return "destructive" as const;
  return "outline" as const;
}

export default function OperatorPaymentEventsPage() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [approvedAccounts, setApprovedAccounts] = useState<PaymentAccount[]>([]);

  // Create event dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    amount: "",
    paymentAccountId: "",
    targetType: "BOTH",
    dueDate: "",
    kioskMode: false,
    activate: false,
  });

  // Kiosk tap mode
  const [kioskEvent, setKioskEvent] = useState<PaymentEvent | null>(null);
  const [kioskSearch, setKioskSearch] = useState("");
  const [kioskChildren, setKioskChildren] = useState<ChildInfo[]>([]);
  const [kioskReceipts, setKioskReceipts] = useState<ReceiptEntry[]>([]);
  const [kioskLoading, setKioskLoading] = useState(false);
  const [tapping, setTapping] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [eventsRes, accountsRes] = await Promise.all([
        fetch("/api/operator/payment-events", { cache: "no-store" }),
        fetch("/api/operator/payment-accounts", { cache: "no-store" }),
      ]);
      if (!eventsRes.ok || !accountsRes.ok) throw new Error();
      const [eventsData, accountsData] = await Promise.all([eventsRes.json(), accountsRes.json()]);
      setEvents(eventsData.events ?? []);
      setApprovedAccounts((accountsData.accounts ?? []).filter((a: PaymentAccount) => a.status === "APPROVED"));
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Real-time updates via SSE
  useSSE("payment-event", () => void fetchData());

  // Load kiosk event details (children + receipts)
  const openKioskMode = useCallback(async (event: PaymentEvent) => {
    setKioskEvent(event);
    setKioskLoading(true);
    try {
      const [eventRes, childrenRes] = await Promise.all([
        fetch(`/api/operator/payment-events/${event.id}`, { cache: "no-store" }),
        fetch(`/api/operator/children?limit=200`, { cache: "no-store" }),
      ]);
      if (eventRes.ok) {
        const data = await eventRes.json();
        setKioskReceipts(data.receipts ?? []);
      }
      if (childrenRes.ok) {
        const d = await childrenRes.json();
        setKioskChildren(d.results ?? []);
      }
    } finally {
      setKioskLoading(false);
    }
  }, []);

  async function handleTap(childId: string) {
    if (!kioskEvent || tapping) return;
    setTapping(childId);
    try {
      const res = await fetch(`/api/operator/payment-events/${kioskEvent.id}/tap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed");
      }
      const data = await res.json();
      setKioskReceipts((prev) => [data.receipt, ...prev]);
      toast.success("Payment recorded! Receipt sent to parent.");
      void fetchData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to record payment");
    } finally {
      setTapping(null);
    }
  }

  async function handleCreate(activate: boolean) {
    if (!form.title || !form.amount) return toast.error("Title and amount are required");
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) return toast.error("Enter a valid amount");

    setSaving(true);
    try {
      const res = await fetch("/api/operator/payment-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          activate,
          amount: amt,
          paymentAccountId: form.paymentAccountId || undefined,
          dueDate: form.dueDate || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed");
      }
      toast.success(activate ? "Event created and activated!" : "Event saved as draft");
      setCreateOpen(false);
      setForm({ title: "", description: "", amount: "", paymentAccountId: "", targetType: "BOTH", dueDate: "", kioskMode: false, activate: false });
      void fetchData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create event");
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(id: string) {
    try {
      await fetch(`/api/operator/payment-events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      toast.success("Event activated");
      void fetchData();
    } catch {
      toast.error("Failed to activate event");
    }
  }

  const paidChildIds = new Set(kioskReceipts.map((r) => r.childId).filter(Boolean));
  const filteredChildren = kioskChildren.filter((c) => {
    const q = kioskSearch.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.grNumber ?? "").toLowerCase().includes(q);
  });

  const activeEvents = events.filter((e) => e.status === "ACTIVE");
  const draftEvents = events.filter((e) => e.status === "DRAFT");
  const pastEvents = events.filter((e) => e.status === "COMPLETED" || e.status === "CANCELLED");

  // ─── Kiosk Mode Overlay ─────────────────────────────────
  if (kioskEvent) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-4 py-3 bg-background/80 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => { setKioskEvent(null); setKioskSearch(""); }}
            className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold truncate">{kioskEvent.title}</h2>
            <p className="text-xs text-muted-foreground">
              ₹{kioskEvent.amount.toFixed(2)} · Tap to collect
            </p>
          </div>
          <Badge variant="default" className="gap-1">
            <Smartphone className="h-3 w-3" />
            Kiosk
          </Badge>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b text-sm">
          <span className="font-medium">{kioskReceipts.length} collected</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold text-primary">₹{(kioskReceipts.length * kioskEvent.amount).toFixed(2)} total</span>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search students..."
              value={kioskSearch}
              onChange={(e) => setKioskSearch(e.target.value)}
              className="pl-9 rounded-xl"
              autoFocus
            />
          </div>
        </div>

        {/* Students list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {kioskLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredChildren.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">No students found</p>
          ) : (
            filteredChildren.map((child) => {
              const paid = paidChildIds.has(child.id);
              return (
                <div
                  key={child.id}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all",
                    paid
                      ? "border-green-200 bg-green-50/70 dark:border-green-800/40 dark:bg-green-950/20"
                      : "border-border bg-card",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{child.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {child.grNumber ? `GR: ${child.grNumber}` : ""}
                      {child.className ? ` · ${child.className}` : ""}
                    </p>
                  </div>
                  {paid ? (
                    <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="text-xs font-semibold">Paid</span>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleTap(child.id)}
                      disabled={tapping === child.id}
                      className="rounded-xl min-w-24"
                    >
                      {tapping === child.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <IndianRupee className="h-3.5 w-3.5 mr-1" />
                          Collect ₹{kioskEvent.amount.toFixed(0)}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ─── Main Page ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-4">
      <div className="mx-auto max-w-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/operator/topup">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight">Payment Events</h1>
            <p className="text-sm text-muted-foreground">Manage fee collections</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm" className="rounded-xl gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Event
          </Button>
        </div>

        {/* Payment Accounts CTA */}
        <Link href="/operator/payment-accounts">
          <Card className="border-border/60 bg-gradient-to-r from-violet-50/80 to-background dark:from-violet-950/20 hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                <CreditCard className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Payment Accounts</p>
                <p className="text-xs text-muted-foreground">
                  {approvedAccounts.length} approved · Manage UPI & bank details
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="active" className="space-y-4">
            <TabsList className="w-full rounded-xl">
              <TabsTrigger value="active" className="flex-1 rounded-lg">
                Active {activeEvents.length > 0 && <span className="ml-1.5 text-xs">({activeEvents.length})</span>}
              </TabsTrigger>
              <TabsTrigger value="draft" className="flex-1 rounded-lg">
                Drafts {draftEvents.length > 0 && <span className="ml-1.5 text-xs">({draftEvents.length})</span>}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1 rounded-lg">History</TabsTrigger>
            </TabsList>

            {/* Active Events */}
            <TabsContent value="active" className="space-y-3 mt-0">
              {activeEvents.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <Send className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium">No active events</p>
                    <p className="text-xs text-muted-foreground mt-1">Create and activate an event to start collecting</p>
                  </CardContent>
                </Card>
              ) : (
                activeEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onKioskOpen={openKioskMode}
                  />
                ))
              )}
            </TabsContent>

            {/* Draft Events */}
            <TabsContent value="draft" className="space-y-3 mt-0">
              {draftEvents.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <Clock className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium">No drafts</p>
                  </CardContent>
                </Card>
              ) : (
                draftEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onActivate={handleActivate}
                    onKioskOpen={openKioskMode}
                  />
                ))
              )}
            </TabsContent>

            {/* History */}
            <TabsContent value="history" className="space-y-3 mt-0">
              {pastEvents.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <Receipt className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium">No history yet</p>
                  </CardContent>
                </Card>
              ) : (
                pastEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Create Event Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Payment Event</DialogTitle>
            <DialogDescription>Set up a fee collection for an event.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Event Title</Label>
              <Input
                placeholder="e.g. Math Olympiad Fee"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                placeholder="Additional details"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="pl-9 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Payment Account <span className="text-muted-foreground">(optional)</span></Label>
              <select
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.paymentAccountId}
                onChange={(e) => setForm((f) => ({ ...f, paymentAccountId: e.target.value }))}
              >
                <option value="">None (Kiosk only)</option>
                {approvedAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.label} ({a.method === "UPI" ? "UPI" : "Bank"})</option>
                ))}
              </select>
              {approvedAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No approved accounts yet.{" "}
                  <Link href="/operator/payment-accounts" className="underline">Add one →</Link>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Send To</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "BOTH", label: "All", icon: <Users className="h-4 w-4" /> },
                  { value: "ALL_PARENTS", label: "Parents", icon: <Users className="h-4 w-4" /> },
                  { value: "KIOSK", label: "Kiosk only", icon: <Smartphone className="h-4 w-4" /> },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, targetType: opt.value, kioskMode: opt.value === "KIOSK" }))}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-xs font-medium transition-all",
                      form.targetType === opt.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {form.targetType !== "KIOSK" && (
              <div className="flex items-center gap-3 rounded-xl border p-3">
                <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Also enable kiosk tap mode</p>
                  <p className="text-xs text-muted-foreground">Allow on-device tap collection too</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, kioskMode: !f.kioskMode }))}
                  className={cn(
                    "relative h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors",
                    form.kioskMode ? "border-primary bg-primary" : "border-input bg-muted",
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                    form.kioskMode ? "translate-x-5" : "translate-x-0.5",
                  )} />
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Due Date <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => void handleCreate(false)}
                disabled={saving}
                className="rounded-xl"
              >
                Save as Draft
              </Button>
              <Button
                onClick={() => void handleCreate(true)}
                disabled={saving}
                className="rounded-xl"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create & Activate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EventCard({
  event,
  onActivate,
  onKioskOpen,
}: {
  event: PaymentEvent;
  onActivate?: (id: string) => void;
  onKioskOpen?: (event: PaymentEvent) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-semibold text-sm truncate">{event.title}</p>
              <Badge variant={eventStatusColor(event.status)} className="text-[10px] py-0 px-1.5 shrink-0">
                {event.status}
              </Badge>
            </div>
            {event.description && (
              <p className="text-xs text-muted-foreground line-clamp-1">{event.description}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold text-primary">₹{event.amount.toFixed(0)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Receipt className="h-3 w-3" />
            {event.receiptCount} collected
          </span>
          {event.dueDate && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              Due {new Date(event.dueDate).toLocaleDateString()}
            </span>
          )}
          {event.kioskMode && (
            <span className="flex items-center gap-1 text-primary">
              <Smartphone className="h-3 w-3" />
              Kiosk mode
            </span>
          )}
          {event.paymentAccountLabel && (
            <span className="flex items-center gap-1">
              {event.paymentAccountMethod === "UPI" ? <CreditCard className="h-3 w-3" /> : <Landmark className="h-3 w-3" />}
              {event.paymentAccountLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {event.status === "DRAFT" && onActivate && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onActivate(event.id)}
              className="rounded-lg h-8 gap-1"
            >
              <Send className="h-3 w-3" />
              Activate
            </Button>
          )}
          {event.status === "ACTIVE" && event.kioskMode && onKioskOpen && (
            <Button
              size="sm"
              onClick={() => onKioskOpen(event)}
              className="rounded-lg h-8 gap-1"
            >
              <Fingerprint className="h-3.5 w-3.5" />
              Open Kiosk Mode
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
