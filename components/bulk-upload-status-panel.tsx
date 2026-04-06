"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

type StageState = "pending" | "active" | "done";

export type UploadStage = {
  key: string;
  label: string;
  state: StageState;
  progress?: number;
};

export function BulkUploadStatusPanel({
  uploadPercent,
  stages,
  statusText,
}: {
  uploadPercent: number;
  stages: UploadStage[];
  statusText?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(uploadPercent)));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-3">
        <div className="relative h-16 w-16 shrink-0">
          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={radius} className="stroke-muted" strokeWidth="6" fill="none" />
            <circle
              cx="32"
              cy="32"
              r={radius}
              className="stroke-[#d4891a]"
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold">{pct}%</div>
        </div>

        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold">Upload Progress</p>
          <p className="text-xs text-muted-foreground">{statusText || "Preparing upload"}</p>
          <Badge variant="secondary" className="text-[11px]">
            {pct === 100 ? "Upload complete" : "Uploading file"}
          </Badge>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="flex min-w-max items-center gap-2">
          {stages.map((stage, idx) => {
            const isDone = stage.state === "done";
            const isActive = stage.state === "active";
            const progress = Math.max(0, Math.min(100, Math.round(stage.progress ?? (isDone ? 100 : 0))));
            return (
              <div key={stage.key} className="flex items-center gap-2">
                <div
                  className={cn(
                    "relative flex h-8 items-center overflow-hidden rounded-full border px-3 text-xs font-medium whitespace-nowrap",
                    isDone && "border-green-500/40 bg-green-50 text-green-700",
                    isActive && "border-[#d4891a]/40 bg-[#d4891a]/10 text-[#d4891a]",
                    !isDone && !isActive && "border-muted-foreground/30 text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 transition-all duration-300",
                      isDone ? "bg-green-500/20" : "bg-[#d4891a]/20",
                    )}
                    style={{ width: `${progress}%` }}
                  />
                  <span className="relative z-10 flex items-center">
                    {isDone ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : null}
                    {stage.label}
                    <span className="ml-1 text-[10px] opacity-80">{progress}%</span>
                  </span>
                </div>
                {idx < stages.length - 1 ? (
                  <div className={cn("h-px w-8", isDone ? "bg-green-500/50" : "bg-muted-foreground/30")} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
