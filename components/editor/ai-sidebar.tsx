"use client";

import type { Editor } from "@tiptap/react";
import { useCallback, useRef, useEffect } from "react";
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
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Scissors,
  WandSparkles,
  MessageSquare,
  Globe,
  Palette,
  GraduationCap,
  BookOpen,
  RotateCcw,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useEditorAIStore,
  type EditorAIAction,
} from "@/lib/stores/editor-ai-store";

interface AISidebarProps {
  editor: Editor;
  postType?: "ASSIGNMENT" | "NOTE";
  postTitle?: string;
}

const AI_ACTIONS: Array<{
  action: EditorAIAction;
  label: string;
  icon: React.ReactNode;
  requiresSelection: boolean;
}> = [
  {
    action: "improve",
    label: "Improve",
    icon: <Pencil className="h-4 w-4" />,
    requiresSelection: true,
  },
  {
    action: "continue",
    label: "Continue",
    icon: <FileText className="h-4 w-4" />,
    requiresSelection: false,
  },
  {
    action: "summarize",
    label: "Summarize",
    icon: <ArrowDownNarrowWide className="h-4 w-4" />,
    requiresSelection: true,
  },
  {
    action: "expand",
    label: "Expand",
    icon: <ArrowUpNarrowWide className="h-4 w-4" />,
    requiresSelection: true,
  },
  {
    action: "shorten",
    label: "Shorten",
    icon: <Scissors className="h-4 w-4" />,
    requiresSelection: true,
  },
  {
    action: "fix_grammar",
    label: "Fix Grammar",
    icon: <WandSparkles className="h-4 w-4" />,
    requiresSelection: true,
  },
  {
    action: "simplify",
    label: "Simplify",
    icon: <MessageSquare className="h-4 w-4" />,
    requiresSelection: true,
  },
  {
    action: "translate",
    label: "Translate",
    icon: <Globe className="h-4 w-4" />,
    requiresSelection: true,
  },
  {
    action: "change_tone",
    label: "Change Tone",
    icon: <Palette className="h-4 w-4" />,
    requiresSelection: true,
  },
  {
    action: "generate_quiz",
    label: "Generate Quiz",
    icon: <GraduationCap className="h-4 w-4" />,
    requiresSelection: true,
  },
  {
    action: "explain_concept",
    label: "Explain",
    icon: <BookOpen className="h-4 w-4" />,
    requiresSelection: true,
  },
];

export function AISidebar({ editor, postType, postTitle }: AISidebarProps) {
  const store = useEditorAIStore();
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Auto-scroll result as it streams in
  useEffect(() => {
    if (store.isStreaming && resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight;
    }
  }, [store.result, store.isStreaming]);

  // Listen for custom events from slash command
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const { from, to } = editor.state.selection;
      const text =
        from !== to ? editor.state.doc.textBetween(from, to, " ") : "";
      store.open(detail?.action || "custom", text);
    };
    window.addEventListener("editor:ai-open", handler);
    return () => window.removeEventListener("editor:ai-open", handler);
  }, [editor, store]);

  const runAction = useCallback(
    async (action: EditorAIAction) => {
      // Abort any previous request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      store.setAction(action);
      store.setResult("");
      store.setStreaming(true);
      store.setError(null);

      try {
        const body: Record<string, unknown> = {
          action,
          selectedText: store.selectedText || undefined,
          fullContent:
            action === "continue" ? editor.getText() : undefined,
          context: {
            postType,
            title: postTitle,
          },
        };

        if (action === "custom" && store.customPrompt) {
          body.customPrompt = store.customPrompt;
          if (!store.selectedText) {
            body.fullContent = editor.getText();
          }
        }

        const response = await fetch("/api/ai/editor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message || errorData.error || "AI request failed",
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);
              if (data.type === "text") {
                store.appendResult(data.text);
              } else if (data.type === "done") {
                store.setStreaming(false);
              } else if (data.type === "error") {
                throw new Error(data.error || "AI generation failed");
              }
            } catch (parseErr) {
              // Skip malformed JSON lines
              if (parseErr instanceof SyntaxError) continue;
              throw parseErr;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        store.setError((err as Error).message || "Something went wrong");
      } finally {
        store.setStreaming(false);
      }
    },
    [editor, store, postType, postTitle],
  );

  const handleAccept = useCallback(() => {
    if (!store.result) return;

    const { from, to } = editor.state.selection;
    if (
      store.selectedText &&
      from !== to &&
      store.action !== "continue" &&
      store.action !== "generate_quiz" &&
      store.action !== "explain_concept"
    ) {
      // Replace selected text
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent(store.result)
        .run();
    } else {
      // Insert at cursor
      editor.chain().focus().insertContent(store.result).run();
    }

    store.close();
  }, [editor, store]);

  const handleRetry = useCallback(() => {
    if (store.action) {
      runAction(store.action);
    }
  }, [store.action, runAction]);

  const handleCustomSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (store.customPrompt.trim()) {
        runAction("custom");
      }
    },
    [store.customPrompt, runAction],
  );

  return (
    <Sheet
      open={store.isOpen}
      onOpenChange={(open) => {
        if (!open) {
          abortRef.current?.abort();
          store.close();
        }
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col sm:max-w-sm p-0"
      >
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Writing Assistant
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Selected text preview */}
          {store.selectedText && (
            <div className="border-b px-4 py-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Selected text
              </p>
              <p className="line-clamp-3 text-sm italic text-foreground/80">
                &ldquo;{store.selectedText}&rdquo;
              </p>
            </div>
          )}

          {/* Quick actions */}
          {!store.result && !store.isStreaming && (
            <div className="px-4 py-4">
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                Quick Actions
              </p>
              <div className="grid grid-cols-2 gap-2">
                {AI_ACTIONS.map((item) => (
                  <button
                    key={item.action}
                    type="button"
                    onClick={() => runAction(item.action)}
                    disabled={
                      item.requiresSelection && !store.selectedText
                    }
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
                      "hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      "disabled:pointer-events-none disabled:opacity-40",
                      "min-h-11",
                    )}
                  >
                    {item.icon}
                    <span className="font-medium">{item.label}</span>
                  </button>
                ))}
              </div>

              {/* Custom prompt */}
              <form onSubmit={handleCustomSubmit} className="mt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Or describe what you want
                </p>
                <Textarea
                  placeholder="Make it more engaging for Class 5 parents…"
                  value={store.customPrompt}
                  onChange={(e) => store.setCustomPrompt(e.target.value)}
                  className="min-h-[80px] resize-none text-base"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!store.customPrompt.trim()}
                  className="w-full gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate
                </Button>
              </form>
            </div>
          )}

          {/* Streaming / Result */}
          {(store.isStreaming || store.result) && (
            <div className="px-4 py-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {store.isStreaming ? "AI is writing…" : "Result"}
              </p>
              <div
                ref={resultRef}
                className="max-h-[50vh] overflow-y-auto rounded-lg border bg-muted/30 p-3"
              >
                {store.isStreaming && !store.result && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating…
                  </div>
                )}
                <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap text-sm">
                  {store.result}
                </div>
              </div>

              {/* Actions */}
              {!store.isStreaming && store.result && (
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleAccept}
                    className="gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRetry}
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      store.reset();
                    }}
                    className="gap-1.5"
                  >
                    <X className="h-3.5 w-3.5" />
                    Discard
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {store.error && (
            <div className="px-4 py-3">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm text-destructive">{store.error}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetry}
                  className="mt-2 gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Try again
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
