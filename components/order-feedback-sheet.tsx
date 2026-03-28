"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet } from "@/components/ui/motion";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface OrderFeedbackSheetProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
}

const RATING_LABELS = {
  healthyRating: "Healthiness",
  tasteRating: "Taste",
  quantityRating: "Quantity",
} as const;

function StarPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-medium w-24 shrink-0">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="p-0.5 transition-transform active:scale-90"
          >
            <Star
              className={cn(
                "h-7 w-7 transition-colors",
                star <= value
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/30",
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function OrderFeedbackSheet({
  orderId,
  open,
  onOpenChange,
  onSubmitted,
}: OrderFeedbackSheetProps) {
  const [healthyRating, setHealthyRating] = useState(0);
  const [tasteRating, setTasteRating] = useState(0);
  const [quantityRating, setQuantityRating] = useState(0);
  const [overallReview, setOverallReview] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    healthyRating > 0 && tasteRating > 0 && quantityRating > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          healthyRating,
          tasteRating,
          quantityRating,
          overallReview: overallReview.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }

      toast.success("Thanks for your feedback!");
      onOpenChange(false);
      onSubmitted?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit feedback",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => onOpenChange(false)}
      snapPoints={[70]}
    >
      <div className="px-4 pb-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold">Rate your order</h3>
          <p className="text-sm text-muted-foreground">
            Help us improve the canteen experience
          </p>
        </div>

        <div className="space-y-4">
          <StarPicker
            label="Healthiness"
            value={healthyRating}
            onChange={setHealthyRating}
          />
          <StarPicker
            label="Taste"
            value={tasteRating}
            onChange={setTasteRating}
          />
          <StarPicker
            label="Quantity"
            value={quantityRating}
            onChange={setQuantityRating}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            Overall review{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </label>
          <Textarea
            value={overallReview}
            onChange={(e) => setOverallReview(e.target.value)}
            placeholder="How was the food?"
            maxLength={500}
            rows={3}
          />
        </div>

        <Button
          className="w-full"
          disabled={!canSubmit || submitting}
          onClick={handleSubmit}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Submit Feedback
        </Button>
      </div>
    </BottomSheet>
  );
}
