"use client";

import { type Editor } from "@tiptap/react";

interface WordCountBarProps {
  editor: Editor | null;
  maxLength?: number;
}

export function WordCountBar({ editor, maxLength }: WordCountBarProps) {
  if (!editor) return null;

  const storage = editor.storage.characterCount;
  const chars: number = storage?.characters?.() ?? 0;
  const words: number = storage?.words?.() ?? 0;
  const readingTime = Math.max(1, Math.ceil(words / 200));

  const isNearLimit = maxLength && chars / maxLength > 0.9;
  const isOverLimit = maxLength && chars >= maxLength;

  return (
    <div className="flex items-center gap-3 border-t px-3 py-1.5 text-xs text-muted-foreground">
      <span>{words} {words === 1 ? "word" : "words"}</span>
      <span className="text-border">·</span>
      <span
        className={
          isOverLimit
            ? "font-medium text-destructive"
            : isNearLimit
              ? "text-amber-600 dark:text-amber-400"
              : ""
        }
      >
        {maxLength ? `${chars}/${maxLength}` : `${chars} characters`}
      </span>
      <span className="text-border">·</span>
      <span>{readingTime} min read</span>
    </div>
  );
}
