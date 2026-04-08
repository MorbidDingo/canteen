"use client";

import { useState, useEffect, useCallback } from "react";
import { type Editor } from "@tiptap/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Link, Unlink } from "lucide-react";

interface LinkDialogProps {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkDialog({ editor, open, onOpenChange }: LinkDialogProps) {
  const [url, setUrl] = useState("");
  const [openInNewTab, setOpenInNewTab] = useState(true);

  // Pre-fill if the selection already has a link
  useEffect(() => {
    if (open) {
      const existingLink = editor.getAttributes("link");
      if (existingLink.href) {
        setUrl(existingLink.href);
        setOpenInNewTab(existingLink.target === "_blank");
      } else {
        setUrl("");
        setOpenInNewTab(true);
      }
    }
  }, [open, editor]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!url.trim()) return;

      // Add protocol if missing
      let finalUrl = url.trim();
      if (!/^https?:\/\//i.test(finalUrl) && !finalUrl.startsWith("mailto:")) {
        finalUrl = `https://${finalUrl}`;
      }

      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({
          href: finalUrl,
          target: openInNewTab ? "_blank" : null,
        })
        .run();

      onOpenChange(false);
    },
    [url, openInNewTab, editor, onOpenChange],
  );

  const handleRemoveLink = useCallback(() => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onOpenChange(false);
  }, [editor, onOpenChange]);

  const hasExistingLink = editor.isActive("link");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            {hasExistingLink ? "Edit Link" : "Insert Link"}
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
              autoFocus
              className="text-base"
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

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {hasExistingLink && (
              <Button
                type="button"
                variant="outline"
                onClick={handleRemoveLink}
                className="gap-2"
              >
                <Unlink className="h-3.5 w-3.5" />
                Remove link
              </Button>
            )}
            <Button type="submit" disabled={!url.trim()}>
              {hasExistingLink ? "Update" : "Insert"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
