"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AccountOption = {
  id: string;
  ownerName: string | null;
  label: string;
  status: "ACTIVE" | "BLOCKED" | "PENDING_VERIFICATION";
};

type CanteenRoutingRow = {
  id: string;
  name: string;
  location: string | null;
  status: string;
  routing: {
    settlementAccountId: string;
    accountLabel: string;
    accountStatus: string;
    ownerName: string | null;
    overriddenByUserId: string | null;
    overriddenAt: string | null;
  } | null;
};

export default function ManagementPaymentRoutingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canteens, setCanteens] = useState<CanteenRoutingRow[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.status === "ACTIVE"),
    [accounts],
  );

  async function loadData() {
    setLoading(true);
    try {
      const [routingRes, accountRes] = await Promise.all([
        fetch("/api/management/canteen-routing", { cache: "no-store" }),
        fetch("/api/management/settlement-accounts", { cache: "no-store" }),
      ]);

      if (!routingRes.ok || !accountRes.ok) throw new Error("Failed to load routing data");

      const routingData = await routingRes.json();
      const accountData = await accountRes.json();

      setCanteens(routingData.canteens ?? []);
      setAccounts(accountData.accounts ?? []);
    } catch {
      toast.error("Failed to fetch payment routing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function assignRouting(canteenId: string, settlementAccountId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/management/canteen-routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canteenId, settlementAccountId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to assign routing");
      }

      toast.success("Payment routing updated");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign routing");
    } finally {
      setSaving(false);
    }
  }

  async function resetRouting(canteenId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/management/canteen-routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canteenId, resetToDefault: true }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reset routing");
      }

      toast.success("Routing reset to default");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset routing");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payment Routing</CardTitle>
          <CardDescription>
            Reassign canteen payment routing to any active settlement account and reset overrides to default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => void loadData()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading canteen routing...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canteen</TableHead>
                  <TableHead>Current Account</TableHead>
                  <TableHead>Account Owner</TableHead>
                  <TableHead>Override</TableHead>
                  <TableHead>Reassign</TableHead>
                  <TableHead>Reset</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {canteens.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">No canteens available.</TableCell>
                  </TableRow>
                ) : (
                  canteens.map((canteen) => (
                    <TableRow key={canteen.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{canteen.name}</p>
                          <p className="text-xs text-muted-foreground">{canteen.location || "-"}</p>
                        </div>
                      </TableCell>
                      <TableCell>{canteen.routing?.accountLabel || "Default routing"}</TableCell>
                      <TableCell>{canteen.routing?.ownerName || "Auto-resolved"}</TableCell>
                      <TableCell>
                        {canteen.routing?.overriddenByUserId ? (
                          <Badge variant="secondary">Overridden</Badge>
                        ) : (
                          <Badge variant="outline">Default</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <select
                          className="h-9 w-64 rounded-xl border border-input px-3 text-sm"
                          value=""
                          disabled={saving}
                          onChange={(e) => {
                            if (!e.target.value) return;
                            void assignRouting(canteen.id, e.target.value);
                          }}
                        >
                          <option value="">Select active account</option>
                          {activeAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {(account.ownerName || "Unknown")} - {account.label}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => void resetRouting(canteen.id)}
                        >
                          Reset to default
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
