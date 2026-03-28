"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
import { useSession } from "@/lib/auth-client";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { Button } from "@/components/ui/button";
import {
  AnimatePresence,
  motion,
  spring,
  BottomSheet,
} from "@/components/ui/motion";
import { ChatMessage, type ChatMessageData } from "./chat-message";
import type { ChatAction } from "./chat-actions";
import {
  X,
  Send,
  Sparkles,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Suggested Prompts ──────────────────────────────────

const SUGGESTED_PROMPTS = [
  { label: "What's healthy today?", icon: "🥗" },
  { label: "Show my spending this week", icon: "📊" },
  { label: "Order my usual lunch", icon: "🍱" },
  { label: "What's popular right now?", icon: "🔥" },
] as const;

// ─── Types ──────────────────────────────────────────────

type ApiMessage = { role: "user" | "assistant"; content: string };

type Child = {
  id: string;
  name: string;
};

// ─── ChatAssistant ──────────────────────────────────────

export function ChatAssistant({
  open: controlledOpen,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { data: session } = useSession();
  const certePlusActive = useCertePlusStore((s) => s.status?.active === true);

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ApiMessage[]>(
    [],
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-detect mobile
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Fetch children on first open
  useEffect(() => {
    if (!open || children.length > 0) return;
    fetch("/api/children", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { children: Child[] } | null) => {
        if (data?.children) {
          setChildren(data.children);
          if (data.children.length === 1) {
            setSelectedChildId(data.children[0].id);
          }
        }
      })
      .catch(() => {});
  }, [open, children.length]);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  // ─── Send Message ───────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessageData = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
      };

      const newHistory: ApiMessage[] = [
        ...conversationHistory,
        { role: "user" as const, content: text.trim() },
      ];

      setMessages((prev) => [...prev, userMsg]);
      setConversationHistory(newHistory);
      setInput("");
      setIsLoading(true);

      const assistantId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", isStreaming: true },
      ]);

      try {
        abortRef.current = new AbortController();

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newHistory,
            childId: selectedChildId,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          const errorText =
            err?.message || err?.error || "Something went wrong. Please try again.";

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: errorText, isStreaming: false }
                : m,
            ),
          );
          setIsLoading(false);
          return;
        }

        // Read SSE stream
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        let pendingActions: ChatAction[] = [];

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
              const parsed = JSON.parse(jsonStr) as
                | { type: "text"; text: string }
                | { type: "actions"; actions: ChatAction[] }
                | { type: "done" };

              if (parsed.type === "text") {
                accumulated += parsed.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: accumulated, isStreaming: true }
                      : m,
                  ),
                );
              }

              if (parsed.type === "actions") {
                pendingActions = parsed.actions;
              }

              if (parsed.type === "done") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, isStreaming: false, actions: pendingActions.length > 0 ? pendingActions : undefined }
                      : m,
                  ),
                );
                setConversationHistory((prev) => [
                  ...prev,
                  { role: "assistant", content: accumulated },
                ]);
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }

        // Mark done in case "done" event was missed
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m,
          ),
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, isStreaming: false } : m,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: "Sorry, something went wrong. Please try again.",
                    isStreaming: false,
                  }
                : m,
            ),
          );
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [conversationHistory, isLoading, selectedChildId],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  // ─── Don't render if not authenticated ──────────────

  if (!session?.user) return null;

  // ─── Chat Panel Content (shared between mobile/desktop) ─

  const chatContent = (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-tight">
              Certe+ Assistant
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Powered by AI
            </p>
          </div>
        </div>

        {/* Child Selector (multi-child only) */}
        {children.length > 1 && (
          <select
            value={selectedChildId ?? ""}
            onChange={(e) => setSelectedChildId(e.target.value || null)}
            className="h-8 rounded-lg border border-border/60 bg-background px-2 text-[12px] outline-none focus:ring-1 focus:ring-primary/40"
          >
            <option value="">All children</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {!isMobile && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">Hi there! 👋</p>
              <p className="mt-1 max-w-[240px] text-[12px] text-muted-foreground">
                I can help you with the menu, orders, spending insights, and
                recommendations.
              </p>
            </div>

            {/* Suggested Prompts */}
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt.label}
                  type="button"
                  onClick={() => void sendMessage(prompt.label)}
                  className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-muted/80 active:scale-[0.97]"
                >
                  <span>{prompt.icon}</span>
                  <span>{prompt.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border/50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            disabled={isLoading}
            className="flex-1 rounded-xl border border-border/60 bg-muted/40 px-3.5 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary/40 disabled:opacity-60"
            maxLength={500}
          />
          <Button
            type="submit"
            size="icon-sm"
            disabled={!input.trim() || isLoading}
            className="shrink-0 rounded-xl"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );

  // ─── Upgrade Prompt (non-subscribers) ───────────────

  if (!certePlusActive) {
    return (
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={spring.snappy}
              className="fixed right-4 top-16 z-50 w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-border/60 bg-background p-5 shadow-xl"
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-base font-bold">
                  Unlock AI Assistant
                </h3>
                <p className="text-[13px] text-muted-foreground">
                  Get personalized recommendations, spending insights, and
                  voice ordering with Certe+.
                </p>
                <Button
                  variant="premium"
                  size="lg"
                  className="mt-1 w-full"
                  onClick={() => {
                    setOpen(false);
                    window.location.href = "/settings";
                  }}
                >
                  Upgrade to Certe+
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  // ─── Chat Panel (subscribers) ───────────────────────

  return (
    <>
      {/* Desktop: Dropdown Panel below header */}
      {!isMobile && (
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40"
                onClick={() => setOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={spring.snappy}
                className="fixed right-4 top-16 z-50 flex max-h-[min(560px,calc(100dvh-5rem))] w-[380px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/95 shadow-xl backdrop-blur-2xl"
              >
                {chatContent}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}

      {/* Mobile: Bottom Sheet */}
      {isMobile && (
        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          snapPoints={[92]}
          bare
        >
          {chatContent}
        </BottomSheet>
      )}
    </>
  );
}
