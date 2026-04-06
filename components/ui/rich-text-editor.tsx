"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Loader2, Maximize2, Minimize2, X } from "lucide-react";

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
  /** Title shown in fullscreen header (e.g. the post title) */
  title?: string;
}

/**
 * A minimal rich-text editor powered by self-hosted TinyMCE.
 * Props mirror the `<Textarea>` interface so the swap is surgical.
 * Includes a fullscreen mode for focused, mobile-friendly editing.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write here…",
  disabled = false,
  className,
  title,
}: RichTextEditorProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    const update = () => setViewportHeight(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Lock body scroll when fullscreen
  useEffect(() => {
    if (fullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [fullscreen]);

  const editorMinHeight = fullscreen ? viewportHeight - 120 : 200;

  const editorNode = (
    <Editor
      tinymceScriptSrc="/tinymce/tinymce.min.js"
      licenseKey="gpl"
      value={value}
      onEditorChange={onChange}
      disabled={disabled}
      init={{
        plugins: [
          "autoresize",
          "lists",
          "link",
          "codesample",
          "wordcount",
        ],
        toolbar:
          "bold italic underline | bullist numlist | h2 h3 | link codesample | removeformat",
        toolbar_mode: "wrap",
        menubar: false,
        statusbar: false,
        branding: false,
        promotion: false,
        min_height: editorMinHeight,
        autoresize_bottom_margin: fullscreen ? 24 : 16,
        placeholder,
        content_style: `
          body {
            font-family: inherit;
            font-size: 16px; /* 16px minimum prevents iOS auto-zoom on focused inputs */
            line-height: 1.75;
            color: inherit;
            background: transparent;
            margin: 0;
            padding: 4px 2px;
          }
          p { margin: 0 0 0.65em; }
          h2 { font-size: 1.25em; font-weight: 700; margin: 1em 0 0.35em; }
          h3 { font-size: 1.05em; font-weight: 600; margin: 0.8em 0 0.3em; }
          pre { border-radius: 8px; font-size: 0.9em; }
          a { color: #6366f1; }
        `,
        skin: "oxide",
        mobile: {
          toolbar_mode: "floating",
          menubar: false,
        },
      }}
    />
  );

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-[200] flex flex-col bg-background"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Fullscreen header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border/30 bg-background/95 px-4 py-3 backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{title || "Edit content"}</p>
            <p className="text-[11px] text-muted-foreground">Tap Done when finished</p>
          </div>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/60 text-foreground transition-colors active:scale-95"
            aria-label="Exit fullscreen"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="flex h-9 items-center justify-center rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors active:scale-95"
          >
            Done
          </button>
        </div>
        {/* Editor fills remaining space */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {editorNode}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rich-text-editor relative", className)}>
      {/* Expand button */}
      <button
        type="button"
        onClick={() => setFullscreen(true)}
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground opacity-60 transition-all hover:opacity-100 active:scale-95"
        aria-label="Expand editor"
        title="Expand to fullscreen"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
      {editorNode}
    </div>
  );
}
