"use client";

import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  Underline,
  Link,
  Highlighter,
  Strikethrough,
  Code,
} from "lucide-react";
import { useCallback, useState } from "react";
import { LinkDialog } from "./link-dialog";

interface EditorBubbleMenuProps {
  editor: Editor;
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
        "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isActive && "bg-accent text-accent-foreground",
      )}
      aria-label={label}
      aria-pressed={isActive}
    >
      {children}
    </button>
  );
}

export function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const handleLink = useCallback(() => {
    setLinkDialogOpen(true);
  }, []);

  const iconSize = "h-3.5 w-3.5";

  return (
    <>
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
      >
        <BubbleButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          label="Bold"
        >
          <Bold className={iconSize} />
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          label="Italic"
        >
          <Italic className={iconSize} />
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          label="Underline"
        >
          <Underline className={iconSize} />
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive("strike")}
          label="Strikethrough"
        >
          <Strikethrough className={iconSize} />
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive("code")}
          label="Code"
        >
          <Code className={iconSize} />
        </BubbleButton>
        <BubbleButton
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          isActive={editor.isActive("highlight")}
          label="Highlight"
        >
          <Highlighter className={iconSize} />
        </BubbleButton>

        <div className="mx-0.5 h-5 w-px bg-border" />

        <BubbleButton
          onClick={handleLink}
          isActive={editor.isActive("link")}
          label="Link"
        >
          <Link className={iconSize} />
        </BubbleButton>
      </BubbleMenu>

      <LinkDialog
        editor={editor}
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
      />
    </>
  );
}
