"use client";

import type { Editor } from "@tiptap/react";
import { Sparkles, Pencil, WandSparkles, MessageSquare, Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditorAIStore, type EditorAIAction } from "@/lib/stores/editor-ai-store";
import { useCallback } from "react";

interface AIBubbleActionProps {
  editor: Editor;
}

const quickActions: Array<{
  action: EditorAIAction;
  label: string;
  icon: React.ReactNode;
}> = [
  { action: "improve", label: "Improve writing", icon: <Pencil className="h-3.5 w-3.5" /> },
  { action: "fix_grammar", label: "Fix grammar", icon: <WandSparkles className="h-3.5 w-3.5" /> },
  { action: "simplify", label: "Simplify", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { action: "translate", label: "Translate", icon: <Globe className="h-3.5 w-3.5" /> },
];

export function AIBubbleAction({ editor }: AIBubbleActionProps) {
  const store = useEditorAIStore();

  const handleAction = useCallback(
    (action: EditorAIAction) => {
      const { from, to } = editor.state.selection;
      const text = from !== to ? editor.state.doc.textBetween(from, to, " ") : "";
      store.open(action, text);
    },
    [editor, store],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="AI actions"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {quickActions.map((item) => (
          <DropdownMenuItem
            key={item.action}
            onClick={() => handleAction(item.action)}
            className="gap-2"
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
