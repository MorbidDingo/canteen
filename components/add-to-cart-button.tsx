"use client";

import { Button } from "@/components/ui/button";
import { useCartStore } from "@/lib/store/cart-store";
import { Plus, Minus, ShoppingCart, Check, X } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface AddToCartButtonProps {
  menuItemId: string;
  name: string;
  price: number;
  discountedPrice?: number | null;
  availableUnits?: number | null;
}

export function AddToCartButton({
  menuItemId,
  name,
  price,
  discountedPrice,
  availableUnits,
}: AddToCartButtonProps) {
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const cartItem = useCartStore((s) =>
    s.items.find((i) => i.menuItemId === menuItemId),
  );
  const quantity = cartItem?.quantity ?? 0;
  const isSoldOut = availableUnits === 0;
  const MAX_QTY = 5;
  const maxAllowed = availableUnits != null
    ? Math.min(MAX_QTY, availableUnits)
    : MAX_QTY;
  const atMax = quantity >= maxAllowed;
  const [feedback, setFeedback] = useState<{ type: "added" | "removed"; text: string } | null>(null);

  const showFeedback = useCallback((type: "added" | "removed", text: string) => {
    setFeedback({ type, text });
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 1500);
    return () => clearTimeout(t);
  }, [feedback]);

  const handleAdd = () => {
    if (isSoldOut || atMax) return;
    addItem({ menuItemId, name, price, ...(discountedPrice != null ? { discountedPrice } : {}) });
    showFeedback("added", "Added to cart");
  };

  const handleDecrement = () => {
    if (quantity <= 1) {
      updateQuantity(menuItemId, 0); // removes item
      showFeedback("removed", "Removed");
    } else {
      updateQuantity(menuItemId, quantity - 1);
    }
  };

  if (isSoldOut) {
    return (
      <Button
        size="sm"
        className="w-full gap-2"
        variant="outline"
        disabled
      >
        Sold Out
      </Button>
    );
  }

  if (quantity > 0) {
    return (
      <div className="relative w-full">
        <div className="flex items-center justify-between w-full gap-2">
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            onClick={handleDecrement}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="font-semibold text-sm tabular-nums">{quantity}</span>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            onClick={handleAdd}
            disabled={atMax}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {feedback && (
          <div
            className={cn(
              "absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium shadow-sm whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 duration-200",
              feedback.type === "added"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700",
            )}
          >
            {feedback.type === "added" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {feedback.text}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <Button
        size="sm"
        className="w-full gap-2 transition-all duration-200 active:scale-95"
        onClick={handleAdd}
      >
        <ShoppingCart className="h-4 w-4" />
        Add to Cart
      </Button>
      {feedback && (
        <div
          className={cn(
            "absolute -top-8 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium shadow-sm whitespace-nowrap animate-in fade-in slide-in-from-bottom-2 duration-200",
            feedback.type === "added"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700",
          )}
        >
          {feedback.type === "added" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {feedback.text}
        </div>
      )}
    </div>
  );
}
