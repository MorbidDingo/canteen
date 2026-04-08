"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { type Editor } from "@tiptap/react";
import { cn } from "@/lib/utils";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  CodeXml,
  Minus,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";

interface SlashCommandItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (editor: Editor) => void;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    title: "Heading 1",
    description: "Large section heading",
    icon: <Heading1 className="h-4 w-4" />,
    command: (editor) =>
      editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: <Heading2 className="h-4 w-4" />,
    command: (editor) =>
      editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: <Heading3 className="h-4 w-4" />,
    command: (editor) =>
      editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: "Bullet List",
    description: "Create an unordered list",
    icon: <List className="h-4 w-4" />,
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: "Numbered List",
    description: "Create an ordered list",
    icon: <ListOrdered className="h-4 w-4" />,
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: "Checklist",
    description: "Track tasks with checkboxes",
    icon: <ListChecks className="h-4 w-4" />,
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    title: "Quote",
    description: "Add a blockquote",
    icon: <Quote className="h-4 w-4" />,
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    title: "Code Block",
    description: "Insert a code snippet",
    icon: <CodeXml className="h-4 w-4" />,
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: "Divider",
    description: "Insert a horizontal line",
    icon: <Minus className="h-4 w-4" />,
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    title: "Image",
    description: "Insert an image from URL",
    icon: <ImageIcon className="h-4 w-4" />,
    command: (editor) => {
      const url = window.prompt("Image URL:");
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    },
  },
];

interface SlashCommandMenuProps {
  editor: Editor;
  isOpen: boolean;
  onClose: () => void;
  position: { top: number; left: number };
  onAIClick?: () => void;
}

export function SlashCommandMenu({
  editor,
  isOpen,
  onClose,
  position,
  onAIClick,
}: SlashCommandMenuProps) {
  if (!isOpen) return null;

  return (
    <SlashCommandMenuContent
      editor={editor}
      onClose={onClose}
      position={position}
      onAIClick={onAIClick}
    />
  );
}

function SlashCommandMenuContent({
  editor,
  onClose,
  position,
  onAIClick,
}: Omit<SlashCommandMenuProps, "isOpen">) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const allItems = [
    ...SLASH_COMMANDS,
    ...(onAIClick
      ? [
          {
            title: "AI Assist",
            description: "Ask AI to help you write",
            icon: <Sparkles className="h-4 w-4 text-primary" />,
            command: () => onAIClick(),
          },
        ]
      : []),
  ];

  const filteredItems = allItems.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase()),
  );

  const executeCommand = useCallback(
    (item: SlashCommandItem) => {
      // Remove the slash and any typed query from the editor
      const { state } = editor;
      const { from } = state.selection;
      // Find the slash character - look backwards from cursor
      const textBefore = state.doc.textBetween(
        Math.max(0, from - query.length - 1),
        from,
        "",
      );
      const slashIndex = textBefore.lastIndexOf("/");
      if (slashIndex !== -1) {
        const deleteFrom = from - query.length - 1;
        editor
          .chain()
          .focus()
          .deleteRange({ from: deleteFrom, to: from })
          .run();
      }

      item.command(editor);
      onClose();
    },
    [editor, query, onClose],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredItems.length - 1,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          executeCommand(filteredItems[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Backspace" && query === "") {
        onClose();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        setQuery((prev) => prev + e.key);
        setSelectedIndex(0);
      } else if (e.key === "Backspace") {
        setQuery((prev) => prev.slice(0, -1));
        setSelectedIndex(0);
      }
    },
    [filteredItems, selectedIndex, query, executeCommand, onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  if (filteredItems.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className={cn(
        "fixed z-50 w-56 rounded-lg border bg-popover p-1 shadow-lg",
        "animate-in fade-in-0 slide-in-from-top-2 duration-150",
      )}
      style={{
        top: position.top,
        left: position.left,
      }}
      role="listbox"
      aria-label="Slash commands"
    >
      {query && (
        <div className="mb-1 px-2 py-1 text-xs text-muted-foreground">
          Filter: {query}
        </div>
      )}
      {filteredItems.map((item, index) => (
        <button
          key={item.title}
          type="button"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            "hover:bg-accent focus-visible:bg-accent",
            index === selectedIndex && "bg-accent",
          )}
          onClick={() => executeCommand(item)}
          role="option"
          aria-selected={index === selectedIndex}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
            {item.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{item.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
