"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Renders content that may be in markdown or HTML format.
 * Detects HTML tags and sanitizes with DOMPurify before rendering.
 * Markdown content is rendered via react-markdown.
 */
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const hasHtmlTags = /<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(content);

  // Sanitize HTML content to prevent XSS
  const sanitizedHtml = useMemo(
    () =>
      hasHtmlTags
        ? DOMPurify.sanitize(content, { USE_PROFILES: { html: true } })
        : "",
    [content, hasHtmlTags],
  );

  if (hasHtmlTags) {
    return (
      <div
        className={cn(
          "prose prose-sm max-w-none dark:prose-invert",
          "prose-headings:font-semibold prose-headings:tracking-tight",
          "prose-p:leading-relaxed prose-li:leading-relaxed",
          "prose-a:text-primary prose-a:underline-offset-2",
          "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px]",
          className,
        )}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }

  // Markdown content
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-p:leading-relaxed prose-li:leading-relaxed",
        "prose-a:text-primary prose-a:underline-offset-2",
        "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px]",
        "prose-pre:rounded-xl prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/20",
        "prose-blockquote:border-l-primary/30 prose-blockquote:text-muted-foreground",
        "prose-table:text-sm",
        "prose-img:rounded-xl",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
