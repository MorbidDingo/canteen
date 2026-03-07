"use client";

import { Button } from "@/components/ui/button";
import { useCartStore } from "@/lib/store/cart-store";
import { Plus, Check } from "lucide-react";
import { useState } from "react";
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
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    addItem({ menuItemId, name, price });
    toast.success(`${name} added to cart`);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <Button
      size="sm"
      className="w-full gap-2 transition-all duration-200 active:scale-95"
      onClick={handleAdd}
      variant={added ? "secondary" : "default"}
    >
      {added ? (
        <>
          <Check className="h-4 w-4 animate-bounce-subtle" />
          Added
        </>
      ) : (
        <>
          <Plus className="h-4 w-4" />
          Add to Cart
        </>
      )}
    </Button>
  );
}
