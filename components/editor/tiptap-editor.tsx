"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Maximize2, Minimize2 } from "lucide-react";
import { createExtensions } from "@/lib/editor/extensions";
import { EditorToolbar } from "./toolbar";
import { EditorBubbleMenu } from "./bubble-menu";
import { WordCount } from "./word-count";
import { AISidebar } from "./ai-sidebar";
import "./editor.css";

export interface TipTapEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  disabled?: boolean;
  className?: string;
  maxLength?: number;
  autoFocus?: boolean;
  /** Title shown in fullscreen header */
  title?: string;
}

export function TipTapEditor({
  value,
  onChange,
  placeholder = "Write here…",
  editable = true,
  disabled = false,
  className,
  maxLength,
  autoFocus = false,
  title,
}: TipTapEditorProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const isEditable = editable && !disabled;

  const editor = useEditor({
    extensions: createExtensions({ placeholder, maxLength }),
    content: value,
    editable: isEditable,
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none dark:prose-invert font-sans focus:outline-none min-h-[120px] px-4 py-3",
      },
    },
  });

  // Sync external value changes (e.g. loading saved content)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, false);
    }
  }, [editor, value]);

  // Sync editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(isEditable);
    }
  }, [editor, isEditable]);

  // Handle fullscreen body lock
  useEffect(() => {
    if (fullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  // Handle Esc to exit fullscreen
  useEffect(() => {
    if (!fullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullscreen]);

  const toggleFullscreen = useCallback(() => {
    setFullscreen((prev) => !prev);
  }, []);

  if (!editor) {
    return (
      <div className="flex min-h-[160px] items-center justify-center rounded-lg bg-muted/30">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
      </div>
    );
  }

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-[200] flex flex-col bg-background"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Fullscreen header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border/30 bg-background/95 px-4 py-3 backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">
              {title || "Edit content"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Tap Done when finished
            </p>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-muted/60 text-foreground transition-colors active:scale-95"
            aria-label="Exit fullscreen"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-11 items-center justify-center rounded-full bg-primary px-5 text-[13px] font-semibold text-primary-foreground transition-colors active:scale-95"
          >
            Done
          </button>
        </div>
        {/* Toolbar */}
        <EditorToolbar editor={editor} />
        {/* Editor fills remaining space */}
        <div className="flex-1 overflow-y-auto">
          <EditorBubbleMenu editor={editor} />
          <EditorContent editor={editor} />
        </div>
        {/* Word count */}
        <WordCount editor={editor} maxLength={maxLength} />
        {/* AI sidebar */}
        <AISidebar editor={editor} postTitle={title} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-background overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background",
        disabled && "opacity-60 pointer-events-none",
        className,
      )}
    >
      {/* Toolbar */}
      <EditorToolbar editor={editor} />
      {/* Expand button */}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute right-2 top-2 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground opacity-60 transition-all hover:opacity-100 active:scale-95"
        aria-label="Expand editor"
        title="Expand to fullscreen"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
      {/* Bubble menu */}
      <EditorBubbleMenu editor={editor} />
      {/* Editor content */}
      <EditorContent editor={editor} />
      {/* Word count */}
      <WordCount editor={editor} maxLength={maxLength} />
      {/* AI sidebar */}
      <AISidebar editor={editor} postTitle={title} />
    </div>
  );
}
