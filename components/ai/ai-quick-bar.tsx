"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "@/components/ui/motion";
import { Sparkles, Loader2, X } from "lucide-react";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { ChatActions, type ChatAction } from "./chat-actions";

// ─── Quick Action Chips ─────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Today's picks", prompt: "What should I order today?", icon: "🍱" },
  { label: "Healthy options", prompt: "Show me the healthiest items available", icon: "🥗" },
  { label: "Budget meal", prompt: "What can I get under ₹50?", icon: "💰" },
  { label: "Popular now", prompt: "What's trending today?", icon: "🔥" },
  { label: "Wallet check", prompt: "How's my wallet balance and forecast?", icon: "💳" },
] as const;

// ─── Component ──────────────────────────────────────────

export function AiQuickBar() {
  const certePlusActive = useCertePlusStore((s) => s.status?.active === true);
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<{
    text: string;
    actions: ChatAction[];
  } | null>(null);

  const runQuickAction = useCallback(
    async (prompt: string, label: string) => {
      if (loading) return;
      setLoading(label);
      setResult(null);

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!res.ok) {
          setResult({ text: "Unable to get suggestions right now.", actions: [] });
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        let actions: ChatAction[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.type === "text") accumulated += parsed.text;
              if (parsed.type === "actions") actions = parsed.actions;
            } catch {
              // skip
            }
          }
        }

        setResult({ text: accumulated, actions });
      } catch {
        setResult({ text: "Something went wrong.", actions: [] });
      } finally {
        setLoading(null);
      }
    },
    [loading],
  );

  if (!certePlusActive) return null;

  return (
    <div className="space-y-3">
      {/* Chip Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled={loading !== null}
            onClick={() => void runQuickAction(action.prompt, action.label)}
            className="flex items-center gap-1.5 shrink-0 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-[12px] font-medium transition-all hover:bg-muted/80 hover:border-primary/30 active:scale-[0.97] disabled:opacity-50"
          >
            {loading === action.label ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <span>{action.icon}</span>
            )}
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Inline Result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-primary/15 bg-primary/[0.03] p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] leading-relaxed text-foreground">
                  {result.text}
                </p>
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="shrink-0 rounded-full p-1 hover:bg-muted transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              {result.actions.length > 0 && (
                <ChatActions actions={result.actions} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
