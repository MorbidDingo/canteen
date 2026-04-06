"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  getPendingOfflineActions,
  markOfflineActionFailed,
  removeOfflineAction,
  type OfflineAction,
} from "@/lib/store/offline-db";

async function pushBatch(actions: OfflineAction[]) {
  const response = await fetch("/api/sync/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actions }),
  });

  if (!response.ok) {
    throw new Error("Sync API request failed.");
  }

  const data = await response.json() as {
    success: boolean;
    processed: { id: string; success: boolean; reason?: string }[];
  };

  return data;
}

export function SyncManager() {
  const runningRef = useRef(false);

  useEffect(() => {
    const syncNow = async () => {
      if (runningRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      runningRef.current = true;
      try {
        const pending = await getPendingOfflineActions(50);
        if (pending.length === 0) return;

        const data = await pushBatch(pending);
        for (const result of data.processed) {
          if (result.success) {
            await removeOfflineAction(result.id);
          } else {
            await markOfflineActionFailed(result.id, result.reason ?? "Sync failed");
          }
        }

        const successCount = data.processed.filter((p) => p.success).length;
        const failedCount = data.processed.length - successCount;
        if (successCount > 0) {
          toast.success(`Synced ${successCount} offline action${successCount > 1 ? "s" : ""}.`);
        } else if (failedCount > 0) {
          const firstReason = data.processed.find((p) => !p.success)?.reason;
          toast.warning(firstReason ?? "Offline sync attempted but no queued actions could be applied.");
        }
      } catch {
        // Network instability is expected; queue is retained for retry.
      } finally {
        runningRef.current = false;
      }
    };

    const onlineHandler = () => {
      void syncNow();
    };

    window.addEventListener("online", onlineHandler);
    const timer = setInterval(() => {
      void syncNow();
    }, 20_000);

    void syncNow();

    return () => {
      window.removeEventListener("online", onlineHandler);
      clearInterval(timer);
    };
  }, []);

  return null;
}
