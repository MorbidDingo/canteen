"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  AnimatePresence,
  motion,
  spring,
  BottomSheet,
} from "@/components/ui/motion";
import { ChatMessage, type ChatMessageData } from "@/components/ai/chat-message";
import { MessageSquare, X, Send, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Admin-Specific Suggested Prompt Categories ─────────

interface PromptItem {
  label: string;
  icon: string;
}

interface PromptCategory {
  title: string;
  prompts: PromptItem[];
}

const ADMIN_PROMPT_CATEGORIES: PromptCategory[] = [
  {
    title: "Canteen Control",
    prompts: [
      { label: "Close all canteens", icon: "🔒" },
      { label: "Open all canteens", icon: "🔓" },
      { label: "Show canteen status", icon: "🏪" },
    ],
  },
  {
    title: "Menu & Stock",
    prompts: [
      { label: "Mark all items unavailable", icon: "🚫" },
      { label: "Make all items available", icon: "✅" },
      { label: "Show items running low on stock", icon: "📉" },
      { label: "Set stock to 50 for all snack items", icon: "📦" },
    ],
  },
  {
    title: "Order Operations",
    prompts: [
      { label: "Start preparing all placed orders", icon: "👨‍🍳" },
      { label: "Cancel all placed orders", icon: "❌" },
      { label: "Show all active orders", icon: "📋" },
    ],
  },
  {
    title: "Insights",
    prompts: [
      { label: "How much to prep today?", icon: "🔮" },
      { label: "Revenue trend this week", icon: "📈" },
      { label: "Show waste analysis", icon: "♻️" },
    ],
  },
];

// ─── Types ──────────────────────────────────────────────

type ApiMessage = { role: "user" | "assistant"; content: string };

// ─── AdminChatAssistant ─────────────────────────────────

export function AdminChatAssistant() {
  const { data: session } = useSession();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ApiMessage[]>(
    [],
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

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

        const res = await fetch("/api/admin/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: newHistory }),
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

              if (parsed.type === "done") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, isStreaming: false }
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
    [conversationHistory, isLoading],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  // ─── Don't render if not authenticated ──────────────

  if (!session?.user) return null;

  // ─── Chat Panel Content ─────────────────────────────

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
              Admin Assistant
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Powered by AI
            </p>
          </div>
        </div>

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
              <p className="text-sm font-semibold">Admin Assistant 👋</p>
              <p className="mt-1 max-w-[240px] text-[12px] text-muted-foreground">
                I can help with prep forecasts, revenue insights, item
                analytics, and waste tracking.
              </p>
            </div>

            {/* Categorized Suggested Prompts */}
            <div className="mt-3 w-full space-y-3 px-2">
              {ADMIN_PROMPT_CATEGORIES.map((category) => (
                <div key={category.title}>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {category.title}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {category.prompts.map((prompt) => (
                      <button
                        key={prompt.label}
                        type="button"
                        onClick={() => void sendMessage(prompt.label)}
                        className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] font-medium transition-all hover:bg-primary/10 hover:border-primary/30 active:scale-[0.97]"
                      >
                        <span className="text-xs">{prompt.icon}</span>
                        <span>{prompt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
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
            placeholder="Ask about your canteen..."
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

  // ─── Render ─────────────────────────────────────────

  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90",
          "bottom-20 right-4 md:bottom-6 md:right-6",
        )}
        aria-label={open ? "Close admin chat" : "Open admin chat"}
      >
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span
              key="chat"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <MessageSquare className="h-6 w-6" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Desktop: Panel above FAB */}
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
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={spring.snappy}
                className="fixed right-6 bottom-24 z-50 flex max-h-[min(560px,calc(100dvh-8rem))] w-[380px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/95 shadow-xl backdrop-blur-2xl"
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
