"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  UserRound,
  Search,
  Plus,
  Trash2,
  KeyRound,
  Loader2,
  RefreshCw,
  Upload,
  Download,
} from "lucide-react";

type AccountKind = "general" | "staff";

type ManagedAccount = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
};

type CreatedCredential = {
  id: string;
  name: string;
  email: string;
  role: string;
  password: string;
  generatedPassword: boolean;
};

const STAFF_ROLES = [
  { value: "ADMIN", label: "Canteen Admin" },
  { value: "OPERATOR", label: "Operator" },
  { value: "LIB_OPERATOR", label: "Library Operator" },
  { value: "ATTENDANCE", label: "Attendance" },
  { value: "MANAGEMENT", label: "Management" },
];

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseGeneralCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV must contain a header and at least one row");
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const idxName = headers.indexOf("name");
  const idxEmail = headers.indexOf("email");
  const idxPhone = headers.indexOf("phone");
  const idxPassword = headers.indexOf("password");

  if (idxName < 0 || idxEmail < 0) {
    throw new Error("CSV header must include name,email");
  }

  const rows: Array<{ name: string; email: string; phone?: string; password?: string }> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const name = (cols[idxName] || "").trim();
    const email = (cols[idxEmail] || "").trim();
    const phone = idxPhone >= 0 ? (cols[idxPhone] || "").trim() : "";
    const password = idxPassword >= 0 ? (cols[idxPassword] || "").trim() : "";

    if (!name || !email) {
      throw new Error(`Missing name/email at line ${i + 1}`);
    }

    rows.push({
      name,
      email,
      phone: phone || undefined,
      password: password || undefined,
    });
  }

  return rows;
}

