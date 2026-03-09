"use client";

import { Button } from "@/components/ui/button";
import { useCartStore } from "@/lib/store/cart-store";
import { Plus, Minus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

interface AddToCartButtonProps {
  menuItemId: string;
  name: string;
  price: number;
}

export function AddToCartButton({
  menuItemId,
  name,
  price,
}: AddToCartButtonProps) {
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const cartItem = useCartStore((s) =>
    s.items.find((i) => i.menuItemId === menuItemId),
  );
  const quantity = cartItem?.quantity ?? 0;

  const handleAdd = () => {
    addItem({ menuItemId, name, price });
    if (quantity === 0) {
      toast.success(`${name} added to cart`);
    }
  };

  const handleDecrement = () => {
    if (quantity <= 1) {
      updateQuantity(menuItemId, 0); // removes item
      toast.info(`${name} removed from cart`);
    } else {
      updateQuantity(menuItemId, quantity - 1);
    }
  };

  if (quantity > 0) {
    return (
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
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      className="w-full gap-2 transition-all duration-200 active:scale-95"
      onClick={handleAdd}
    >
      <ShoppingCart className="h-4 w-4" />
      Add to Cart
    </Button>
  );
}
