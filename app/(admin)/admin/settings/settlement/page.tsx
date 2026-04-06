"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Building2, Loader2, Plus, RefreshCcw, ShieldAlert, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SettlementAccount = {
  id: string;
  label: string;
  accountType: "CANTEEN_ADMIN" | "MANAGEMENT";
  method: "BANK_ACCOUNT" | "UPI";
  bankIfsc: string | null;
  bankAccountHolderName: string | null;
  upiVpa: string | null;
  status: "ACTIVE" | "BLOCKED" | "PENDING_VERIFICATION";
  blockReason: string | null;
  maskedAccount: string | null;
  routedCanteens: Array<{ id: string; name: string; location: string | null }>;
};

type SettlementBatch = {
  id: string;
  settlementAccountId: string;
  totalGross: number;
  totalFee: number;
  totalNet: number;
  orderCount: number;
  status: "PENDING" | "PROCESSING" | "SETTLED" | "FAILED" | "PARTIALLY_FAILED";
  razorpayPayoutId: string | null;
  processedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  account: { id: string; label: string; method: "BANK_ACCOUNT" | "UPI" } | null;
};

type LedgerEntry = {
  id: string;
  orderId: string | null;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  entryType: "DEBIT" | "REVERSAL";
  status: "PENDING" | "PROCESSING" | "SETTLED" | "FAILED";
  settledAt: string | null;
  failureReason: string | null;
  createdAt: string;
};

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function statusVariant(status: SettlementAccount["status"] | SettlementBatch["status"]) {
  if (status === "ACTIVE" || status === "SETTLED") return "default" as const;
  if (status === "BLOCKED" || status === "FAILED" || status === "PARTIALLY_FAILED") return "destructive" as const;
  return "secondary" as const;
}

function prettyDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function rupees(value: number) {
  return `Rs ${value.toFixed(2)}`;
}

