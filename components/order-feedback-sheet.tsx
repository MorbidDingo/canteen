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
  healthyRating: "Food",
  tasteRating: "Packaging",
  quantityRating: "Service",
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
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium w-20 shrink-0">{label}</span>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="p-0.5 active:scale-90 transition-transform"
          >
            <Star
              className={cn(
                "h-7 w-7 transition-colors",
                star <= value
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/20",
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
      snapPoints={[50]}
    >
      <div className="px-5 pb-8 pt-2 space-y-5">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Rate your order</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Help us improve
          </p>
        </div>

        <div className="space-y-4">
          <StarPicker
            label="Food"
            value={healthyRating}
            onChange={setHealthyRating}
          />
          <StarPicker
            label="Packaging"
            value={tasteRating}
            onChange={setTasteRating}
          />
          <StarPicker
            label="Service"
            value={quantityRating}
            onChange={setQuantityRating}
          />
        </div>

        <Textarea
          value={overallReview}
          onChange={(e) => setOverallReview(e.target.value)}
          placeholder="Anything else? (optional)"
          maxLength={500}
          rows={2}
          className="rounded-xl text-sm"
        />

        <Button
          className="w-full h-12 rounded-2xl"
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
