"use client";

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  useEditorAIStore,
  type EditorAIAction,
} from "@/lib/stores/editor-ai-store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  Pencil,
  FileText,
  ArrowDown,
  ArrowUp,
  Scissors,
  Wrench,
  MessageSquare,
  Globe,
  Theater,
  ClipboardList,
  Lightbulb,
  Check,
  RotateCcw,
  X,
  Loader2,
  Send,
} from "lucide-react";

interface AISidebarProps {
  onAccept: (text: string) => void;
}

const AI_ACTIONS: {
  action: EditorAIAction;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    action: "improve",
    label: "Improve",
    icon: <Pencil className="h-4 w-4" />,
    description: "Enhance clarity and flow",
  },
  {
    action: "continue",
    label: "Continue",
    icon: <FileText className="h-4 w-4" />,
    description: "Write the next paragraphs",
  },
  {
    action: "summarize",
    label: "Summarize",
    icon: <ArrowDown className="h-4 w-4" />,
    description: "Condense to key points",
  },
  {
    action: "expand",
    label: "Expand",
    icon: <ArrowUp className="h-4 w-4" />,
    description: "Add more detail",
  },
  {
    action: "shorten",
    label: "Shorten",
    icon: <Scissors className="h-4 w-4" />,
    description: "Cut by ~50%",
  },
  {
    action: "fix_grammar",
    label: "Fix Grammar",
    icon: <Wrench className="h-4 w-4" />,
    description: "Correct errors",
  },
  {
    action: "simplify",
    label: "Simplify",
    icon: <MessageSquare className="h-4 w-4" />,
    description: "Use simpler language",
  },
  {
    action: "translate",
    label: "Translate",
    icon: <Globe className="h-4 w-4" />,
    description: "Translate to another language",
  },
  {
    action: "change_tone",
    label: "Change Tone",
    icon: <Theater className="h-4 w-4" />,
    description: "Adjust formality",
  },
  {
    action: "generate_quiz",
    label: "Generate Quiz",
    icon: <ClipboardList className="h-4 w-4" />,
    description: "Create MCQ questions",
  },
  {
    action: "explain_concept",
    label: "Explain",
    icon: <Lightbulb className="h-4 w-4" />,
    description: "Explain concepts simply",
  },
];

async function streamAIRequest(
  body: Record<string, unknown>,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
) {
  try {
    const res = await fetch("/api/ai/editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error || `Error: ${res.status}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError("No response stream");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            onDone();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              onChunk(parsed.text);
            }
            if (parsed.error) {
              onError(parsed.error);
              return;
            }
          } catch {
            // Non-JSON line, skip
          }
        }
      }
    }

    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : "Network error");
  }
}

export function AISidebar({ onAccept }: AISidebarProps) {
  const store = useEditorAIStore();

  const handleRunAction = useCallback(
    (action: EditorAIAction) => {
      store.setAction(action);
      store.setResult("");
      store.setStreaming(true);
      store.setError(null);

      const body: Record<string, unknown> = {
        action,
        selectedText: store.selectedText,
      };

      if (action === "custom") {
        body.customPrompt = store.customPrompt;
      }
      if (action === "translate") {
        body.targetLanguage = store.targetLanguage;
      }
      if (action === "change_tone") {
        body.tone = store.tone;
      }

      streamAIRequest(
        body,
        (chunk) => store.appendResult(chunk),
        () => store.setStreaming(false),
        (err) => store.setError(err),
      );
    },
    [store],
  );

  const handleCustomSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!store.customPrompt.trim()) return;
      handleRunAction("custom");
    },
    [store.customPrompt, handleRunAction],
  );

  return (
    <Sheet open={store.isOpen} onOpenChange={(open) => !open && store.close()}>
      <SheetContent
        side="bottom"
        className="flex max-h-[80vh] flex-col overflow-hidden rounded-t-2xl px-4 pb-6 pt-4 sm:mx-auto sm:max-w-lg sm:rounded-2xl"
        showCloseButton={false}
      >
        <SheetHeader className="shrink-0 border-b pb-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Writing Assistant
            </SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => store.close()}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          {/* Selected text preview */}
          {store.selectedText && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Selected text
              </p>
              <p className="line-clamp-4 text-sm leading-relaxed">
                {store.selectedText}
              </p>
            </div>
          )}

          {/* Quick actions grid */}
          {!store.result && !store.isStreaming && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                Quick actions
              </p>
              <div className="grid grid-cols-2 gap-2">
                {AI_ACTIONS.map(({ action, label, icon, description }) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => handleRunAction(action)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors duration-150",
                      "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      store.action === action && "border-primary/40 bg-accent",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {icon}
                      {label}
                    </span>
                    <span className="text-[11px] leading-tight text-muted-foreground">
                      {description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom prompt */}
          {!store.result && !store.isStreaming && (
            <form onSubmit={handleCustomSubmit} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Or describe what you want
              </p>
              <Textarea
                value={store.customPrompt}
                onChange={(e) => store.setCustomPrompt(e.target.value)}
                placeholder="Make it more engaging for parents…"
                className="min-h-[80px] resize-none text-sm"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!store.customPrompt.trim()}
                className="w-full gap-2"
              >
                <Send className="h-3.5 w-3.5" />
                Generate
              </Button>
            </form>
          )}

          {/* Streaming / Result */}
          {(store.isStreaming || store.result) && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                {store.isStreaming ? "AI is writing…" : "Result"}
              </p>
              <div className="rounded-lg border bg-background p-3">
                {store.isStreaming && !store.result && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating…
                  </div>
                )}
                {store.result && (
                  <div
                    className="prose prose-sm max-w-none text-sm leading-relaxed dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: store.result }}
                  />
                )}
              </div>

              {/* Action buttons */}
              {!store.isStreaming && store.result && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => onAccept(store.result)}
                    className="flex-1 gap-2"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      store.action && handleRunAction(store.action)
                    }
                    className="gap-2"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      store.setResult("");
                      store.setError(null);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {store.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{store.error}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
