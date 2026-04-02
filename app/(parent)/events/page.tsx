"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, IndianRupee, CreditCard, Landmark, CalendarDays,
  Receipt, CheckCircle2, Clock, AlertCircle, Copy,
} from "lucide-react";
import { useSSE } from "@/lib/events";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ChildInfo = {
  id: string;
  name: string;
  grNumber: string | null;
  class: string | null;
  paid: boolean;
  receipt: ReceiptEntry | null;
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
  createdAt: string;
  paymentAccountId: string | null;
  paymentAccountLabel: string | null;
  paymentAccountMethod: string | null;
  paymentAccountUpiId: string | null;
  paymentAccountHolderName: string | null;
  paymentAccountNumber: string | null;
  paymentAccountIfsc: string | null;
  paymentAccountBankName: string | null;
  children: ChildInfo[];
};

type ReceiptEntry = {
  id: string;
  eventId: string;
  childId: string | null;
  paymentMode: string;
  amount: number;
  receiptNumber: string;
  notes: string | null;
  paidAt: string;
};

function isOverdue(event: PaymentEvent) {
  if (!event.dueDate) return false;
  return new Date(event.dueDate) < new Date();
}

function allPaid(event: PaymentEvent) {
  return event.children.every((c) => c.paid);
}

export default function ParentEventsPage() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [receipts, setReceipts] = useState<ReceiptEntry[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<PaymentEvent | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/parent/payment-events", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events ?? []);
      setReceipts(data.receipts ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  useSSE("payment-event", fetchEvents);

  const activeEvents = events.filter((e) => e.status === "ACTIVE");
  const pastEvents = events.filter((e) => e.status !== "ACTIVE");

  const pendingCount = activeEvents.filter((e) => !allPaid(e)).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="mx-auto max-w-xl px-4 pt-6 pb-24 space-y-5">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Events & Payments</h1>
            {pendingCount > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px] font-bold">
                {pendingCount}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">School fee collection events</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="active" className="space-y-4">
            <TabsList className="w-full rounded-xl">
              <TabsTrigger value="active" className="flex-1 rounded-lg">
                Pending
                {pendingCount > 0 && <span className="ml-1.5 text-xs">({pendingCount})</span>}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1 rounded-lg">History</TabsTrigger>
            </TabsList>

            {/* Pending Events */}
            <TabsContent value="active" className="space-y-3 mt-0">
              {activeEvents.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-16 text-center">
                    <CheckCircle2 className="mx-auto h-10 w-10 text-green-400/50 mb-3" />
                    <p className="text-sm font-medium">All clear!</p>
                    <p className="text-xs text-muted-foreground mt-1">No pending payment events</p>
                  </CardContent>
                </Card>
              ) : (
                activeEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onOpen={() => setSelectedEvent(event)}
                  />
                ))
              )}
            </TabsContent>

            {/* History */}
            <TabsContent value="history" className="space-y-3 mt-0">
              {pastEvents.length === 0 && receipts.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-16 text-center">
                    <Receipt className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium">No history yet</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Past events */}
                  {pastEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onOpen={() => setSelectedEvent(event)}
                    />
                  ))}

                  {/* Receipt list */}
                  {receipts.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Receipts</p>
                      {receipts.map((r) => (
                        <ReceiptCard key={r.id} receipt={r} events={events} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Event Detail Dialog */}
      {selectedEvent && (
        <EventDetailDialog
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}

function EventCard({
  event,
  onOpen,
}: {
  event: PaymentEvent;
  onOpen: () => void;
}) {
  const overdue = isOverdue(event);
  const paid = allPaid(event);
  const pendingChildren = event.children.filter((c) => !c.paid);
  const paidChildren = event.children.filter((c) => c.paid);

  return (
    <button type="button" onClick={onOpen} className="w-full text-left">
      <Card className={cn(
        "overflow-hidden transition-all hover:shadow-md",
        overdue && !paid ? "border-destructive/50" : "",
        paid ? "border-green-200 dark:border-green-800/40" : "",
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <p className="font-semibold text-sm">{event.title}</p>
                {paid && (
                  <Badge variant="outline" className="text-green-600 border-green-300 dark:text-green-400 dark:border-green-800 text-[10px] py-0">
                    <CheckCircle2 className="h-3 w-3 mr-0.5" /> Paid
                  </Badge>
                )}
                {overdue && !paid && (
                  <Badge variant="destructive" className="text-[10px] py-0">
                    <AlertCircle className="h-3 w-3 mr-0.5" /> Overdue
                  </Badge>
                )}
              </div>
              {event.description && (
                <p className="text-xs text-muted-foreground line-clamp-1">{event.description}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className={cn("text-xl font-bold", paid ? "text-green-600 dark:text-green-400" : "text-primary")}>
                ₹{event.amount.toFixed(0)}
              </p>
              {event.children.length > 0 && (
                <p className="text-[10px] text-muted-foreground">per child</p>
              )}
            </div>
          </div>

          {/* Children status */}
          {event.children.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {event.children.map((c) => (
                <span
                  key={c.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    c.paid
                      ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {c.paid && <CheckCircle2 className="h-3 w-3" />}
                  {c.name}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {event.dueDate && (
              <span className={cn("flex items-center gap-1", overdue && !paid ? "text-destructive" : "")}>
                <CalendarDays className="h-3 w-3" />
                Due {new Date(event.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            )}
            {event.paymentAccountLabel && (
              <span className="flex items-center gap-1">
                {event.paymentAccountMethod === "UPI" ? <CreditCard className="h-3 w-3" /> : <Landmark className="h-3 w-3" />}
                {event.paymentAccountLabel}
              </span>
            )}
            {event.kioskMode && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Tap at school
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function ReceiptCard({ receipt, events }: { receipt: ReceiptEntry; events: PaymentEvent[] }) {
  const event = events.find((e) => e.id === receipt.eventId);
  return (
    <Card className="bg-card/60">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-100 dark:bg-green-950/40">
          <Receipt className="h-4.5 w-4.5 text-green-600 dark:text-green-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{event?.title ?? "Payment"}</p>
          <p className="text-xs text-muted-foreground">{receipt.receiptNumber}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-green-600 dark:text-green-400">₹{receipt.amount.toFixed(0)}</p>
          <p className="text-[10px] text-muted-foreground">
            {new Date(receipt.paidAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function EventDetailDialog({ event, onClose }: { event: PaymentEvent; onClose: () => void }) {
  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Copied!"));
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {event.description && (
            <p className="text-sm text-muted-foreground">{event.description}</p>
          )}

          {/* Amount & Due */}
          <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">Amount</p>
              <p className="text-2xl font-bold flex items-center gap-1">
                <IndianRupee className="h-5 w-5" />
                {event.amount.toFixed(2)}
              </p>
            </div>
            {event.dueDate && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Due date</p>
                <p className="text-sm font-semibold">{new Date(event.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
              </div>
            )}
          </div>

          {/* Payment Details */}
          {event.paymentAccountId && (
            <div className="rounded-xl border p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pay To</p>
              <div className="flex items-center gap-2">
                {event.paymentAccountMethod === "UPI"
                  ? <CreditCard className="h-5 w-5 text-violet-500" />
                  : <Landmark className="h-5 w-5 text-blue-500" />}
                <p className="font-semibold text-sm">{event.paymentAccountLabel}</p>
              </div>
              {event.paymentAccountMethod === "UPI" && event.paymentAccountUpiId && (
                <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-sm font-mono">{event.paymentAccountUpiId}</span>
                  <button type="button" onClick={() => copyText(event.paymentAccountUpiId!)} className="text-muted-foreground hover:text-foreground">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {event.paymentAccountMethod === "BANK_ACCOUNT" && (
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account Holder</span>
                    <span className="font-medium">{event.paymentAccountHolderName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Account No.</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-medium">{event.paymentAccountNumber}</span>
                      {event.paymentAccountNumber && (
                        <button type="button" onClick={() => copyText(event.paymentAccountNumber!)} className="text-muted-foreground hover:text-foreground">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IFSC</span>
                    <span className="font-mono font-medium">{event.paymentAccountIfsc}</span>
                  </div>
                  {event.paymentAccountBankName && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bank</span>
                      <span className="font-medium">{event.paymentAccountBankName}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Kiosk info */}
          {event.kioskMode && (
            <div className="rounded-xl border border-dashed p-3 text-sm text-center text-muted-foreground">
              This event is collected at school via kiosk tap. Visit the school office to pay.
            </div>
          )}

          {/* Children status */}
          {event.children.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Children</p>
              {event.children.map((c) => (
                <div key={c.id} className={cn(
                  "flex items-center justify-between rounded-xl px-3 py-2.5 border",
                  c.paid ? "bg-green-50/70 border-green-200 dark:bg-green-950/20 dark:border-green-800/40" : "bg-card border-border",
                )}>
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    {c.grNumber && <p className="text-xs text-muted-foreground">GR: {c.grNumber}</p>}
                  </div>
                  {c.paid ? (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Paid
                      </span>
                      {c.receipt && (
                        <span className="text-[10px] text-muted-foreground">{c.receipt.receiptNumber}</span>
                      )}
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-xs">Pending</Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          <Button variant="outline" className="w-full rounded-xl" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
