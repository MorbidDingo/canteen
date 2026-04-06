"use client";

import type { Editor } from "@tiptap/react";
import { cn } from "@/lib/utils";

interface WordCountProps {
  editor: Editor;
  maxLength?: number;
}

export function WordCount({ editor, maxLength }: WordCountProps) {
  const storage = editor.storage.characterCount;
  const chars = storage?.characters?.() ?? 0;
  const words = storage?.words?.() ?? 0;
  const readingTime = Math.max(1, Math.ceil(words / 200));

  const isNearLimit = maxLength ? chars / maxLength > 0.9 : false;
  const isAtLimit = maxLength ? chars >= maxLength : false;

  return (
    <div className="flex items-center gap-3 border-t px-3 py-1.5 text-xs text-muted-foreground">
      <span>
        {words} {words === 1 ? "word" : "words"}
      </span>
      <span className="text-border">·</span>
      <span
        className={cn(
          maxLength && isAtLimit && "text-destructive font-medium",
          maxLength && isNearLimit && !isAtLimit && "text-amber-600 dark:text-amber-400",
        )}
      >
        {chars}
        {maxLength ? `/${maxLength}` : ""} chars
      </span>
      <span className="text-border">·</span>
      <span>{readingTime} min read</span>
    </div>
  );
}
