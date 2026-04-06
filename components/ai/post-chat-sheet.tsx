"use client";

import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  X,
  Send,
  Sparkles,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { BottomSheet } from "@/components/ui/motion";

type Message = { role: "user" | "assistant"; content: string };

export function PostChatSheet({
  postId,
  postTitle,
  postType,
  open,
  onClose,
}: {
  postId: string;
  postTitle: string;
  postType: "ASSIGNMENT" | "NOTE";
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || loading) return;

      const userMsg: Message = { role: "user", content: text };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch(`/api/content/posts/${postId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to get response");
        }

        // Parse SSE
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let assistantText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ") && !line.includes("[DONE]")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.text) assistantText = data.text;
              } catch { /* skip */ }
            }
          }
        }

        if (assistantText) {
          setMessages((prev) => [...prev, { role: "assistant", content: assistantText }]);
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: err instanceof Error ? err.message : "Something went wrong. Please try again.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, postId],
  );

  const suggestions =
    postType === "ASSIGNMENT"
      ? [
          "Summarize this assignment",
          "What are the key requirements?",
          "When is this due?",
          "Explain the main concepts",
        ]
      : [
          "Summarize this note",
          "What are the key takeaways?",
          "Explain in simpler terms",
          "What should I focus on?",
        ];

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      snapPoints={[92]}
      bare
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">AI Assistant</p>
            <p className="text-[10px] text-muted-foreground truncate">
              About: {postTitle}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-950/30 dark:to-purple-950/30">
              <Sparkles className="h-7 w-7 text-violet-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Ask about this {postType.toLowerCase()}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                I have full context of the content and attachments
              </p>
            </div>
            <div className="grid w-full gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  onClick={() => {
                    setInput(s);
                    setTimeout(() => {
                      const form = document.getElementById("post-chat-form") as HTMLFormElement;
                      form?.requestSubmit();
                    }, 50);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-foreground",
              )}
            >
              {msg.role === "assistant" ? (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5"
                  dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                />
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl bg-muted/60 px-4 py-3">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        id="post-chat-form"
        onSubmit={sendMessage}
        className="border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this content..."
            className="flex-1 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/30 focus:ring-1 focus:ring-primary/20"
            disabled={loading}
          />
          <Button
            type="submit"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl"
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}

// Simple markdown formatter
function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^### (.*)$/gm, '<h3 class="text-sm font-semibold mt-2 mb-1">$1</h3>')
    .replace(/^## (.*)$/gm, '<h3 class="text-sm font-semibold mt-2 mb-1">$1</h3>')
    .replace(/^# (.*)$/gm, '<h3 class="text-base font-bold mt-2 mb-1">$1</h3>')
    .replace(/^- (.*)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.*)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/\n/g, "<br />");
}
