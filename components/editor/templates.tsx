"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText, BookOpen } from "lucide-react";
import {
  ASSIGNMENT_TEMPLATES,
  NOTE_TEMPLATES,
  type EditorTemplate,
} from "@/lib/editor/templates";

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (html: string) => void;
  type?: "ASSIGNMENT" | "NOTE";
}

export function TemplatePicker({
  open,
  onOpenChange,
  onSelect,
  type,
}: TemplatePickerProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const templates =
    type === "ASSIGNMENT"
      ? ASSIGNMENT_TEMPLATES
      : type === "NOTE"
        ? NOTE_TEMPLATES
        : [...ASSIGNMENT_TEMPLATES, ...NOTE_TEMPLATES];

  const handleApply = useCallback(() => {
    const template = templates.find((t) => t.id === selected);
    if (template) {
      onSelect(template.html);
      onOpenChange(false);
      setSelected(null);
    }
  }, [selected, templates, onSelect, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Start from template
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto -mx-1 px-1 max-h-[60vh]">
          <div className="grid gap-2">
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isSelected={selected === template.id}
                onClick={() => setSelected(template.id)}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              setSelected(null);
            }}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!selected}
            onClick={handleApply}
          >
            Use Template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({
  template,
  isSelected,
  onClick,
}: {
  template: EditorTemplate;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors min-h-11",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isSelected && "border-primary bg-primary/5 ring-1 ring-primary",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
        {template.type === "ASSIGNMENT" ? (
          <BookOpen className="h-4 w-4 text-muted-foreground" />
        ) : (
          <FileText className="h-4 w-4 text-muted-foreground" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{template.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {template.description}
        </p>
        <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {template.type}
        </span>
      </div>
    </button>
  );
}
