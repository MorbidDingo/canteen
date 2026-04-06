"use client";

import { useCartStore } from "@/lib/store/cart-store";
import { Plus, Minus } from "lucide-react";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

interface AddToCartButtonProps {
  menuItemId: string;
  name: string;
  price: number;
  discountedPrice?: number | null;
  availableUnits?: number | null;
  available?: boolean;
  category?: string;
  canteenId: string;
  canteenName: string;
  compact?: boolean;
  /** Show "ADD +" label instead of icon-only circle */
  showLabel?: boolean;
}

export function AddToCartButton({
  menuItemId,
  name,
  price,
  discountedPrice,
  availableUnits,
  available = true,
  category,
  canteenId,
  canteenName,
  compact = false,
  showLabel = false,
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

  const handleAdd = useCallback(() => {
    if (isSoldOut || atMax) return;
    addItem({ menuItemId, name, price, canteenId, canteenName, ...(discountedPrice != null ? { discountedPrice } : {}), ...(category ? { category } : {}) });
  }, [isSoldOut, atMax, addItem, menuItemId, name, price, canteenId, canteenName, discountedPrice, category]);

  const handleDecrement = useCallback(() => {
    if (quantity <= 1) {
      updateQuantity(menuItemId, 0);
    } else {
      updateQuantity(menuItemId, quantity - 1);
    }
  }, [quantity, updateQuantity, menuItemId]);

  // Sold out / unavailable state
  if (isSoldOut || !available) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
          compact ? "h-7 px-2.5" : "h-9 px-4",
        )}
      >
        {!available ? "Unavailable" : "Sold Out"}
      </span>
    );
  }

  // With quantity — pill shape "- N +"
  if (quantity > 0) {
    return (
      <div
        className={cn(
          "inline-flex items-center rounded-full bg-primary text-primary-foreground",
          compact ? "h-8 gap-1" : "h-9 gap-1.5",
        )}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleDecrement(); }}
          className={cn(
            "flex items-center justify-center rounded-full transition-opacity active:opacity-70",
            compact ? "h-8 w-8" : "h-9 w-9",
          )}
        >
          <Minus className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
        </button>
        <span className={cn("font-bold tabular-nums min-w-[1ch] text-center", compact ? "text-xs" : "text-sm")}>
          {quantity}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleAdd(); }}
          disabled={atMax}
          className={cn(
            "flex items-center justify-center rounded-full transition-opacity active:opacity-70 disabled:opacity-40",
            compact ? "h-8 w-8" : "h-9 w-9",
          )}
        >
          <Plus className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
        </button>
      </div>
    );
  }

  // Initial state — "ADD +" label or circular "+" button
  if (showLabel) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleAdd(); }}
        className="flex items-center justify-center gap-1 rounded-lg bg-primary text-primary-foreground px-3 h-8 text-[12px] font-bold uppercase tracking-wide shadow-md active:scale-95 transition-transform"
      >
        ADD <Plus className="h-3 w-3" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); handleAdd(); }}
      className={cn(
        "flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md active:scale-95 transition-transform",
        compact ? "h-8 w-8" : "h-9 w-9",
      )}
    >
      <Plus className={cn("h-4 w-4", compact && "h-3.5 w-3.5")} />
    </button>
  );
}
