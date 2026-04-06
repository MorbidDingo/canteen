import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { SlashCommand } from "@/components/editor/slash-command";
import { CalloutBlock } from "@/components/editor/callout-block";

export interface ExtensionOptions {
  placeholder?: string;
  maxLength?: number;
}

export function createExtensions(options: ExtensionOptions = {}) {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
      },
      codeBlock: {
        HTMLAttributes: {
          class: "not-prose",
        },
      },
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: {
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      },
    }),
    Placeholder.configure({
      placeholder: options.placeholder || "Write something…",
    }),
    CharacterCount.configure({
      limit: options.maxLength,
    }),
    Highlight.configure({
      multicolor: false,
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Image.configure({
      inline: false,
      allowBase64: true,
      HTMLAttributes: {
        class: "rounded-lg",
      },
    }),
    TextStyle,
    Color,
    Typography,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    SlashCommand,
    CalloutBlock,
  ];
}
