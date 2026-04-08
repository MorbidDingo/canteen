import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Typography from "@tiptap/extension-typography";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import type { Extensions } from "@tiptap/react";

interface ExtensionOptions {
  placeholder?: string;
  maxLength?: number;
}

export function getEditorExtensions({
  placeholder = "Start writing…",
  maxLength,
}: ExtensionOptions = {}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: { HTMLAttributes: { class: "not-prose" } },
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
    }),
    Placeholder.configure({ placeholder }),
    CharacterCount.configure(maxLength ? { limit: maxLength } : {}),
    Highlight.configure({ multicolor: false }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Image.configure({
      inline: false,
      allowBase64: true,
      HTMLAttributes: { class: "rounded-lg" },
    }),
    TextStyle,
    Color,
    Typography,
    TaskList,
    TaskItem.configure({ nested: true }),
  ];
}
