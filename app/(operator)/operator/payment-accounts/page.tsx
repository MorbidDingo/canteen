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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Plus, CreditCard, Landmark, CheckCircle2, Clock, XCircle, ArrowLeft } from "lucide-react";
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
};

function statusVariant(status: PaymentAccount["status"]) {
  if (status === "APPROVED") return "default" as const;
  if (status === "REJECTED") return "destructive" as const;
  return "secondary" as const;
}

function statusIcon(status: PaymentAccount["status"]) {
  if (status === "APPROVED") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "REJECTED") return <XCircle className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

export default function OperatorPaymentAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    label: "",
    method: "UPI" as "UPI" | "BANK_ACCOUNT",
    upiId: "",
    accountHolderName: "",
    accountNumber: "",
    ifscCode: "",
    bankName: "",
  });

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/operator/payment-accounts", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAccounts(data.accounts ?? []);
    } catch {
      toast.error("Failed to load payment accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  async function handleCreate() {
    if (!form.label) return toast.error("Label is required");
    if (form.method === "UPI" && !form.upiId) return toast.error("UPI ID is required");
    if (form.method === "BANK_ACCOUNT" && (!form.accountHolderName || !form.accountNumber || !form.ifscCode)) {
      return toast.error("Account holder name, number, and IFSC are required");
    }

    setSaving(true);
    try {
      const res = await fetch("/api/operator/payment-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed");
      }
      toast.success("Payment account submitted for management approval");
      setCreateOpen(false);
      setForm({ label: "", method: "UPI", upiId: "", accountHolderName: "", accountNumber: "", ifscCode: "", bankName: "" });
      void fetchAccounts();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

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
            <h1 className="text-lg font-semibold tracking-tight">Payment Accounts</h1>
            <p className="text-sm text-muted-foreground">UPI or bank accounts for event collections</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm" className="rounded-xl gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Account
          </Button>
        </div>

        {/* Accounts List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : accounts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <CreditCard className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium">No payment accounts yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add a UPI or bank account to collect event payments</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <Card key={account.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
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
                        <p className="font-semibold text-sm truncate">{account.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {account.method === "UPI"
                            ? account.upiId
                            : `${account.bankName ?? "Bank"} · ${account.accountNumber ? `····${account.accountNumber.slice(-4)}` : ""}`}
                        </p>
                      </div>
                    </div>
                    <Badge variant={statusVariant(account.status)} className="gap-1 shrink-0">
                      {statusIcon(account.status)}
                      {account.status === "PENDING_APPROVAL" ? "Pending" : account.status === "APPROVED" ? "Approved" : "Rejected"}
                    </Badge>
                  </div>
                  {account.status === "REJECTED" && account.rejectionReason && (
                    <p className="mt-3 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                      {account.rejectionReason}
                    </p>
                  )}
                  {account.status === "PENDING_APPROVAL" && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Awaiting management approval before use in events
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add Payment Account</DialogTitle>
            <DialogDescription>This will be reviewed by management before activation.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                placeholder="e.g. School Trip Account"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Method</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["UPI", "BANK_ACCOUNT"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, method: m }))}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-all",
                      form.method === m
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {m === "UPI" ? <CreditCard className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}
                    {m === "UPI" ? "UPI" : "Bank Account"}
                  </button>
                ))}
              </div>
            </div>

            {form.method === "UPI" ? (
              <div className="space-y-1.5">
                <Label>UPI ID</Label>
                <Input
                  placeholder="name@bank"
                  value={form.upiId}
                  onChange={(e) => setForm((f) => ({ ...f, upiId: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Account Holder Name</Label>
                  <Input
                    placeholder="Full legal name"
                    value={form.accountHolderName}
                    onChange={(e) => setForm((f) => ({ ...f, accountHolderName: e.target.value }))}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Account Number</Label>
                  <Input
                    placeholder="Account number"
                    value={form.accountNumber}
                    onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                    className="rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>IFSC Code</Label>
                    <Input
                      placeholder="SBIN0001234"
                      value={form.ifscCode}
                      onChange={(e) => setForm((f) => ({ ...f, ifscCode: e.target.value.toUpperCase() }))}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bank Name</Label>
                    <Input
                      placeholder="SBI"
                      value={form.bankName}
                      onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>
            )}

            <Button onClick={handleCreate} disabled={saving} className="w-full rounded-xl mt-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit for Approval
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
