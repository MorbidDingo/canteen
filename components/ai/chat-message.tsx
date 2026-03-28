"use client";

import { cn } from "@/lib/utils";
import { motion } from "@/components/ui/motion";
import { Bot, User } from "lucide-react";
import { ChatActions, type ChatAction } from "./chat-actions";

export type ChatRole = "user" | "assistant";

export interface ChatMessageData {
  id: string;
  role: ChatRole;
  content: string;
  isStreaming?: boolean;
  actions?: ChatAction[];
}

// ─── Minimal Markdown Renderer ──────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    nodes.push(
      <ul key={`list-${nodes.length}`} className="my-1.5 ml-4 list-disc space-y-0.5 text-[13px]">
        {listBuffer.map((item, i) => (
          <li key={i}>{inlineFormat(item)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Bullet list items
    if (/^[\-\*]\s+/.test(line)) {
      listBuffer.push(line.replace(/^[\-\*]\s+/, ""));
      continue;
    }

    flushList();

    // Empty line
    if (line.trim() === "") {
      nodes.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    // Bold heading line (e.g. **Title**)
    if (/^\*\*[^*]+\*\*$/.test(line.trim())) {
      nodes.push(
        <p key={`h-${i}`} className="mt-2 mb-1 text-[13px] font-semibold">
          {line.trim().replace(/\*\*/g, "")}
        </p>,
      );
      continue;
    }

    // Regular paragraph
    nodes.push(
      <p key={`p-${i}`} className="text-[13px] leading-relaxed">
        {inlineFormat(line)}
      </p>,
    );
  }

  flushList();
  return nodes;
}

/** Format inline bold/italic/code */
function inlineFormat(text: string): React.ReactNode {
  // Split on **bold**, *italic*, and `code` patterns
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-muted px-1 py-0.5 text-[12px] font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

// ─── ChatMessage Component ──────────────────────────────

export function ChatMessage({ message }: { message: ChatMessageData }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn(
        "flex gap-2.5",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary/15 text-primary"
            : "bg-primary/10 text-primary",
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted/80 text-foreground",
        )}
      >
        {isUser ? (
          <p className="text-[13px] leading-relaxed">{message.content}</p>
        ) : (
          <div className="space-y-0.5">
            {message.content && renderMarkdown(message.content)}
            {message.actions && message.actions.length > 0 && (
              <ChatActions actions={message.actions} />
            )}
            {message.isStreaming && (
              <span className="inline-flex gap-0.5 pt-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60 [animation-delay:300ms]" />
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