export default function ManagementAccountsPage() {
  const [kind, setKind] = useState<AccountKind>("general");
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"manual" | "bulk">("manual");
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [staffRole, setStaffRole] = useState("OPERATOR");

  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkRows, setBulkRows] = useState<Array<{ name: string; email: string; phone?: string; password?: string }>>(
    [],
  );

  const [credentials, setCredentials] = useState<CreatedCredential[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<ManagedAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedAccount | null>(null);

  const title = kind === "general" ? "General / Teacher Accounts" : "Staff Accounts";
  const description =
    kind === "general"
      ? "Users can order, pre-order (with Certe+), and use library workflows without child-control setup."
      : "Create and manage canteen/library/attendance/management staff credentials.";

  const fetchAccounts = useCallback(
    async (query?: string) => {
      try {
        setLoading(true);
        const q = query?.trim();
        const url = q && q.length >= 2
          ? `/api/management/accounts?kind=${kind}&q=${encodeURIComponent(q)}`
          : `/api/management/accounts?kind=${kind}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to load accounts");
        const data = await res.json();
        setAccounts(data.accounts || []);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load accounts");
      } finally {
        setLoading(false);
      }
    },
    [kind],
  );

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    if (!search) {
      void fetchAccounts();
      return;
    }
    if (search.trim().length < 2) return;
    const timeout = setTimeout(() => {
      void fetchAccounts(search);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, fetchAccounts]);

  const resetCreateForm = () => {
    setFormName("");
    setFormEmail("");
    setFormPhone("");
    setFormPassword("");
    setStaffRole("OPERATOR");
    setCreateMode("manual");
    setBulkRows([]);
    setBulkFileName("");
  };

  const handleManualCreate = async () => {
    if (!formName.trim() || !formEmail.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (formPassword && formPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setSaving(true);
    try {
      const payload =
        kind === "general"
          ? {
              kind: "general",
              mode: "single",
              account: {
                name: formName.trim(),
                email: formEmail.trim(),
                phone: formPhone.trim() || undefined,
                password: formPassword || undefined,
              },
            }
          : {
              kind: "staff",
              mode: "single",
              account: {
                name: formName.trim(),
                email: formEmail.trim(),
                phone: formPhone.trim() || undefined,
                password: formPassword || undefined,
                role: staffRole,
              },
            };

      const res = await fetch("/api/management/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create account");

      setCredentials(data.created || []);
      toast.success(`${data.summary?.created || 0} account created`);
      setCreateOpen(false);
      resetCreateForm();
      await fetchAccounts(search);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create account");
    } finally {
      setSaving(false);
    }
  };

  const onBulkFileChange = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseGeneralCsv(text);
      setBulkRows(rows);
      setBulkFileName(file.name);
      toast.success(`Loaded ${rows.length} rows from ${file.name}`);
    } catch (error) {
      setBulkRows([]);
      setBulkFileName("");
      toast.error(error instanceof Error ? error.message : "Invalid CSV file");
    }
  };

  const handleBulkCreate = async () => {
    if (bulkRows.length === 0) {
      toast.error("Upload a CSV file first");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/management/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "general",
          mode: "bulk",
          accounts: bulkRows,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk upload failed");

      setCredentials(data.created || []);
      toast.success(`Created ${data.summary?.created || 0} accounts`);
      setCreateOpen(false);
      resetCreateForm();
      await fetchAccounts(search);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk upload failed");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (account: ManagedAccount) => {
    setEditAccount(account);
    setEditName(account.name);
    setEditPassword("");
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editAccount) return;
    if (!editName.trim() && !editPassword.trim()) {
      toast.error("Please update name or password");
      return;
    }
    if (editPassword && editPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/management/accounts/${editAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          password: editPassword.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update account");

      toast.success("Account updated");
      setEditOpen(false);
      setEditAccount(null);
      setEditName("");
      setEditPassword("");
      await fetchAccounts(search);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update account");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/management/accounts/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete account");

      toast.success("Account deleted");
      setDeleteOpen(false);
      setDeleteTarget(null);
      await fetchAccounts(search);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
    } finally {
      setSaving(false);
    }
  };

  const downloadCredentials = useCallback(() => {
    if (credentials.length === 0) return;
    const header = "name,email,role,password,generatedPassword";
    const lines = credentials.map((row) =>
      [row.name, row.email, row.role, row.password, String(row.generatedPassword)]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `accounts_credentials_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [credentials]);

  const roleBadgeClass = useMemo<Record<string, string>>(
    () => ({
      GENERAL: "bg-amber-100 text-amber-800 border-amber-200",
      ADMIN: "bg-orange-100 text-orange-800 border-orange-200",
      OPERATOR: "bg-yellow-100 text-yellow-800 border-yellow-200",
      MANAGEMENT: "bg-red-100 text-red-800 border-red-200",
      LIB_OPERATOR: "bg-lime-100 text-lime-800 border-lime-200",
      ATTENDANCE: "bg-emerald-100 text-emerald-800 border-emerald-200",
    }),
    [],
  );

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-4">
      <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-4">
        <h1 className="text-2xl font-bold text-amber-900">Account Access Management</h1>
        <p className="text-sm text-amber-800/80">
          Create and control general/teacher accounts and internal staff credentials.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant={kind === "general" ? "default" : "outline"}
          className={kind === "general" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
          onClick={() => {
            setKind("general");
            setSearch("");
          }}
        >
          <UserRound className="h-4 w-4 mr-2" />
          General / Teacher
        </Button>
        <Button
          type="button"
          variant={kind === "staff" ? "default" : "outline"}
          className={kind === "staff" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
          onClick={() => {
            setKind("staff");
            setSearch("");
          }}
        >
          <Shield className="h-4 w-4 mr-2" />
          Staff Accounts
        </Button>
      </div>

      <Card className="border-amber-100">
        <CardHeader className="pb-3">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex gap-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${kind === "general" ? "general/teacher" : "staff"} accounts`}
                className="pl-10"
              />
                          <Button variant="outline" size="icon" onClick={() => fetchAccounts(search)} disabled={loading}>
              <RefreshCw className={`h-1 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            </div>
            <Dialog
              open={createOpen}
              onOpenChange={(open) => {
                setCreateOpen(open);
                if (!open) resetCreateForm();
              }}
            >
              <DialogTrigger asChild>
                <Button className="bg-amber-600 hover:bg-amber-700 text-white">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Account
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    {kind === "general" ? "Create General / Teacher Account" : "Create Staff Account"}
                  </DialogTitle>
                </DialogHeader>

                {kind === "general" && (
                  <div className="grid grid-cols-2 gap-2 rounded-lg border p-1">
                    <Button
                      type="button"
                      variant={createMode === "manual" ? "default" : "ghost"}
                      className={createMode === "manual" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
                      onClick={() => setCreateMode("manual")}
                    >
                      Manual
                    </Button>
                    <Button
                      type="button"
                      variant={createMode === "bulk" ? "default" : "ghost"}
                      className={createMode === "bulk" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
                      onClick={() => setCreateMode("bulk")}
                    >
                      Bulk Upload
                    </Button>
                  </div>
                )}

                {kind === "general" && createMode === "bulk" ? (
                  <div className="space-y-3">
                    <Label htmlFor="generalBulkFile">CSV File</Label>
                    <Input
                      id="generalBulkFile"
                      type="file"
                      accept=".csv"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        void onBulkFileChange(file);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Header format: <span className="font-medium">name,email,phone,password</span>
                    </p>
                    {bulkFileName ? (
                      <p className="text-xs text-muted-foreground">
                        {bulkFileName} • {bulkRows.length} rows ready
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={handleBulkCreate}
                      disabled={saving || bulkRows.length === 0}
                    >
                      {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                      Create Accounts
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="accountName">Full Name *</Label>
                      <Input id="accountName" value={formName} onChange={(event) => setFormName(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="accountEmail">Email *</Label>
                      <Input id="accountEmail" type="email" value={formEmail} onChange={(event) => setFormEmail(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="accountPhone">Phone</Label>
                      <Input id="accountPhone" value={formPhone} onChange={(event) => setFormPhone(event.target.value)} />
                    </div>
                    {kind === "staff" && (
                      <div className="space-y-1.5">
                        <Label>Role *</Label>
                        <Select value={staffRole} onValueChange={setStaffRole}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAFF_ROLES.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor="accountPassword">Password (optional)</Label>
                      <Input
                        id="accountPassword"
                        type="password"
                        placeholder="Leave blank to auto-generate"
                        value={formPassword}
                        onChange={(event) => setFormPassword(event.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={handleManualCreate}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                      Create Account
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>

          {credentials.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="pt-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{credentials.length} credentials generated</p>
                    <p className="text-xs text-muted-foreground">Download and share these credentials securely.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={downloadCredentials}>
                    <Download className="h-4 w-4 mr-1" />
                    Download CSV
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Account</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>New Password (optional)</Label>
                  <Input
                    type="password"
                    placeholder="Leave blank to keep current password"
                    value={editPassword}
                    onChange={(event) => setEditPassword(event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleEdit}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                  Save Changes
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Account</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Delete <span className="font-medium">{deleteTarget?.name}</span>? This action cannot be undone.
              </p>
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete Account
              </Button>
            </DialogContent>
          </Dialog>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((index) => (
                <Card key={index} className="animate-pulse">
                  <CardContent className="h-20" />
                </Card>
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                No accounts found.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {accounts.map((entry) => (
                <Card key={entry.id} className="border-amber-100">
                  <CardContent className="flex items-center gap-3 py-3">
                    <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      {kind === "general" ? <UserRound className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{entry.name}</p>
                        <Badge variant="outline" className={roleBadgeClass[entry.role] || ""}>
                          {entry.role}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{entry.email}</p>
                      {entry.phone ? <p className="text-xs text-muted-foreground">{entry.phone}</p> : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(entry)}>
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setDeleteTarget(entry);
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
