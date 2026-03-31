"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
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

type OverviewResponse = {
  window: "daily" | "weekly" | "monthly";
  summary: {
    totalCollected: number;
    totalPlatformFees: number;
    totalSettled: number;
    pending: number;
  };
  perAdmin: Array<{
    userId: string;
    adminName: string;
    canteens: number;
    gross: number;
    fee: number;
    net: number;
    lastSettledAt: string | null;
  }>;
  batches: Array<{
    id: string;
    totalGross: number;
    totalFee: number;
    totalNet: number;
    orderCount: number;
    status: "PENDING" | "PROCESSING" | "SETTLED" | "FAILED" | "PARTIALLY_FAILED";
    razorpayPayoutId: string | null;
    processedAt: string | null;
    failureReason: string | null;
    createdAt: string;
    accountLabel: string;
    ownerName: string;
  }>;
  unroutedFunds: Array<{
    canteenId: string;
    canteenName: string;
    entryCount: number;
    gross: number;
    fee: number;
    net: number;
  }>;
  canteensWithoutRouting: Array<{ id: string; name: string }>;
};

type BatchEntry = {
  id: string;
  orderId: string | null;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  entryType: "DEBIT" | "REVERSAL";
  status: "PENDING" | "PROCESSING" | "SETTLED" | "FAILED";
  createdAt: string;
};

function rupees(value: number) {
  return `Rs ${value.toFixed(2)}`;
}

function fmtDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function statusVariant(status: string) {
  if (status === "SETTLED" || status === "ACTIVE") return "default" as const;
  if (status === "FAILED" || status === "BLOCKED" || status === "PARTIALLY_FAILED") return "destructive" as const;
  return "secondary" as const;
}

export default function ManagementSettlementsPage() {
  const [windowKey, setWindowKey] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [entriesNote, setEntriesNote] = useState<string | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(false);

  async function loadOverview(nextWindow: "daily" | "weekly" | "monthly") {
    setLoading(true);
    try {
      const res = await fetch(`/api/management/settlements/overview?window=${nextWindow}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch settlement overview");
      const payload = (await res.json()) as OverviewResponse;
      setData(payload);
    } catch {
      toast.error("Failed to load settlement dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview(windowKey);
  }, [windowKey]);

  async function openBatch(batchId: string) {
    setSelectedBatchId(batchId);
    setEntriesLoading(true);
    setEntries([]);
    setEntriesNote(null);
    try {
      const res = await fetch(`/api/management/settlements/batches/${batchId}`, { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load batch entries");
      }
      const payload = await res.json();
      setEntries(payload.entries ?? []);
      setEntriesNote(payload.note ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load batch entries");
    } finally {
      setEntriesLoading(false);
    }
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Settlement Overview</CardTitle>
          <CardDescription>
            Track collection, fee, settlement progress, and unrouted funds across the organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={windowKey === "daily" ? "default" : "outline"} size="sm" onClick={() => setWindowKey("daily")}>Daily</Button>
            <Button variant={windowKey === "weekly" ? "default" : "outline"} size="sm" onClick={() => setWindowKey("weekly")}>Weekly</Button>
            <Button variant={windowKey === "monthly" ? "default" : "outline"} size="sm" onClick={() => setWindowKey("monthly")}>Monthly</Button>
            <Button variant="outline" size="sm" onClick={() => void loadOverview(windowKey)}>Refresh</Button>
          </div>

          {loading || !data ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading settlement metrics...
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Total Collected</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{rupees(data.summary.totalCollected)}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Total Platform Fees</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{rupees(data.summary.totalPlatformFees)}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Total Settled</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{rupees(data.summary.totalSettled)}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Pending</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{rupees(data.summary.pending)}</p></CardContent>
                </Card>
              </div>

              {data.unroutedFunds.length > 0 || data.canteensWithoutRouting.length > 0 ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-amber-900 font-medium">
                    <AlertTriangle className="h-4 w-4" /> Unrouted funds warning
                  </div>
                  <p className="text-sm text-amber-800 mt-1">
                    Some canteen payments are not routed to an active settlement account.
                  </p>
                  {data.unroutedFunds.length > 0 ? (
                    <ul className="text-sm text-amber-900 mt-2 list-disc pl-5">
                      {data.unroutedFunds.map((row) => (
                        <li key={row.canteenId}>{row.canteenName}: {rupees(row.net)} pending across {row.entryCount} entries</li>
                      ))}
                    </ul>
                  ) : null}
                  {data.canteensWithoutRouting.length > 0 ? (
                    <p className="text-xs text-amber-900 mt-2">
                      Canteens without explicit routing: {data.canteensWithoutRouting.map((row) => row.name).join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle>Per-Admin Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Admin</TableHead>
                        <TableHead>Canteens</TableHead>
                        <TableHead>Gross</TableHead>
                        <TableHead>Fee</TableHead>
                        <TableHead>Net</TableHead>
                        <TableHead>Last Settled</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.perAdmin.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No admin settlement data in selected window.</TableCell></TableRow>
                      ) : (
                        data.perAdmin.map((row) => (
                          <TableRow key={row.userId}>
                            <TableCell>{row.adminName}</TableCell>
                            <TableCell>{row.canteens}</TableCell>
                            <TableCell>{rupees(row.gross)}</TableCell>
                            <TableCell>{rupees(row.fee)}</TableCell>
                            <TableCell>{rupees(row.net)}</TableCell>
                            <TableCell>{fmtDate(row.lastSettledAt)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Batch History</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Admin</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Orders</TableHead>
                        <TableHead>Gross</TableHead>
                        <TableHead>Fee</TableHead>
                        <TableHead>Net</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Drill-down</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.batches.length === 0 ? (
                        <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No settlement batches found.</TableCell></TableRow>
                      ) : (
                        data.batches.map((batch) => (
                          <TableRow key={batch.id}>
                            <TableCell>{fmtDate(batch.createdAt)}</TableCell>
                            <TableCell>{batch.ownerName}</TableCell>
                            <TableCell>{batch.accountLabel}</TableCell>
                            <TableCell>{batch.orderCount}</TableCell>
                            <TableCell>{rupees(batch.totalGross)}</TableCell>
                            <TableCell>{rupees(batch.totalFee)}</TableCell>
                            <TableCell>{rupees(batch.totalNet)}</TableCell>
                            <TableCell><Badge variant={statusVariant(batch.status)}>{batch.status.replaceAll("_", " ")}</Badge></TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline" onClick={() => void openBatch(batch.id)}>View</Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Batch Drill-down</CardTitle>
                  <CardDescription>{selectedBatchId ? `Selected batch: ${selectedBatchId}` : "Select a batch to view entry details"}</CardDescription>
                </CardHeader>
                <CardContent>
                  {entriesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading batch entries...
                    </div>
                  ) : (
                    <>
                      {entriesNote ? <p className="text-sm text-muted-foreground mb-3">{entriesNote}</p> : null}
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
                          {entries.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No entry rows to show.</TableCell></TableRow>
                          ) : (
                            entries.map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell>{entry.orderId ? entry.orderId.slice(0, 8) : "-"}</TableCell>
                                <TableCell>{entry.entryType}</TableCell>
                                <TableCell>{rupees(entry.grossAmount)}</TableCell>
                                <TableCell>{rupees(entry.platformFee)}</TableCell>
                                <TableCell>{rupees(entry.netAmount)}</TableCell>
                                <TableCell><Badge variant={statusVariant(entry.status)}>{entry.status}</Badge></TableCell>
                                <TableCell>{fmtDate(entry.createdAt)}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