export default function AdminSettlementSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<SettlementAccount[]>([]);
  const [batches, setBatches] = useState<SettlementBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [selectedBatchEntries, setSelectedBatchEntries] = useState<LedgerEntry[]>([]);
  const [selectedBatchNote, setSelectedBatchNote] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    label: "",
    method: "BANK_ACCOUNT" as "BANK_ACCOUNT" | "UPI",
    bankAccountNumber: "",
    bankIfsc: "",
    bankAccountHolderName: "",
    upiVpa: "",
  });

  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    label: "",
    method: "BANK_ACCOUNT" as "BANK_ACCOUNT" | "UPI",
    bankAccountNumber: "",
    bankIfsc: "",
    bankAccountHolderName: "",
    upiVpa: "",
  });

  const recentBatches = useMemo(() => batches.slice(0, 20), [batches]);

  async function loadAccountsAndHistory() {
    setLoading(true);
    try {
      const [accountsRes, historyRes] = await Promise.all([
        fetch("/api/admin/settlement-accounts", { cache: "no-store" }),
        fetch("/api/admin/settlement-history", { cache: "no-store" }),
      ]);

      if (!accountsRes.ok || !historyRes.ok) {
        throw new Error("Failed to load settlement data");
      }

      const accountsData = await accountsRes.json();
      const historyData = await historyRes.json();

      setAccounts(accountsData.accounts ?? []);
      setBatches(historyData.batches ?? []);
    } catch {
      toast.error("Could not load settlement settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccountsAndHistory();
  }, []);

  async function createAccount() {
    if (!createForm.label.trim()) return toast.error("Label is required");
    if (createForm.method === "BANK_ACCOUNT") {
      if (!createForm.bankAccountNumber.trim()) return toast.error("Bank account number is required");
      if (!createForm.bankAccountHolderName.trim()) return toast.error("Account holder name is required");
      if (!IFSC_REGEX.test(createForm.bankIfsc.trim().toUpperCase())) return toast.error("Valid IFSC is required");
    }
    if (createForm.method === "UPI" && !createForm.upiVpa.trim()) return toast.error("UPI VPA is required");

    setSaving(true);
    try {
      const res = await fetch("/api/admin/settlement-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create account");
      }

      toast.success("Settlement account created");
      setCreateForm({
        label: "",
        method: "BANK_ACCOUNT",
        bankAccountNumber: "",
        bankIfsc: "",
        bankAccountHolderName: "",
        upiVpa: "",
      });
      await loadAccountsAndHistory();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(account: SettlementAccount) {
    setEditingAccountId(account.id);
    setEditForm({
      label: account.label,
      method: account.method,
      bankAccountNumber: "",
      bankIfsc: account.bankIfsc ?? "",
      bankAccountHolderName: account.bankAccountHolderName ?? "",
      upiVpa: account.upiVpa ?? "",
    });
  }

  async function saveEdit() {
    if (!editingAccountId) return;
    if (!editForm.label.trim()) return toast.error("Label is required");
    if (editForm.method === "BANK_ACCOUNT") {
      if (!editForm.bankIfsc.trim() || !IFSC_REGEX.test(editForm.bankIfsc.trim().toUpperCase())) {
        return toast.error("Valid IFSC is required");
      }
      if (!editForm.bankAccountHolderName.trim()) return toast.error("Account holder name is required");
    }
    if (editForm.method === "UPI" && !editForm.upiVpa.trim()) return toast.error("UPI VPA is required");

    setSaving(true);
    try {
      const payload: Record<string, string> = {
        label: editForm.label,
        method: editForm.method,
      };

      if (editForm.method === "BANK_ACCOUNT") {
        payload.bankIfsc = editForm.bankIfsc;
        payload.bankAccountHolderName = editForm.bankAccountHolderName;
        if (editForm.bankAccountNumber.trim()) {
          payload.bankAccountNumber = editForm.bankAccountNumber;
        }
      } else {
        payload.upiVpa = editForm.upiVpa;
      }

      const res = await fetch(`/api/admin/settlement-accounts/${editingAccountId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update account");
      }

      toast.success("Settlement account updated");
      setEditingAccountId(null);
      await loadAccountsAndHistory();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update account");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount(accountId: string) {
    if (!confirm("Delete this settlement account?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/settlement-accounts/${accountId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete account");
      }

      toast.success("Settlement account deleted");
      await loadAccountsAndHistory();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
    } finally {
      setSaving(false);
    }
  }

  async function loadBatchDetails(batchId: string) {
    setSelectedBatchId(batchId);
    setEntriesLoading(true);
    setSelectedBatchEntries([]);
    setSelectedBatchNote(null);
    try {
      const res = await fetch(`/api/admin/settlement-history/${batchId}`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load batch details");
      }

      const data = await res.json();
      setSelectedBatchEntries(data.entries ?? []);
      setSelectedBatchNote(data.note ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load batch details");
    } finally {
      setEntriesLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
      <Card className="border-0 bg-gradient-to-r from-[#154a9c] to-[#0d2f63] text-white">
        <CardContent className="py-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white/80">Admin Settings</p>
            <h1 className="text-2xl font-bold">Settlement Accounts</h1>
            <p className="text-sm text-white/75 mt-1">Manage payout destination accounts and review settlement batches.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link href="/admin/settings">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void loadAccountsAndHistory()}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Settlement Account
          </CardTitle>
          <CardDescription>Register a bank account or UPI VPA for payouts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={createForm.label}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="Main settlement account"
              />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <select
                className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
                value={createForm.method}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, method: e.target.value as "BANK_ACCOUNT" | "UPI" }))}
              >
                <option value="BANK_ACCOUNT">Bank Account</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
          </div>

          {createForm.method === "BANK_ACCOUNT" ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input
                  value={createForm.bankAccountNumber}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, bankAccountNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>IFSC</Label>
                <Input
                  value={createForm.bankIfsc}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, bankIfsc: e.target.value.toUpperCase() }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Account Holder Name</Label>
                <Input
                  value={createForm.bankAccountHolderName}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, bankAccountHolderName: e.target.value }))}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-w-md">
              <Label>UPI VPA</Label>
              <Input
                value={createForm.upiVpa}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, upiVpa: e.target.value.toLowerCase() }))}
                placeholder="name@bank"
              />
            </div>
          )}

          <Button disabled={saving} onClick={() => void createAccount()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
            Create Account
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Settlement Accounts</CardTitle>
          <CardDescription>Active, blocked, and pending verification accounts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No settlement accounts yet.</p>
          ) : (
            accounts.map((account) => (
              <div key={account.id} className="rounded-xl border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{account.label}</p>
                    <p className="text-sm text-muted-foreground">{account.method === "BANK_ACCOUNT" ? "Bank account" : "UPI"} • {account.maskedAccount || "No mask available"}</p>
                  </div>
                  <Badge variant={statusVariant(account.status)}>{account.status.replaceAll("_", " ")}</Badge>
                </div>

                {account.blockReason ? (
                  <div className="text-sm rounded-lg border border-destructive/30 bg-destructive/10 p-2 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    <span>Blocked reason: {account.blockReason}</span>
                  </div>
                ) : null}

                <div className="text-sm">
                  <p className="font-medium mb-1">Linked canteens</p>
                  {account.routedCanteens.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {account.routedCanteens.map((canteen) => (
                        <Badge key={canteen.id} variant="outline">
                          <Building2 className="h-3 w-3" />
                          {canteen.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No explicit canteen routing linked yet.</p>
                  )}
                </div>

                {editingAccountId === account.id ? (
                  <div className="space-y-3 rounded-xl border p-3 bg-muted/20">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label>Label</Label>
                        <Input value={editForm.label} onChange={(e) => setEditForm((p) => ({ ...p, label: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label>Method</Label>
                        <select
                          className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm"
                          value={editForm.method}
                          onChange={(e) => setEditForm((p) => ({ ...p, method: e.target.value as "BANK_ACCOUNT" | "UPI" }))}
                        >
                          <option value="BANK_ACCOUNT">Bank Account</option>
                          <option value="UPI">UPI</option>
                        </select>
                      </div>
                    </div>

                    {editForm.method === "BANK_ACCOUNT" ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label>New Account Number (optional)</Label>
                          <Input value={editForm.bankAccountNumber} onChange={(e) => setEditForm((p) => ({ ...p, bankAccountNumber: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <Label>IFSC</Label>
                          <Input value={editForm.bankIfsc} onChange={(e) => setEditForm((p) => ({ ...p, bankIfsc: e.target.value.toUpperCase() }))} />
                        </div>
                        <div className="space-y-1">
                          <Label>Account Holder Name</Label>
                          <Input value={editForm.bankAccountHolderName} onChange={(e) => setEditForm((p) => ({ ...p, bankAccountHolderName: e.target.value }))} />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1 max-w-md">
                        <Label>UPI VPA</Label>
                        <Input value={editForm.upiVpa} onChange={(e) => setEditForm((p) => ({ ...p, upiVpa: e.target.value.toLowerCase() }))} />
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button size="sm" disabled={saving} onClick={() => void saveEdit()}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingAccountId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => startEdit(account)}>Edit</Button>
                    <Button size="sm" variant="destructive" disabled={saving} onClick={() => void deleteAccount(account.id)}>
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settlement Batch History</CardTitle>
          <CardDescription>Date, orders, gross, fee, net, status, and payout id.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Net</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payout ID</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentBatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">No settlement batches yet.</TableCell>
                </TableRow>
              ) : (
                recentBatches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell>{prettyDate(batch.createdAt)}</TableCell>
                    <TableCell>{batch.account?.label || "Unknown"}</TableCell>
                    <TableCell>{batch.orderCount}</TableCell>
                    <TableCell>{rupees(batch.totalGross)}</TableCell>
                    <TableCell>{rupees(batch.totalFee)}</TableCell>
                    <TableCell>{rupees(batch.totalNet)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(batch.status)}>{batch.status.replaceAll("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate">{batch.razorpayPayoutId || "-"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => void loadBatchDetails(batch.id)}>
                        Drill down
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="rounded-xl border p-4 space-y-3">
            <p className="font-medium">Batch Entries Drill-down</p>
            {selectedBatchId ? (
              entriesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading entries...
                </div>
              ) : (
                <>
                  {selectedBatchNote ? <p className="text-sm text-muted-foreground">{selectedBatchNote}</p> : null}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Gross</TableHead>
                        <TableHead>Fee</TableHead>
                        <TableHead>Net</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedBatchEntries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">No linked entries found for this batch.</TableCell>
                        </TableRow>
                      ) : (
                        selectedBatchEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>{entry.orderId ? entry.orderId.slice(0, 8) : "-"}</TableCell>
                            <TableCell>{entry.entryType}</TableCell>
                            <TableCell>{rupees(entry.grossAmount)}</TableCell>
                            <TableCell>{rupees(entry.platformFee)}</TableCell>
                            <TableCell>{rupees(entry.netAmount)}</TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                            </TableCell>
                            <TableCell>{prettyDate(entry.createdAt)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Select a batch to view individual ledger entries.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
