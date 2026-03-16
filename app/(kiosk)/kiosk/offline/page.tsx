"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  clearOfflineActions,
  getPendingOfflineActions,
  markOfflineActionFailed,
  removeOfflineAction,
  type OfflineAction,
} from "@/lib/store/offline-db";
import { printCanteenReceipt } from "@/lib/printer";
import { toast } from "sonner";

export default function KioskOfflineOpsPage() {
  const [actions, setActions] = useState<OfflineAction[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const pending = await getPendingOfflineActions(300);
    setActions(pending);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const counts = {
      KIOSK_ORDER: 0,
      LIBRARY_ISSUE: 0,
      LIBRARY_RETURN: 0,
      GATE_TAP: 0,
    };
    for (const action of actions) {
      counts[action.type] += 1;
    }
    return counts;
  }, [actions]);

  const syncNow = async () => {
    if (actions.length === 0) {
      toast.message("No pending offline actions.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/sync/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions }),
      });

      if (!response.ok) {
        toast.error("Sync request failed.");
        return;
      }

      const data = (await response.json()) as {
        success: boolean;
        processed: { id: string; success: boolean; reason?: string }[];
      };

      const success = data.processed.filter((p) => p.success).map((p) => p.id);
      for (const id of success) {
        await removeOfflineAction(id);
      }

      const failedRows = data.processed.filter((p) => !p.success);
      for (const row of failedRows) {
        await markOfflineActionFailed(row.id, row.reason ?? "Sync failed");
      }

      const failed = data.processed.length - success.length;
      toast.success(`Synced ${success.length} action${success.length === 1 ? "" : "s"}.`);
      if (failed > 0) {
        const reason = failedRows[0]?.reason;
        toast.warning(
          reason
            ? `${failed} action${failed === 1 ? "" : "s"} still pending. First error: ${reason}`
            : `${failed} action${failed === 1 ? "" : "s"} still pending.`,
        );
      }

      await load();
    } catch {
      toast.error("Sync failed. Please check network and retry.");
    } finally {
      setBusy(false);
    }
  };

  const printTest = async () => {
    setBusy(true);
    try {
      await printCanteenReceipt({
        tokenCode: "TEST-001",
        items: [{ name: "Printer Test", quantity: 1, subtotal: 0 }],
        total: 0,
        childName: "SYSTEM",
        isOffline: true,
      });
      toast.success("Test receipt sent.");
    } catch {
      toast.error("Printer test failed. Connect printer from kiosk screen.");
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    setBusy(true);
    try {
      await clearOfflineActions();
      await load();
      toast.success("Offline queue cleared.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-[#1a3a8f]">Kiosk Offline Ops</h1>
        <Link href="/kiosk">
          <Button variant="outline">Back to Kiosk</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queue Summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Total: {actions.length}</Badge>
          <Badge variant="secondary">Kiosk: {grouped.KIOSK_ORDER}</Badge>
          <Badge variant="secondary">Issue: {grouped.LIBRARY_ISSUE}</Badge>
          <Badge variant="secondary">Return: {grouped.LIBRARY_RETURN}</Badge>
          <Badge variant="secondary">Gate: {grouped.GATE_TAP}</Badge>
          <div className="ml-auto flex gap-2">
            <Button onClick={syncNow} disabled={busy}>Sync Now</Button>
            <Button onClick={printTest} disabled={busy} variant="outline">Printer Test</Button>
            <Button onClick={clearAll} disabled={busy} variant="destructive">Clear Queue</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending Actions</CardTitle>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-muted-foreground">No queued actions.</p>
          ) : (
            <div className="space-y-2">
              {actions.map((action) => (
                <div key={action.id} className="border rounded-md p-3 flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge>{action.type}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(action.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground break-all">ID: {action.id}</p>
                    <p className="text-xs text-muted-foreground">Attempts: {action.attempts}</p>
                    {action.lastError ? (
                      <p className="text-xs text-red-600">Last error: {action.lastError}</p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      await removeOfflineAction(action.id);
                      await load();
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
