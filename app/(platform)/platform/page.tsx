"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, LogOut, RefreshCw, CheckCircle, XCircle, IndianRupee } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { signOut } from "@/lib/auth-client";

type Organization = {
  id: string;
  name: string;
  slug: string;
  type: "SCHOOL" | "COLLEGE" | "OTHER";
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  createdAt: string;
  approvedAt: string | null;
  suspendedAt: string | null;
};

type OrgAdmin = {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  joinedAt: string | null;
};

type ApprovalRequest = {
  id: string;
  applicantUserId: string;
  applicantName: string;
  applicantEmail: string;
  requestedName: string;
  requestedSlug: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
};

type ReactivationRequest = {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  requestedByUserId: string;
  requestedByName: string;
  requestedByEmail: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string | null;
  reviewNotes: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type SettlementAccountInfo = {
  id: string;
  organizationId: string;
  organizationName: string;
  userId: string;
  ownerName: string;
  ownerEmail: string;
  accountType: string;
  label: string;
  method: string;
  bankIfsc: string | null;
  bankAccountHolderName: string | null;
  upiVpa: string | null;
  status: string;
  blockReason: string | null;
  createdAt: string;
};

type SettlementBatchInfo = {
  id: string;
  organizationId: string;
  organizationName: string;
  accountLabel: string;
  accountMethod: string;
  ownerName: string;
  ownerEmail: string;
  totalGross: number;
  totalFee: number;
  totalNet: number;
  orderCount: number;
  status: string;
  processedAt: string | null;
  createdAt: string;
};

type SettlementSummary = {
  totalPending: number;
  totalSettled: number;
  totalFees: number;
  batchCount: number;
};

export default function PlatformDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [orgAdmins, setOrgAdmins] = useState<OrgAdmin[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [reactivationRequests, setReactivationRequests] = useState<ReactivationRequest[]>([]);
  const [settlementAccounts, setSettlementAccounts] = useState<SettlementAccountInfo[]>([]);
  const [pendingBatches, setPendingBatches] = useState<SettlementBatchInfo[]>([]);
  const [settlementSummary, setSettlementSummary] = useState<SettlementSummary | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [approvingAccount, setApprovingAccount] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [type, setType] = useState<"SCHOOL" | "COLLEGE" | "OTHER">("SCHOOL");
  const [primaryAdminEmail, setPrimaryAdminEmail] = useState("");
  const [primaryAdminRole, setPrimaryAdminRole] = useState<"OWNER" | "ADMIN" | "MANAGEMENT">("OWNER");

  async function loadData() {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        fetch("/api/platform/organizations", { cache: "no-store" }),
        fetch("/api/platform/org-admins", { cache: "no-store" }),
        fetch("/api/platform/approval-requests?status=PENDING", { cache: "no-store" }),
        fetch("/api/platform/reactivation-requests?status=PENDING", { cache: "no-store" }),
        fetch("/api/platform/settlement-accounts", { cache: "no-store" }),
        fetch("/api/platform/settlements?status=PENDING", { cache: "no-store" }),
      ]);

      const [orgResult, adminResult, approvalResult, reactivationResult, stlAccountResult, stlBatchResult] = results;

      if (orgResult.status === "fulfilled" && orgResult.value.ok) {
        const data = (await orgResult.value.json()) as { organizations: Organization[] };
        setOrganizations(data.organizations || []);
      }

      if (adminResult.status === "fulfilled" && adminResult.value.ok) {
        const data = (await adminResult.value.json()) as { admins: OrgAdmin[] };
        setOrgAdmins(data.admins || []);
      }

      if (approvalResult.status === "fulfilled" && approvalResult.value.ok) {
        const data = (await approvalResult.value.json()) as { requests: ApprovalRequest[] };
        setApprovalRequests(data.requests || []);
      } else {
        setApprovalRequests([]);
      }

      if (reactivationResult.status === "fulfilled" && reactivationResult.value.ok) {
        const data = (await reactivationResult.value.json()) as { requests: ReactivationRequest[] };
        setReactivationRequests(data.requests || []);
      } else {
        setReactivationRequests([]);
      }

      if (stlAccountResult.status === "fulfilled" && stlAccountResult.value.ok) {
        const data = (await stlAccountResult.value.json()) as { accounts: SettlementAccountInfo[] };
        setSettlementAccounts(data.accounts || []);
      }

      if (stlBatchResult.status === "fulfilled" && stlBatchResult.value.ok) {
        const data = (await stlBatchResult.value.json()) as { batches: SettlementBatchInfo[]; summary: SettlementSummary };
        setPendingBatches(data.batches || []);
        setSettlementSummary(data.summary || null);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load platform data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const activeCount = useMemo(() => organizations.filter((o) => o.status === "ACTIVE").length, [organizations]);
  const suspendedCount = useMemo(() => organizations.filter((o) => o.status === "SUSPENDED").length, [organizations]);

  async function createOrganization(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim() || !slug.trim()) {
      toast.error("Name and slug are required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/platform/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          type,
          primaryAdminEmail: primaryAdminEmail.trim() || undefined,
          primaryAdminRole,
        }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string; organization?: Organization } | null;
      if (!res.ok) {
        throw new Error(data?.error || "Failed to create organization");
      }

      toast.success("Organization created");
      setName("");
      setSlug("");
      setType("SCHOOL");
      setPrimaryAdminEmail("");
      setPrimaryAdminRole("OWNER");
      await loadData();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to create organization";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function suspendOrganization(id: string) {
    const reason = window.prompt("Suspension reason", "Suspended by platform owner") || "Suspended by platform owner";
    const res = await fetch(`/api/platform/organizations/${id}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.error(data?.error || "Failed to suspend organization");
      return;
    }

    toast.success("Organization suspended");
    await loadData();
  }

  async function reactivateOrganization(id: string) {
    const res = await fetch(`/api/platform/organizations/${id}/reactivate`, { method: "POST" });

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.error(data?.error || "Failed to reactivate organization");
      return;
    }

    toast.success("Organization reactivated");
    await loadData();
  }

  async function approveRequest(id: string) {
    const res = await fetch(`/api/platform/approval-requests/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.error(data?.error || "Failed to approve request");
      return;
    }

    toast.success("Tenant registration approved");
    await loadData();
  }

  async function rejectRequest(id: string) {
    const reason = window.prompt("Rejection reason", "Rejected by platform owner") || "Rejected by platform owner";
    const res = await fetch(`/api/platform/approval-requests/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.error(data?.error || "Failed to reject request");
      return;
    }

    toast.success("Tenant registration rejected");
    await loadData();
  }

  async function approveReactivationRequest(id: string) {
    const res = await fetch(`/api/platform/reactivation-requests/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.error(data?.error || "Failed to approve reactivation request");
      return;
    }

    toast.success("Organization reactivation approved");
    await loadData();
  }

  async function rejectReactivationRequest(id: string) {
    const reason =
      window.prompt("Rejection reason", "Reactivation request rejected by platform owner") ||
      "Reactivation request rejected by platform owner";

    const res = await fetch(`/api/platform/reactivation-requests/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.error(data?.error || "Failed to reject reactivation request");
      return;
    }

    toast.success("Reactivation request rejected");
    await loadData();
  }

  async function markBatchPaid(batchId: string) {
    setMarkingPaid(batchId);
    try {
      const res = await fetch("/api/platform/settlements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchIds: [batchId] }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(data?.error || "Failed to mark as paid");
        return;
      }

      toast.success("Settlement marked as paid");
      await loadData();
    } catch {
      toast.error("Failed to mark settlement as paid");
    } finally {
      setMarkingPaid(null);
    }
  }

  async function approveSettlementAccount(accountId: string) {
    setApprovingAccount(accountId);
    try {
      const res = await fetch("/api/platform/settlement-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, action: "approve" }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(data?.error || "Failed to approve account");
        return;
      }

      toast.success("Settlement account approved");
      await loadData();
    } catch {
      toast.error("Failed to approve account");
    } finally {
      setApprovingAccount(null);
    }
  }

  async function blockSettlementAccount(accountId: string) {
    const reason = window.prompt("Block reason", "Blocked by platform owner") || "Blocked by platform owner";
    setApprovingAccount(accountId);
    try {
      const res = await fetch("/api/platform/settlement-accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, action: "block", reason }),
      });

      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error(data?.error || "Failed to block account");
        return;
      }

      toast.success("Settlement account blocked");
      await loadData();
    } catch {
      toast.error("Failed to block account");
    } finally {
      setApprovingAccount(null);
    }
  }

  function handleSignOut() {
    signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/login";
        },
      },
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Platform Owner Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage organizations and tenant admins globally.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Orgs</CardTitle>
            <CardDescription>All registered organizations</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{organizations.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active</CardTitle>
            <CardDescription>Operational organizations</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{activeCount}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Suspended</CardTitle>
            <CardDescription>Blocked organizations</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{suspendedCount}</CardContent>
        </Card>
      </div>

      {/* Settlement Summary */}
      {settlementSummary && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1"><IndianRupee className="h-4 w-4" /> Pending Payouts</CardTitle>
              <CardDescription>Awaiting manual payment</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold text-amber-600">₹{Number(settlementSummary.totalPending).toFixed(0)}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Total Settled</CardTitle>
              <CardDescription>Paid to vendors</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold text-green-600">₹{Number(settlementSummary.totalSettled).toFixed(0)}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1"><IndianRupee className="h-4 w-4" /> Platform Fees</CardTitle>
              <CardDescription>Total fees collected</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">₹{Number(settlementSummary.totalFees).toFixed(0)}</CardContent>
          </Card>
        </div>
      )}

      {/* Pending Settlement Batches */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Settlement Batches</CardTitle>
          <CardDescription>Mark batches as paid after manual vendor payment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading batches...
            </div>
          ) : pendingBatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending settlement batches.</p>
          ) : (
            pendingBatches.map((batch) => (
              <div key={batch.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="font-medium">{batch.organizationName}</p>
                  <p className="text-xs text-muted-foreground">
                    {batch.ownerName} • {batch.accountLabel} ({batch.accountMethod})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {batch.orderCount} orders • Gross: ₹{batch.totalGross.toFixed(0)} • Fee: ₹{batch.totalFee.toFixed(0)} • <span className="font-semibold">Net: ₹{batch.totalNet.toFixed(0)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Created: {new Date(batch.createdAt).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => void markBatchPaid(batch.id)}
                  disabled={markingPaid === batch.id}
                >
                  {markingPaid === batch.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle className="mr-1 h-3 w-3" />}
                  Mark Paid
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Payment Account Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Account Requests</CardTitle>
          <CardDescription>Approve or block vendor settlement accounts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts...
            </div>
          ) : settlementAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No settlement accounts found.</p>
          ) : (
            settlementAccounts.map((account) => (
              <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="font-medium">{account.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {account.organizationName} • {account.ownerName} ({account.ownerEmail})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {account.method === "BANK_ACCOUNT"
                      ? `Bank: ${account.bankAccountHolderName || "N/A"} (IFSC: ${account.bankIfsc || "N/A"})`
                      : `UPI: ${account.upiVpa || "N/A"}`}
                  </p>
                  <Badge variant={account.status === "ACTIVE" ? "default" : account.status === "BLOCKED" ? "destructive" : "secondary"} className="mt-1">
                    {account.status}
                  </Badge>
                  {account.blockReason && (
                    <p className="text-xs text-red-600 mt-1">Reason: {account.blockReason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {account.status === "PENDING_VERIFICATION" && (
                    <Button
                      size="sm"
                      onClick={() => void approveSettlementAccount(account.id)}
                      disabled={approvingAccount === account.id}
                    >
                      {approvingAccount === account.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle className="mr-1 h-3 w-3" />}
                      Approve
                    </Button>
                  )}
                  {account.status !== "BLOCKED" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void blockSettlementAccount(account.id)}
                      disabled={approvingAccount === account.id}
                    >
                      <XCircle className="mr-1 h-3 w-3" />
                      Block
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending Tenant Registrations</CardTitle>
          <CardDescription>Review and decide tenant onboarding requests.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading requests...
            </div>
          ) : approvalRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending tenant registrations.</p>
          ) : (
            approvalRequests.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="font-medium">{request.requestedName}</p>
                  <p className="text-xs text-muted-foreground">{request.requestedSlug}</p>
                  <p className="text-xs text-muted-foreground">
                    Applicant: {request.applicantName} ({request.applicantEmail})
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="default" onClick={() => void approveRequest(request.id)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void rejectRequest(request.id)}>
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reactivation Requests</CardTitle>
          <CardDescription>Organizations suspended by platform can request reactivation here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading requests...
            </div>
          ) : reactivationRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending reactivation requests.</p>
          ) : (
            reactivationRequests.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="font-medium">{request.organizationName}</p>
                  <p className="text-xs text-muted-foreground">{request.organizationSlug}</p>
                  <p className="text-xs text-muted-foreground">
                    Requested by {request.requestedByName} ({request.requestedByEmail})
                  </p>
                  {request.reason ? (
                    <p className="text-xs text-muted-foreground mt-1">Reason: {request.reason}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="default" onClick={() => void approveReactivationRequest(request.id)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void rejectReactivationRequest(request.id)}>
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create Organization</CardTitle>
          <CardDescription>Owner can create multiple organizations and attach a primary owner/admin/management user.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createOrganization} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunrise Public School" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slug">Slug</Label>
              <Input id="org-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="sunrise-public" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-type">Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as "SCHOOL" | "COLLEGE" | "OTHER")}>
                <SelectTrigger id="org-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCHOOL">School</SelectItem>
                  <SelectItem value="COLLEGE">College</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-role">Primary Role</Label>
              <Select value={primaryAdminRole} onValueChange={(value) => setPrimaryAdminRole(value as "OWNER" | "ADMIN" | "MANAGEMENT")}>
                <SelectTrigger id="admin-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER">Tenant Owner</SelectItem>
                  <SelectItem value="MANAGEMENT">Management</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="admin-email">Primary Owner/Admin/Management Email (optional)</Label>
              <Input
                id="admin-email"
                type="email"
                value={primaryAdminEmail}
                onChange={(e) => setPrimaryAdminEmail(e.target.value)}
                placeholder="management@school.edu"
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Organization
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading organizations...
            </div>
          ) : organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organizations found.</p>
          ) : (
            organizations.map((org) => (
              <div key={org.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="font-medium">{org.name}</p>
                  <p className="text-xs text-muted-foreground">{org.slug} • {org.type}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={org.status === "ACTIVE" ? "default" : org.status === "SUSPENDED" ? "destructive" : "secondary"}>
                    {org.status}
                  </Badge>
                  {org.status === "ACTIVE" ? (
                    <Button size="sm" variant="destructive" onClick={() => void suspendOrganization(org.id)}>
                      Suspend
                    </Button>
                  ) : org.status === "SUSPENDED" ? (
                    <Button size="sm" variant="outline" onClick={() => void reactivateOrganization(org.id)}>
                      Reactivate
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization Admins</CardTitle>
          <CardDescription>Management/admin users scoped to each organization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading admins...
            </div>
          ) : orgAdmins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organization admins found.</p>
          ) : (
            orgAdmins.map((admin) => (
              <div key={admin.membershipId} className="rounded-md border p-3">
                <p className="font-medium">{admin.userName}</p>
                <p className="text-xs text-muted-foreground">{admin.userEmail}{admin.userPhone ? ` • ${admin.userPhone}` : ""}</p>
                <p className="mt-1 text-xs text-muted-foreground">{admin.organizationName} ({admin.organizationSlug})</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
