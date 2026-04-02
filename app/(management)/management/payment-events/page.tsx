"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2, CheckCircle2, XCircle, Clock, CreditCard, Landmark,
  Receipt, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PaymentAccount = {
  id: string;
  label: string;
  method: "UPI" | "BANK_ACCOUNT";
  upiId: string | null;
  accountHolderName: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  bankName: string | null;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  approvedAt: string | null;
  createdAt: string;
  operatorName: string | null;
  operatorEmail: string | null;
};

type PaymentEvent = {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  targetType: string;
  targetClass: string | null;
  dueDate: string | null;
  status: string;
  kioskMode: boolean;
  createdAt: string;
  paymentAccountLabel: string | null;
  paymentAccountMethod: string | null;
  receiptCount: number;
  operatorName: string | null;
  operatorEmail: string | null;
};

function accountStatusVariant(status: PaymentAccount["status"]) {
  if (status === "APPROVED") return "default" as const;
  if (status === "REJECTED") return "destructive" as const;
  return "secondary" as const;
}

export default function ManagementPaymentEventsPage() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [events, setEvents] = useState<PaymentEvent[]>([]);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, eventsRes] = await Promise.all([
        fetch("/api/management/payment-accounts", { cache: "no-store" }),
        fetch("/api/management/payment-events", { cache: "no-store" }),
      ]);
      if (!accountsRes.ok || !eventsRes.ok) throw new Error();
      const [accountsData, eventsData] = await Promise.all([accountsRes.json(), eventsRes.json()]);
      setAccounts(accountsData.accounts ?? []);
      setEvents(eventsData.events ?? []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleApprove(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/management/payment-accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Account approved");
      void fetchData();
    } catch {
      toast.error("Failed to approve account");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!rejectingId || !rejectionReason.trim()) return toast.error("Reason required");
    setSaving(true);
    try {
      const res = await fetch(`/api/management/payment-accounts/${rejectingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: rejectionReason.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Account rejected");
      setRejectDialogOpen(false);
      setRejectingId(null);
      setRejectionReason("");
      void fetchData();
    } catch {
      toast.error("Failed to reject account");
    } finally {
      setSaving(false);
    }
  }

  const pendingAccounts = accounts.filter((a) => a.status === "PENDING_APPROVAL");
  const reviewedAccounts = accounts.filter((a) => a.status !== "PENDING_APPROVAL");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Events</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Review operator payment accounts and monitor events</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchData()} className="gap-1.5 rounded-xl">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Pending approvals alert */}
      {pendingAccounts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-800/40 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              {pendingAccounts.length} payment account{pendingAccounts.length > 1 ? "s" : ""} awaiting your approval
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="accounts" className="space-y-4">
          <TabsList className="rounded-xl">
            <TabsTrigger value="accounts" className="rounded-lg gap-1.5">
              Payment Accounts
              {pendingAccounts.length > 0 && (
                <Badge variant="destructive" className="h-4.5 min-w-4.5 px-1 text-[9px]">{pendingAccounts.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="events" className="rounded-lg">Events</TabsTrigger>
          </TabsList>

          {/* Payment Accounts */}
          <TabsContent value="accounts" className="space-y-4 mt-0">
            {pendingAccounts.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pending Review</p>
                {pendingAccounts.map((account) => (
                  <Card key={account.id} className="border-amber-200/60 dark:border-amber-800/30">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                            account.method === "UPI" ? "bg-violet-100 dark:bg-violet-950/40" : "bg-blue-100 dark:bg-blue-950/40",
                          )}>
                            {account.method === "UPI"
                              ? <CreditCard className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                              : <Landmark className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm">{account.label}</p>
                            <p className="text-xs text-muted-foreground">
                              by {account.operatorName ?? account.operatorEmail ?? "Operator"}
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="shrink-0">Pending</Badge>
                      </div>

                      {/* Account details */}
                      <div className="rounded-xl bg-muted/40 p-3 text-sm space-y-1.5 mb-3">
                        {account.method === "UPI" && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">UPI ID</span>
                            <span className="font-mono font-medium">{account.upiId}</span>
                          </div>
                        )}
                        {account.method === "BANK_ACCOUNT" && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Holder</span>
                              <span className="font-medium">{account.accountHolderName}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Account No.</span>
                              <span className="font-mono font-medium">{account.accountNumber}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">IFSC</span>
                              <span className="font-mono font-medium">{account.ifscCode}</span>
                            </div>
                            {account.bankName && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Bank</span>
                                <span className="font-medium">{account.bankName}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(account.id)}
                          disabled={saving}
                          className="flex-1 rounded-xl gap-1.5"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setRejectingId(account.id); setRejectDialogOpen(true); }}
                          disabled={saving}
                          className="flex-1 rounded-xl gap-1.5 text-destructive hover:text-destructive"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {reviewedAccounts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reviewed</p>
                <div className="rounded-2xl border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Operator</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviewedAccounts.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.label}</TableCell>
                          <TableCell>{a.method === "UPI" ? `UPI: ${a.upiId}` : `Bank: ····${a.accountNumber?.slice(-4)}`}</TableCell>
                          <TableCell className="text-muted-foreground">{a.operatorName ?? a.operatorEmail ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant={accountStatusVariant(a.status)}>
                              {a.status === "APPROVED" ? "Approved" : "Rejected"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {accounts.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <CreditCard className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium">No payment accounts submitted yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Events */}
          <TabsContent value="events" className="mt-0">
            {events.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <Receipt className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium">No payment events created yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-2xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Collected</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{e.title}</p>
                            {e.description && (
                              <p className="text-xs text-muted-foreground">{e.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold">₹{e.amount.toFixed(0)}</TableCell>
                        <TableCell className="text-muted-foreground">{e.operatorName ?? e.operatorEmail ?? "—"}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1">
                            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                            {e.receiptCount}
                          </span>
                        </TableCell>
                        <TableCell>
                          {e.dueDate
                            ? <span className="text-sm">{new Date(e.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={e.status === "ACTIVE" ? "default" : e.status === "COMPLETED" ? "secondary" : "outline"}
                          >
                            {e.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Reject Payment Account</DialogTitle>
            <DialogDescription>Provide a reason so the operator can take corrective action.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>Rejection Reason</Label>
              <Input
                placeholder="e.g. Invalid IFSC code"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)} className="flex-1 rounded-xl">Cancel</Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={saving || !rejectionReason.trim()}
                className="flex-1 rounded-xl"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
