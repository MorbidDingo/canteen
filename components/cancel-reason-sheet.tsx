"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet } from "@/components/ui/motion";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CancelReasonSheetProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, otherText?: string) => Promise<void>;
}

const CANCEL_REASONS = [
  { value: "ORDERED_BY_MISTAKE", label: "Ordered by mistake" },
  { value: "FOUND_BETTER_OPTION", label: "Found a better option" },
  { value: "CHILD_NOT_IN_SCHOOL", label: "Child not in school today" },
  { value: "TAKING_HOMEMADE_FOOD", label: "Taking homemade food instead" },
  { value: "TOO_EXPENSIVE", label: "Too expensive" },
  { value: "OTHER", label: "Other reason" },
] as const;

export function CancelReasonSheet({
  orderId,
  open,
  onOpenChange,
  onConfirm,
}: CancelReasonSheetProps) {
  const [selected, setSelected] = useState<string>("");
  const [otherText, setOtherText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await onConfirm(
        selected,
        selected === "OTHER" ? otherText.trim() || undefined : undefined,
      );
      onOpenChange(false);
      setSelected("");
      setOtherText("");
    } catch {
      // Error handled by parent
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => onOpenChange(false)}
      snapPoints={[75]}
    >
      <div className="px-4 pb-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Why are you cancelling?</h3>
          <p className="text-sm text-muted-foreground">
            This helps us improve our service
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {CANCEL_REASONS.map((reason) => (
            <button
              key={reason.value}
              type="button"
              onClick={() => setSelected(reason.value)}
              className={cn(
                "w-full rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition-all",
                selected === reason.value
                  ? "border-destructive bg-destructive/5 text-destructive"
                  : "border-border hover:border-muted-foreground/30 hover:bg-muted/50",
              )}
            >
              {reason.label}
            </button>
          ))}
        </div>

        {selected === "OTHER" && (
          <Textarea
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Tell us why..."
            maxLength={500}
            rows={2}
            className="animate-in fade-in slide-in-from-top-2 duration-200"
          />
        )}

        <Button
          variant="destructive"
          className="w-full"
          disabled={!selected || submitting}
          onClick={handleConfirm}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Cancel Order
        </Button>
      </div>
    </BottomSheet>
  );
}
