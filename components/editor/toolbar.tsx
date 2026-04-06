"use client";

import type { Editor } from "@tiptap/react";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  CodeXml,
  Minus,
  Link,
  Image,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo2,
  Redo2,
  Highlighter,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCallback, useState } from "react";
import { LinkDialog } from "./link-dialog";

interface EditorToolbarProps {
  editor: Editor;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  tooltip: string;
  shortcut?: string;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  tooltip,
  shortcut,
  children,
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "flex h-8 w-8 min-h-[44px] min-w-[44px] md:min-h-8 md:min-w-8 items-center justify-center rounded-md transition-colors",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:pointer-events-none disabled:opacity-50",
            isActive && "bg-accent text-accent-foreground",
          )}
          aria-label={tooltip}
          aria-pressed={isActive}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
        {shortcut && (
          <span className="ml-1.5 text-muted-foreground">{shortcut}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const addImage = useCallback(() => {
    const url = window.prompt("Enter image URL:");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const iconSize = "h-4 w-4";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 overflow-x-auto border-b bg-background/80 px-1.5 py-1.5 backdrop-blur-sm scrollbar-none">
        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          tooltip="Bold"
          shortcut="⌘B"
        >
          <Bold className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          tooltip="Italic"
          shortcut="⌘I"
        >
          <Italic className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          tooltip="Underline"
          shortcut="⌘U"
        >
          <Underline className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive("strike")}
          tooltip="Strikethrough"
        >
          <Strikethrough className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive("code")}
          tooltip="Inline code"
          shortcut="⌘E"
        >
          <Code className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          isActive={editor.isActive("highlight")}
          tooltip="Highlight"
        >
          <Highlighter className={iconSize} />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-0.5 h-6" />

        {/* Headings */}
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          isActive={editor.isActive("heading", { level: 1 })}
          tooltip="Heading 1"
        >
          <Heading1 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          isActive={editor.isActive("heading", { level: 2 })}
          tooltip="Heading 2"
        >
          <Heading2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          isActive={editor.isActive("heading", { level: 3 })}
          tooltip="Heading 3"
        >
          <Heading3 className={iconSize} />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-0.5 h-6" />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          tooltip="Bullet list"
        >
          <List className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          tooltip="Ordered list"
        >
          <ListOrdered className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          isActive={editor.isActive("taskList")}
          tooltip="Task list"
        >
          <ListChecks className={iconSize} />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-0.5 h-6" />

        {/* Blocks */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          tooltip="Blockquote"
        >
          <Quote className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          tooltip="Code block"
        >
          <CodeXml className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          tooltip="Divider"
        >
          <Minus className={iconSize} />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-0.5 h-6" />

        {/* Insert */}
        <ToolbarButton
          onClick={() => setLinkDialogOpen(true)}
          isActive={editor.isActive("link")}
          tooltip="Link"
          shortcut="⌘K"
        >
          <Link className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={addImage} tooltip="Image">
          <Image className={iconSize} />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-0.5 h-6" />

        {/* Alignment */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          isActive={editor.isActive({ textAlign: "left" })}
          tooltip="Align left"
        >
          <AlignLeft className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          isActive={editor.isActive({ textAlign: "center" })}
          tooltip="Align center"
        >
          <AlignCenter className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          isActive={editor.isActive({ textAlign: "right" })}
          tooltip="Align right"
        >
          <AlignRight className={iconSize} />
        </ToolbarButton>

        <Separator orientation="vertical" className="mx-0.5 h-6" />

        {/* History */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          tooltip="Undo"
          shortcut="⌘Z"
        >
          <Undo2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          tooltip="Redo"
          shortcut="⌘⇧Z"
        >
          <Redo2 className={iconSize} />
        </ToolbarButton>
      </div>

      {/* Link dialog */}
      <LinkDialog
        editor={editor}
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
      />
    </TooltipProvider>
  );
}
