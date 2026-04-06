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
  {
    label: "Healthy options",
    prompt: "Show me the healthiest items available",
    icon: "🥗",
  },
  { label: "Budget meal", prompt: "What can I get under ₹50?", icon: "💰" },
  { label: "Popular now", prompt: "What's trending today?", icon: "🔥" },
  {
    label: "Wallet check",
    prompt: "How's my wallet balance and forecast?",
    icon: "💳",
  },
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
          setResult({
            text: "Unable to get suggestions right now.",
            actions: [],
          });
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

  return <div></div>;
}
