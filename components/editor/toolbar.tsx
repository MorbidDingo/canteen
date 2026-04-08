"use client";

import { type Editor } from "@tiptap/react";
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
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sparkles,
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ToolbarProps {
  editor: Editor | null;
  onAIClick?: () => void;
  onLinkClick?: () => void;
  onImageClick?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  tooltip: string;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  tooltip,
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
            "flex h-8 w-8 min-h-8 min-w-8 items-center justify-center rounded-md transition-colors duration-150",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:pointer-events-none disabled:opacity-40",
            isActive && "bg-accent text-accent-foreground",
          )}
          aria-label={tooltip}
          aria-pressed={isActive}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-border/60" />;
}

export function Toolbar({
  editor,
  onAIClick,
  onLinkClick,
  onImageClick,
  isFullscreen,
  onToggleFullscreen,
}: ToolbarProps) {
  if (!editor) return null;

  const iconSize = "h-4 w-4";

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex items-center gap-0.5 overflow-x-auto border-b bg-background/80 px-1.5 py-1",
          "scrollbar-none backdrop-blur-sm",
          "[-webkit-overflow-scrolling:touch]",
        )}
        role="toolbar"
        aria-label="Formatting toolbar"
      >
        {/* Undo/Redo */}
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          tooltip="Undo (Ctrl+Z)"
        >
          <Undo2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          tooltip="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className={iconSize} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          tooltip="Bold (Ctrl+B)"
        >
          <Bold className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          tooltip="Italic (Ctrl+I)"
        >
          <Italic className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          tooltip="Underline (Ctrl+U)"
        >
          <Underline className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive("strike")}
          tooltip="Strikethrough (Ctrl+Shift+X)"
        >
          <Strikethrough className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive("code")}
          tooltip="Inline code (Ctrl+E)"
        >
          <Code className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          isActive={editor.isActive("highlight")}
          tooltip="Highlight"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-yellow-200/70 text-[10px] font-bold dark:bg-yellow-500/40">
            H
          </span>
        </ToolbarButton>

        <ToolbarDivider />

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

        <ToolbarDivider />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          tooltip="Bullet list (Ctrl+Shift+8)"
        >
          <List className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          tooltip="Ordered list (Ctrl+Shift+7)"
        >
          <ListOrdered className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          isActive={editor.isActive("taskList")}
          tooltip="Checklist (Ctrl+Shift+9)"
        >
          <ListChecks className={iconSize} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Blocks */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          tooltip="Blockquote (Ctrl+Shift+B)"
        >
          <Quote className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          tooltip="Code block (Ctrl+Alt+C)"
        >
          <CodeXml className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          tooltip="Divider"
        >
          <Minus className={iconSize} />
        </ToolbarButton>

        <ToolbarDivider />

        {/* Insert */}
        <ToolbarButton
          onClick={() => onLinkClick?.()}
          isActive={editor.isActive("link")}
          tooltip="Insert link (Ctrl+K)"
        >
          <Link className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => onImageClick?.()} tooltip="Insert image">
          <ImageIcon className={iconSize} />
        </ToolbarButton>

        <ToolbarDivider />

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

        {/* Spacer */}
        <div className="flex-1" />

        {/* AI button */}
        {onAIClick && (
          <ToolbarButton onClick={onAIClick} tooltip="✨ AI Assist">
            <Sparkles className={cn(iconSize, "text-primary")} />
          </ToolbarButton>
        )}

        {/* Fullscreen toggle */}
        {onToggleFullscreen && (
          <ToolbarButton
            onClick={onToggleFullscreen}
            tooltip={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className={iconSize} />
            ) : (
              <Maximize2 className={iconSize} />
            )}
          </ToolbarButton>
        )}
      </div>
    </TooltipProvider>
  );
}
