"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// Lazy-load TinyMCE so it never runs on the server.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Editor = dynamic(
  () => import("@tinymce/tinymce-react").then((mod) => mod.Editor),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[160px] items-center justify-center rounded-lg bg-muted/30">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
      </div>
    ),
  },
);

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A minimal rich-text editor powered by self-hosted TinyMCE.
 * Props mirror the `<Textarea>` interface so the swap is surgical.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write here…",
  disabled = false,
  className,
}: RichTextEditorProps) {
  return (
    <div className={cn("rich-text-editor", className)}>
      <Editor
        // Point to self-hosted TinyMCE — no Tiny Cloud account or API key required.
        tinymceScriptSrc="/tinymce/tinymce.min.js"
        licenseKey="gpl"
        value={value}
        onEditorChange={onChange}
        disabled={disabled}
        init={{
          // ── Core ──────────────────────────────────────────────
          plugins: [
            "autoresize",
            "lists",
            "link",
            "codesample",
            "wordcount",
          ],

          // ── Toolbar ───────────────────────────────────────────
          toolbar:
            "bold italic underline | bullist numlist | h2 h3 | link codesample | removeformat",
          toolbar_mode: "wrap",

          // ── Chrome ────────────────────────────────────────────
          menubar: false,
          statusbar: false,
          branding: false,
          promotion: false,

          // ── Autoresize ────────────────────────────────────────
          min_height: 160,
          autoresize_bottom_margin: 16,

          // ── Placeholder ───────────────────────────────────────
          placeholder,

          // ── Inline styling — borderless, transparent background,
          //    matching the existing Textarea feel ─────────────
          content_style: `
            body {
              font-family: inherit;
              font-size: 15px;
              line-height: 1.7;
              color: inherit;
              background: transparent;
              margin: 0;
              padding: 4px 0;
            }
            p { margin: 0 0 0.6em; }
            h2 { font-size: 1.2em; font-weight: 600; margin: 0.8em 0 0.3em; }
            h3 { font-size: 1.05em; font-weight: 600; margin: 0.8em 0 0.3em; }
            pre { border-radius: 6px; }
          `,
          skin: "oxide",

          // ── Mobile ────────────────────────────────────────────
          mobile: {
            toolbar_mode: "floating",
            menubar: false,
          },
        }}
      />
    </div>
  );
}
