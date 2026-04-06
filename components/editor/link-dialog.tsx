"use client";

import type { Editor } from "@tiptap/react";
import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, Unlink } from "lucide-react";

interface LinkDialogProps {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkDialog({ editor, open, onOpenChange }: LinkDialogProps) {
  const [url, setUrl] = useState("");
  const [openInNewTab, setOpenInNewTab] = useState(true);

  // Pre-fill from existing link
  useEffect(() => {
    if (open) {
      const existingUrl = editor.getAttributes("link").href || "";
      setUrl(existingUrl);
      const target = editor.getAttributes("link").target;
      setOpenInNewTab(target === "_blank" || !existingUrl);
    }
  }, [open, editor]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!url.trim()) {
        // Remove link if URL is empty
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
      } else {
        // Validate and normalize URL
        let normalizedUrl = url.trim();
        if (
          !normalizedUrl.startsWith("http://") &&
          !normalizedUrl.startsWith("https://") &&
          !normalizedUrl.startsWith("mailto:")
        ) {
          normalizedUrl = `https://${normalizedUrl}`;
        }

        editor
          .chain()
          .focus()
          .extendMarkRange("link")
          .setLink({
            href: normalizedUrl,
            target: openInNewTab ? "_blank" : null,
          })
          .run();
      }

      onOpenChange(false);
    },
    [editor, url, openInNewTab, onOpenChange],
  );

  const handleRemoveLink = useCallback(() => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onOpenChange(false);
  }, [editor, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            Insert Link
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="text-base"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="link-new-tab"
              checked={openInNewTab}
              onCheckedChange={(checked) =>
                setOpenInNewTab(checked === true)
              }
            />
            <Label htmlFor="link-new-tab" className="text-sm font-normal">
              Open in new tab
            </Label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {editor.isActive("link") && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemoveLink}
                className="gap-1.5"
              >
                <Unlink className="h-3.5 w-3.5" />
                Remove
              </Button>
            )}
            <Button type="submit" size="sm">
              {editor.isActive("link") ? "Update" : "Insert"} Link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
