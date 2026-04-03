"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
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

type ApiMessage = { role: "user" | "assistant"; content: string };

const TIMETABLE_PROMPTS = [
  { label: "Show all conflicts", icon: "⚠️" },
  { label: "Optimize teacher workload", icon: "📊" },
  { label: "Move Math to mornings", icon: "☀️" },
  { label: "Get optimization suggestions", icon: "💡" },
  { label: "Show teacher fatigue report", icon: "😓" },
  { label: "Swap two classes", icon: "🔄" },
];

export function TimetableChat({
  timetableId,
  onDataChanged,
}: {
  timetableId: string;
  onDataChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ApiMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // Reset chat when timetable changes
  useEffect(() => {
    setMessages([]);
    setConversationHistory([]);
  }, [timetableId]);

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
        { role: "user", content: text.trim() },
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
        const res = await fetch("/api/management/timetable/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timetableId, messages: newHistory }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: err?.error || "Something went wrong.", isStreaming: false }
                : m,
            ),
          );
          setIsLoading(false);
          return;
        }

        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: data.reply || "Done.", isStreaming: false }
              : m,
          ),
        );
        setConversationHistory((prev) => [
          ...prev,
          { role: "assistant", content: data.reply || "" },
        ]);

        if (data.toolsUsed && onDataChanged) {
          onDataChanged();
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "Sorry, something went wrong.", isStreaming: false }
              : m,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [conversationHistory, isLoading, timetableId, onDataChanged],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const chatContent = (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
            <Sparkles className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-tight">Timetable AI</h3>
            <p className="text-[11px] text-muted-foreground">Move classes, resolve conflicts & more</p>
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

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
              <Sparkles className="h-7 w-7 text-amber-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">Timetable Assistant 🗓️</p>
              <p className="mt-1 max-w-[240px] text-[12px] text-muted-foreground">
                I can move classes, swap slots, resolve conflicts, and optimize your timetable.
              </p>
            </div>
            <div className="mt-3 w-full px-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Quick Actions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TIMETABLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt.label}
                    type="button"
                    onClick={() => void sendMessage(prompt.label)}
                    className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] font-medium transition-all hover:bg-amber-50 hover:border-amber-300 active:scale-[0.97]"
                  >
                    <span className="text-xs">{prompt.icon}</span>
                    <span>{prompt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border/50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your timetable..."
            disabled={isLoading}
            className="flex-1 rounded-xl border border-border/60 bg-muted/40 px-3.5 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-amber-400 disabled:opacity-60"
            maxLength={500}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="shrink-0 rounded-xl h-10 w-10 bg-amber-600 hover:bg-amber-700"
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

  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 text-white shadow-lg transition-colors hover:bg-amber-700",
          "bottom-20 right-4 md:bottom-6 md:right-6",
        )}
        aria-label={open ? "Close timetable chat" : "Open timetable chat"}
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
