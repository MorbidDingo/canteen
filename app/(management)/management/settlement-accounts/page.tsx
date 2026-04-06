"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, ShieldBan, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  userId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  accountType: "CANTEEN_ADMIN" | "MANAGEMENT";
  label: string;
  method: "BANK_ACCOUNT" | "UPI";
  maskedAccount: string | null;
  status: "ACTIVE" | "BLOCKED" | "PENDING_VERIFICATION";
  blockReason: string | null;
  createdAt: string;
};

type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function statusVariant(status: SettlementAccount["status"]) {
  if (status === "ACTIVE") return "default" as const;
  if (status === "BLOCKED") return "destructive" as const;
  return "secondary" as const;
}

export default function ManagementSettlementAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<SettlementAccount[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [ownerFilter, setOwnerFilter] = useState<string>("ALL");

  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockingAccountId, setBlockingAccountId] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState("");

  const [createForm, setCreateForm] = useState({
    userId: "",
    accountType: "CANTEEN_ADMIN" as "CANTEEN_ADMIN" | "MANAGEMENT",
    label: "",
    method: "BANK_ACCOUNT" as "BANK_ACCOUNT" | "UPI",
    bankAccountNumber: "",
    bankIfsc: "",
    bankAccountHolderName: "",
    upiVpa: "",
  });

  async function loadData() {
    setLoading(true);
    try {
      const [accountsRes, staffRes] = await Promise.all([
        fetch("/api/management/settlement-accounts", { cache: "no-store" }),
        fetch("/api/management/accounts?kind=staff", { cache: "no-store" }),
      ]);

      if (!accountsRes.ok || !staffRes.ok) throw new Error("Failed to fetch settlement account data");

      const accountsData = await accountsRes.json();
      const staffData = await staffRes.json();

      setAccounts(accountsData.accounts ?? []);
      setStaffUsers((staffData.accounts ?? []).filter((user: StaffUser) => ["ADMIN", "MANAGEMENT", "OWNER"].includes(user.role)));
    } catch {
      toast.error("Failed to load settlement accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (statusFilter !== "ALL" && account.status !== statusFilter) return false;
      if (typeFilter !== "ALL" && account.accountType !== typeFilter) return false;
      if (ownerFilter !== "ALL" && account.userId !== ownerFilter) return false;
      if (!q) return true;

      return (
        (account.ownerName || "").toLowerCase().includes(q) ||
        (account.ownerEmail || "").toLowerCase().includes(q) ||
        account.label.toLowerCase().includes(q) ||
        (account.maskedAccount || "").toLowerCase().includes(q)
      );
    });
  }, [accounts, ownerFilter, search, statusFilter, typeFilter]);

  async function createAccount() {
    if (!createForm.label.trim()) return toast.error("Label is required");
    if (!createForm.userId) return toast.error("Select an owner");
    if (createForm.method === "BANK_ACCOUNT") {
      if (!createForm.bankAccountNumber.trim()) return toast.error("Bank account number is required");
      if (!IFSC_REGEX.test(createForm.bankIfsc.trim().toUpperCase())) return toast.error("Valid IFSC is required");
      if (!createForm.bankAccountHolderName.trim()) return toast.error("Account holder name is required");
    }
    if (createForm.method === "UPI" && !createForm.upiVpa.trim()) return toast.error("UPI VPA is required");

    setSaving(true);
    try {
      const res = await fetch("/api/management/settlement-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create settlement account");
      }

      toast.success("Settlement account created");
      setCreateForm({
        userId: "",
        accountType: "CANTEEN_ADMIN",
        label: "",
        method: "BANK_ACCOUNT",
        bankAccountNumber: "",
        bankIfsc: "",
        bankAccountHolderName: "",
        upiVpa: "",
      });
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create settlement account");
    } finally {
      setSaving(false);
    }
  }

  function openBlockDialog(accountId: string) {
    setBlockingAccountId(accountId);
    setBlockReason("");
    setBlockDialogOpen(true);
  }

  async function confirmBlock() {
    if (!blockingAccountId) return;
    if (!blockReason.trim()) return toast.error("Block reason is required");

    setSaving(true);
    try {
      const res = await fetch(`/api/management/settlement-accounts/${blockingAccountId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: blockReason.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to block account");
      }

      toast.success("Account blocked");
      setBlockDialogOpen(false);
      setBlockingAccountId(null);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to block account");
    } finally {
      setSaving(false);
    }
  }

  async function unblockAccount(accountId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/management/settlement-accounts/${accountId}/block`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to unblock account");
      }

      toast.success("Account unblocked");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unblock account");
    } finally {
      setSaving(false);
    }
  }

  async function approveAccount(accountId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/management/settlement-accounts/${accountId}/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to approve account");
      }

      toast.success("Account approved");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Settlement Accounts</CardTitle>
          <CardDescription>
            Manage all organization settlement accounts, apply filters, and block or unblock accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Search</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, label" />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <select className="h-10 w-full rounded-xl border border-input px-3" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">All</option>
                <option value="ACTIVE">Active</option>
                <option value="BLOCKED">Blocked</option>
                <option value="PENDING_VERIFICATION">Pending</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Account Type</Label>
              <select className="h-10 w-full rounded-xl border border-input px-3" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="ALL">All</option>
                <option value="CANTEEN_ADMIN">Canteen Admin</option>
                <option value="MANAGEMENT">Management</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Owner</Label>
              <select className="h-10 w-full rounded-xl border border-input px-3" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
                <option value="ALL">All</option>
                {staffUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admin Name</TableHead>
                  <TableHead>Account Label</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Masked Details</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">No settlement accounts found.</TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{account.ownerName || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{account.ownerEmail || "-"}</p>
                        </div>
                      </TableCell>
                      <TableCell>{account.label}</TableCell>
                      <TableCell>{account.method === "BANK_ACCOUNT" ? "Bank Account" : "UPI"}</TableCell>
                      <TableCell>{account.maskedAccount || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(account.status)}>{account.status.replaceAll("_", " ")}</Badge>
                        {account.blockReason ? <p className="text-xs text-muted-foreground mt-1">{account.blockReason}</p> : null}
                      </TableCell>
                      <TableCell>
                        {account.status === "BLOCKED" ? (
                          <Button size="sm" variant="outline" disabled={saving} onClick={() => void unblockAccount(account.id)}>
                            <ShieldCheck className="h-4 w-4" /> Unblock
                          </Button>
                        ) : account.status === "PENDING_VERIFICATION" ? (
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="default" disabled={saving} onClick={() => void approveAccount(account.id)}>
                              <ShieldCheck className="h-4 w-4" /> Approve
                            </Button>
                            <Button size="sm" variant="destructive" disabled={saving} onClick={() => openBlockDialog(account.id)}>
                              <ShieldBan className="h-4 w-4" /> Block
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="destructive" disabled={saving} onClick={() => openBlockDialog(account.id)}>
                            <ShieldBan className="h-4 w-4" /> Block
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Add Account for Admin</CardTitle>
          <CardDescription>Management can create settlement accounts on behalf of admin and management users.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Owner</Label>
              <select className="h-10 w-full rounded-xl border border-input px-3" value={createForm.userId} onChange={(e) => setCreateForm((prev) => ({ ...prev, userId: e.target.value }))}>
                <option value="">Select owner</option>
                {staffUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Account Type</Label>
              <select className="h-10 w-full rounded-xl border border-input px-3" value={createForm.accountType} onChange={(e) => setCreateForm((prev) => ({ ...prev, accountType: e.target.value as "CANTEEN_ADMIN" | "MANAGEMENT" }))}>
                <option value="CANTEEN_ADMIN">Canteen Admin</option>
                <option value="MANAGEMENT">Management</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Method</Label>
              <select className="h-10 w-full rounded-xl border border-input px-3" value={createForm.method} onChange={(e) => setCreateForm((prev) => ({ ...prev, method: e.target.value as "BANK_ACCOUNT" | "UPI" }))}>
                <option value="BANK_ACCOUNT">Bank Account</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
          </div>

          <div className="space-y-1 max-w-xl">
            <Label>Account Label</Label>
            <Input value={createForm.label} onChange={(e) => setCreateForm((prev) => ({ ...prev, label: e.target.value }))} placeholder="Primary settlement account" />
          </div>

          {createForm.method === "BANK_ACCOUNT" ? (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Bank Account Number</Label>
                <Input value={createForm.bankAccountNumber} onChange={(e) => setCreateForm((prev) => ({ ...prev, bankAccountNumber: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>IFSC</Label>
                <Input value={createForm.bankIfsc} onChange={(e) => setCreateForm((prev) => ({ ...prev, bankIfsc: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-1">
                <Label>Account Holder Name</Label>
                <Input value={createForm.bankAccountHolderName} onChange={(e) => setCreateForm((prev) => ({ ...prev, bankAccountHolderName: e.target.value }))} />
              </div>
            </div>
          ) : (
            <div className="space-y-1 max-w-md">
              <Label>UPI VPA</Label>
              <Input value={createForm.upiVpa} onChange={(e) => setCreateForm((prev) => ({ ...prev, upiVpa: e.target.value.toLowerCase() }))} placeholder="name@bank" />
            </div>
          )}

          <Button disabled={saving} onClick={() => void createAccount()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block Settlement Account</DialogTitle>
            <DialogDescription>Provide a reason before blocking this account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Compliance issue / account mismatch..." />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={saving} onClick={() => void confirmBlock()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldBan className="h-4 w-4" />} Confirm Block
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
