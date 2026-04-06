"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface KeyboardShortcutsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcuts = [
  { keys: "⌘ B", action: "Bold" },
  { keys: "⌘ I", action: "Italic" },
  { keys: "⌘ U", action: "Underline" },
  { keys: "⌘ ⇧ X", action: "Strikethrough" },
  { keys: "⌘ E", action: "Inline code" },
  { keys: "⌘ ⇧ 7", action: "Ordered list" },
  { keys: "⌘ ⇧ 8", action: "Bullet list" },
  { keys: "⌘ ⇧ 9", action: "Task list" },
  { keys: "⌘ ⇧ B", action: "Blockquote" },
  { keys: "⌘ ⌥ C", action: "Code block" },
  { keys: "⌘ K", action: "Insert link" },
  { keys: "⌘ Z", action: "Undo" },
  { keys: "⌘ ⇧ Z", action: "Redo" },
  { keys: "/", action: "Slash commands" },
];

export function KeyboardShortcuts({
  open,
  onOpenChange,
}: KeyboardShortcutsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {shortcuts.map((s) => (
            <div
              key={s.action}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
            >
              <span className="text-muted-foreground">{s.action}</span>
              <kbd className="inline-flex items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
