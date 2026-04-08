"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { EDITOR_TEMPLATES, type EditorTemplate } from "@/lib/editor/templates";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, BookOpen } from "lucide-react";

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (html: string) => void;
  category?: "assignment" | "note";
}

export function TemplatePicker({
  open,
  onOpenChange,
  onSelect,
  category,
}: TemplatePickerProps) {
  const [activeTab, setActiveTab] = useState<"assignment" | "note">(
    category ?? "note",
  );

  const filteredTemplates = EDITOR_TEMPLATES.filter(
    (t) => t.category === activeTab,
  );

  const handleSelect = (template: EditorTemplate) => {
    onSelect(template.html);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Start from a template
          </DialogTitle>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("assignment")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activeTab === "assignment"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Assignments
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("note")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              activeTab === "note"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Notes
          </button>
        </div>

        {/* Template grid */}
        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {filteredTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => handleSelect(template)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors duration-150",
                "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{template.title}</p>
                <p className="text-sm text-muted-foreground">
                  {template.description}
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-end border-t pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Start blank
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
