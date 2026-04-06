"use client";

import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
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
  Image,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (props: { editor: Parameters<typeof Extension.create>[0] extends undefined ? never : unknown; range: unknown }) => void;
}

const iconClass = "h-4 w-4 text-muted-foreground";

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    title: "Heading 1",
    description: "Large heading",
    icon: <Heading1 className={iconClass} />,
    command: ({ editor, range }: { editor: Record<string, unknown>; range: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as any).chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium heading",
    icon: <Heading2 className={iconClass} />,
    command: ({ editor, range }: { editor: Record<string, unknown>; range: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as any).chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small heading",
    icon: <Heading3 className={iconClass} />,
    command: ({ editor, range }: { editor: Record<string, unknown>; range: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as any).chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    icon: <List className={iconClass} />,
    command: ({ editor, range }: { editor: Record<string, unknown>; range: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as any).chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    icon: <ListOrdered className={iconClass} />,
    command: ({ editor, range }: { editor: Record<string, unknown>; range: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as any).chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Task List",
    description: "Checklist",
    icon: <ListChecks className={iconClass} />,
    command: ({ editor, range }: { editor: Record<string, unknown>; range: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as any).chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Blockquote",
    description: "Quote block",
    icon: <Quote className={iconClass} />,
    command: ({ editor, range }: { editor: Record<string, unknown>; range: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as any).chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Code Block",
    description: "Code snippet",
    icon: <CodeXml className={iconClass} />,
    command: ({ editor, range }: { editor: Record<string, unknown>; range: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as any).chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    icon: <Minus className={iconClass} />,
    command: ({ editor, range }: { editor: Record<string, unknown>; range: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as any).chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "Image",
    description: "Insert image",
    icon: <Image className={iconClass} />,
    command: ({ editor, range }: { editor: Record<string, unknown>; range: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as any).chain().focus().deleteRange(range).run();
      const url = window.prompt("Enter image URL:");
      if (url) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (editor as any).chain().focus().setImage({ src: url }).run();
      }
    },
  },
  {
    title: "AI Write",
    description: "Let AI assist your writing",
    icon: <Sparkles className={cn(iconClass, "text-primary")} />,
    command: ({ editor, range }: { editor: Record<string, unknown>; range: unknown }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as any).chain().focus().deleteRange(range).run();
      // Dispatch custom event for AI sidebar to pick up
      window.dispatchEvent(new CustomEvent("editor:ai-open", { detail: { action: "custom" } }));
    },
  },
];

// ─── Suggestion List Component ─────────────────────────────

interface CommandListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const CommandList = forwardRef<CommandListRef, SuggestionProps<SlashCommandItem>>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const items = props.items;

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          props.command(item);
        }
      },
      [items, props],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return null;
    }

    return (
      <div className="w-56 rounded-lg border bg-popover p-1 shadow-lg animate-in fade-in-0 slide-in-from-top-2 duration-150">
        {items.map((item, index) => (
          <button
            key={item.title}
            type="button"
            onClick={() => selectItem(index)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              "hover:bg-accent cursor-pointer text-left",
              index === selectedIndex && "bg-accent text-accent-foreground",
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
              {item.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{item.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {item.description}
              </p>
            </div>
          </button>
        ))}
      </div>
    );
  },
);

CommandList.displayName = "CommandList";

// ─── Slash Command Extension ───────────────────────────────

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({
          editor,
          range,
          props,
        }: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor: any;
          range: unknown;
          props: SlashCommandItem;
        }) => {
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => {
          return SLASH_COMMANDS.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase()),
          );
        },
        render: () => {
          let component: ReactRenderer<CommandListRef> | null = null;
          let popup: TippyInstance[] | null = null;

          return {
            onStart: (props: SuggestionProps<SlashCommandItem>) => {
              component = new ReactRenderer(CommandList, {
                props,
                editor: props.editor,
              });

              if (!props.clientRect) return;

              popup = tippy("body", {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              });
            },

            onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
              component?.updateProps(props);

              if (popup?.[0] && props.clientRect) {
                popup[0].setProps({
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                });
              }
            },

            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === "Escape") {
                popup?.[0]?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },

            onExit: () => {
              popup?.[0]?.destroy();
              component?.destroy();
            },
          };
        },
      }),
    ];
  },
});
