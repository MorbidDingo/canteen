"use client";

import { BubbleMenu as TiptapBubbleMenu, type Editor } from "@tiptap/react";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  Underline,
  Link,
  Highlighter,
  Sparkles,
} from "lucide-react";

interface EditorBubbleMenuProps {
  editor: Editor;
  onLinkClick?: () => void;
  onAIClick?: () => void;
}

interface BubbleButtonProps {
  onClick: () => void;
  isActive?: boolean;
  label: string;
  children: React.ReactNode;
}

function BubbleButton({
  onClick,
  isActive = false,
  label,
  children,
}: BubbleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 min-h-8 min-w-8 items-center justify-center rounded-md transition-colors duration-150",
        "hover:bg-accent/80",
        isActive && "bg-accent text-accent-foreground",
      )}
      aria-label={label}
      aria-pressed={isActive}
    >
      {children}
    </button>
  );
}

export function EditorBubbleMenu({
  editor,
  onLinkClick,
  onAIClick,
}: EditorBubbleMenuProps) {
  return (
    <TiptapBubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 150,
        placement: "top",
        animation: "shift-toward-subtle",
      }}
      className={cn(
        "flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-lg",
        "animate-in fade-in-0 zoom-in-95 duration-150",
      )}
    >
      <BubbleButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        label="Bold"
      >
        <Bold className="h-3.5 w-3.5" />
      </BubbleButton>
      <BubbleButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        label="Italic"
      >
        <Italic className="h-3.5 w-3.5" />
      </BubbleButton>
      <BubbleButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        label="Underline"
      >
        <Underline className="h-3.5 w-3.5" />
      </BubbleButton>
      <BubbleButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={editor.isActive("highlight")}
        label="Highlight"
      >
        <Highlighter className="h-3.5 w-3.5" />
      </BubbleButton>

      {onLinkClick && (
        <BubbleButton
          onClick={onLinkClick}
          isActive={editor.isActive("link")}
          label="Link"
        >
          <Link className="h-3.5 w-3.5" />
        </BubbleButton>
      )}

      {/* Divider */}
      <div className="mx-0.5 h-4 w-px bg-border/60" />

      {onAIClick && (
        <BubbleButton onClick={onAIClick} label="AI Assist">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </BubbleButton>
      )}
    </TiptapBubbleMenu>
  );
}
