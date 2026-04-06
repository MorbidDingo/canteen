"use client";

import type { Editor } from "@tiptap/react";
import { useState, useCallback } from "react";
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
  // Read initial values when dialog opens
  const existingHref = open ? (editor.getAttributes("link").href || "") : "";
  const existingTarget = open ? editor.getAttributes("link").target : "_blank";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            Insert Link
          </DialogTitle>
        </DialogHeader>
        {open && (
          <LinkForm
            editor={editor}
            initialUrl={existingHref}
            initialOpenInNewTab={existingTarget === "_blank" || !existingHref}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({
  editor,
  initialUrl,
  initialOpenInNewTab,
  onClose,
}: {
  editor: Editor;
  initialUrl: string;
  initialOpenInNewTab: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [openInNewTab, setOpenInNewTab] = useState(initialOpenInNewTab);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!url.trim()) {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
      } else {
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

      onClose();
    },
    [editor, url, openInNewTab, onClose],
  );

  const handleRemoveLink = useCallback(() => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onClose();
  }, [editor, onClose]);

  return (
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
          onCheckedChange={(checked) => setOpenInNewTab(checked === true)}
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
  );
}
