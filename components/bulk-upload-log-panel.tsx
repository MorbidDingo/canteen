"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

type UploadLogRow = {
  row: number;
  status: "created" | "skipped" | "error";
  message: string;
  processed: number;
  total: number;
};

export function BulkUploadLogPanel({
  logs,
  title = "Live Processing Logs",
}: {
  logs: UploadLogRow[];
  title?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <p className="text-sm font-semibold">{title}</p>
        <Badge variant="secondary">{logs.length} events</Badge>
      </div>
      <div className="max-h-64 overflow-y-auto p-2">
        {logs.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">Waiting for processing logs...</p>
        ) : (
          <div className="space-y-1">
            {logs.map((log, idx) => (
              <div key={`${log.row}-${idx}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
                {log.status === "created" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                ) : log.status === "skipped" ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-600" />
                )}
                <span className="font-mono text-muted-foreground">row {log.row}</span>
                <span className="truncate">{log.message}</span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {log.processed}/{log.total}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
