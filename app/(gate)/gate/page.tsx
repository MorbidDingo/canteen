"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import {
  CheckCircle2,
  XCircle,
  LogIn,
  LogOut,
  CreditCard,
  Shield,
  WifiOff,
} from "lucide-react";
import { GATE_DIRECTION_LABELS, type GateDirection } from "@/lib/constants";
import { enqueueOfflineAction } from "@/lib/store/offline-db";

type StudentInfo = {
  id: string;
  name: string;
  grNumber: string | null;
  className: string | null;
  section: string | null;
  image: string | null;
};

type TapResult = {
  student: StudentInfo;
  direction: GateDirection;
  tappedAt: string;
} | null;

type TapError = {
  error: string;
  student?: Pick<StudentInfo, "name" | "image" | "grNumber" | "className" | "section">;
} | null;

const DISPLAY_DURATION_MS = 5000; // show result for 5 seconds then reset

export default function GatePage() {
  const [phase, setPhase] = useState<"idle" | "loading" | "result" | "error" | "offline-queued">(
    "idle",
  );
  const [result, setResult] = useState<TapResult>(null);
  const [error, setError] = useState<TapError>(null);
  const [offlineId, setOfflineId] = useState<string | null>(null);
  const rfidInputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep RFID input focused
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        rfidInputRef.current &&
        document.activeElement !== rfidInputRef.current
      ) {
        rfidInputRef.current.focus();
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const resetToIdle = useCallback(() => {
    setPhase("idle");
    setResult(null);
    setError(null);
    setOfflineId(null);
    if (rfidInputRef.current) {
      rfidInputRef.current.value = "";
      rfidInputRef.current.focus();
    }
  }, []);

  const handleCardTap = useCallback(
    async (rfidCardId: string) => {
      if (!rfidCardId.trim()) return;

      // Clear any pending reset
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }

      setPhase("loading");
      setResult(null);
      setError(null);

      try {
        const res = await fetch("/api/gate/tap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rfidCardId: rfidCardId.trim() }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data);
          setPhase("error");
        } else {
          setResult(data);
          setPhase("result");
        }
      } catch {
        // Network failure — queue the tap for offline sync
        try {
          const queued = await enqueueOfflineAction({
            type: "GATE_TAP",
            payload: { rfidCardId: rfidCardId.trim() },
          });
          setOfflineId(queued.id.slice(0, 6).toUpperCase());
          setPhase("offline-queued");
        } catch {
          setError({ error: "Offline — tap could not be saved" });
          setPhase("error");
        }
      }

      // Clear RFID input
      if (rfidInputRef.current) {
        rfidInputRef.current.value = "";
      }

      // Auto-reset after display duration
      resetTimerRef.current = setTimeout(resetToIdle, DISPLAY_DURATION_MS);
    },
    [resetToIdle],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const value = (e.target as HTMLInputElement).value;
        handleCardTap(value);
      }
    },
    [handleCardTap],
  );

  // Current time display
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8 relative select-none">
      {/* Hidden RFID input — always focused */}
      <input
        ref={rfidInputRef}
        type="text"
        autoFocus
        onKeyDown={handleKeyDown}
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
        aria-label="RFID card input"
        tabIndex={-1}
      />

      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Gate Check</h1>
        </div>
        <p className="text-muted-foreground">
          {currentTime.toLocaleDateString("en-IN", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
          {" • "}
          {currentTime.toLocaleTimeString("en-IN")}
        </p>
      </div>

      {/* ── Idle: Waiting for tap ────────────────────────── */}
      {phase === "idle" && (
        <div className="flex flex-col items-center gap-6 animate-fade-in">
          <div className="w-40 h-40 rounded-full border-4 border-dashed border-primary/40 flex items-center justify-center animate-pulse">
            <CreditCard className="h-16 w-16 text-primary/60" />
          </div>
          <p className="text-xl font-medium text-muted-foreground">
            Tap Student Card
          </p>
          <p className="text-sm text-muted-foreground/70">
            Awaiting RFID card scan…
          </p>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────── */}
      {phase === "loading" && (
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-24 h-24 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-lg text-muted-foreground">Verifying…</p>
        </div>
      )}

      {/* ── Success Result ───────────────────────────────── */}
      {phase === "result" && result && (
        <div className="flex flex-col items-center gap-6 animate-scale-in max-w-md w-full">
          {/* Direction badge */}
          <div
            className={`flex items-center gap-2 px-6 py-3 rounded-full text-lg font-bold ${
              result.direction === "ENTRY"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-orange-500/15 text-orange-600 dark:text-orange-400"
            }`}
          >
            {result.direction === "ENTRY" ? (
              <LogIn className="h-6 w-6" />
            ) : (
              <LogOut className="h-6 w-6" />
            )}
            {GATE_DIRECTION_LABELS[result.direction]}
          </div>

          {/* Student photo */}
          <div className="w-48 h-48 rounded-2xl overflow-hidden border-4 border-border bg-muted flex items-center justify-center shadow-lg">
            {result.student.image ? (
              <Image
                src={result.student.image}
                alt={result.student.name}
                width={192}
                height={192}
                className="object-cover w-full h-full"
                priority
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <XCircle className="h-12 w-12" />
                <span className="text-xs">No Photo</span>
              </div>
            )}
          </div>

          {/* Student info */}
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold text-foreground">
              {result.student.name}
            </h2>
            {result.student.grNumber && (
              <p className="text-sm text-muted-foreground">
                GR: {result.student.grNumber}
              </p>
            )}
            {(result.student.className || result.student.section) && (
              <p className="text-sm text-muted-foreground">
                {[result.student.className, result.student.section]
                  .filter(Boolean)
                  .join(" — ")}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 text-emerald-500">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">Verified</span>
          </div>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────── */}
      {phase === "error" && error && (
        <div className="flex flex-col items-center gap-6 animate-scale-in max-w-md w-full">
          {/* If we have student info (cooldown case), still show photo */}
          {error.student?.image && (
            <div className="w-36 h-36 rounded-2xl overflow-hidden border-4 border-orange-300 dark:border-orange-700 bg-muted flex items-center justify-center shadow-lg">
              <Image
                src={error.student.image}
                alt={error.student.name ?? "Student"}
                width={144}
                height={144}
                className="object-cover w-full h-full"
                priority
              />
            </div>
          )}

          {error.student?.name && (
            <h2 className="text-xl font-bold text-foreground">
              {error.student.name}
            </h2>
          )}

          <div className="flex items-center gap-2 px-6 py-3 rounded-full bg-destructive/15 text-destructive text-lg font-semibold">
            <XCircle className="h-6 w-6" />
            {error.error}
          </div>
        </div>
      )}

      {/* ── Offline Queued ───────────────────────────────── */}
      {phase === "offline-queued" && (
        <div className="flex flex-col items-center gap-6 animate-scale-in max-w-md w-full">
          <div className="w-28 h-28 rounded-full bg-amber-500/15 flex items-center justify-center">
            <WifiOff className="h-12 w-12 text-amber-500" />
          </div>
          <p className="text-xl font-semibold text-amber-600 dark:text-amber-400">
            Saved Offline
          </p>
          {offlineId && (
            <p className="text-sm text-muted-foreground">
              Queue ID: {offlineId}
            </p>
          )}
          <p className="text-sm text-muted-foreground text-center">
            This tap will be synced automatically when the network returns.
          </p>
        </div>
      )}

      {/* Footer note */}
      <p className="absolute bottom-4 text-xs text-muted-foreground/50">
        certe — Gate Verification System
      </p>
    </div>
  );
}
