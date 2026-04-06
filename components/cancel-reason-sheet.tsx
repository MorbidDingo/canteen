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
      snapPoints={[45]}
    >
      <div className="px-5 pb-8 pt-2 space-y-5">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Why are you cancelling?</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            This helps us improve
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {CANCEL_REASONS.map((reason) => (
            <button
              key={reason.value}
              type="button"
              onClick={() => setSelected(reason.value)}
              className={cn(
                "rounded-full px-4 py-2 text-[13px] font-medium transition-all",
                selected === reason.value
                  ? "border border-primary bg-primary/10 text-primary"
                  : "border border-border text-foreground",
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
            className="rounded-xl text-sm"
          />
        )}

        <Button
          variant="destructive"
          className="w-full h-12 rounded-2xl"
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
