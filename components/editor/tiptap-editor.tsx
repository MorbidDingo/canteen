"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { getEditorExtensions } from "@/lib/editor/extensions";
import { Toolbar } from "./toolbar";
import { EditorBubbleMenu } from "./bubble-menu";
import { LinkDialog } from "./link-dialog";
import { SlashCommandMenu } from "./slash-command";
import { WordCountBar } from "./word-count";
import { AISidebar } from "./ai-sidebar";
import { useEditorAIStore } from "@/lib/stores/editor-ai-store";
import { Minimize2 } from "lucide-react";
import "./editor.css";

export interface TipTapEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  maxLength?: number;
  autoFocus?: boolean;
  /** Title shown in fullscreen header */
  title?: string;
}

export function TipTapEditor({
  value,
  onChange,
  placeholder = "Start writing, or type / for commands…",
  editable = true,
  className,
  maxLength,
  autoFocus = false,
  title,
}: TipTapEditorProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [slashMenu, setSlashMenu] = useState<{
    open: boolean;
    position: { top: number; left: number };
  }>({ open: false, position: { top: 0, left: 0 } });
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const aiStore = useEditorAIStore();

  const editor = useEditor({
    extensions: getEditorExtensions({ placeholder, maxLength }),
    content: value,
    editable,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: cn(
          "tiptap-editor-content px-4 py-3 focus:outline-none",
          "prose prose-sm max-w-none dark:prose-invert",
          "prose-headings:font-semibold prose-headings:tracking-tight",
          "prose-p:leading-relaxed",
          "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
          fullscreen && "fullscreen",
        ),
      },
      handleKeyDown: (_view, event) => {
        // Handle slash command trigger
        if (event.key === "/" && !slashMenu.open) {
          // Wait for the character to be inserted, then check position
          setTimeout(() => {
            if (!editor) return;
            const { from } = editor.state.selection;
            const coords = editor.view.coordsAtPos(from);
            setSlashMenu({
              open: true,
              position: {
                top: coords.bottom + 4,
                left: coords.left,
              },
            });
          }, 10);
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
  });

  // Sync external value changes (only if content differs to avoid cursor jumps)
  useEffect(() => {
    if (!editor) return;
    const currentHTML = editor.getHTML();
    if (value !== currentHTML) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  // Lock body scroll when fullscreen
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

  // Exit fullscreen on Escape
  useEffect(() => {
    if (!fullscreen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [fullscreen]);

  const handleAIClick = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText =
      from !== to ? editor.state.doc.textBetween(from, to, " ") : "";
    aiStore.open(undefined, selectedText || editor.getText());
  }, [editor, aiStore]);

  const handleAIAccept = useCallback(
    (text: string) => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      if (from !== to) {
        // Replace selection
        editor.chain().focus().deleteRange({ from, to }).insertContent(text).run();
      } else {
        // Insert at cursor
        editor.chain().focus().insertContent(text).run();
      }
      aiStore.close();
    },
    [editor, aiStore],
  );

  const handleLinkClick = useCallback(() => {
    setLinkDialogOpen(true);
  }, []);

  const handleImageClick = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Image URL:");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const editorContent = (
    <>
      <Toolbar
        editor={editor}
        onAIClick={handleAIClick}
        onLinkClick={handleLinkClick}
        onImageClick={handleImageClick}
        isFullscreen={fullscreen}
        onToggleFullscreen={() => setFullscreen(!fullscreen)}
      />

      <div className="relative flex-1 overflow-y-auto">
        {editor && (
          <EditorBubbleMenu
            editor={editor}
            onLinkClick={handleLinkClick}
            onAIClick={handleAIClick}
          />
        )}
        <EditorContent editor={editor} />
      </div>

      <WordCountBar editor={editor} maxLength={maxLength} />

      {editor && (
        <LinkDialog
          editor={editor}
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
        />
      )}

      <SlashCommandMenu
        editor={editor!}
        isOpen={slashMenu.open}
        onClose={() => setSlashMenu((s) => ({ ...s, open: false }))}
        position={slashMenu.position}
        onAIClick={handleAIClick}
      />

      <AISidebar onAccept={handleAIAccept} />
    </>
  );

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
              Press Esc to exit fullscreen
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/60 text-foreground transition-colors active:scale-95"
            aria-label="Exit fullscreen"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="flex h-9 items-center justify-center rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors active:scale-95"
          >
            Done
          </button>
        </div>

        {/* Editor */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {editorContent}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={editorContainerRef}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border bg-background",
        "transition-shadow duration-200",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className,
      )}
    >
      {editorContent}
    </div>
  );
}
