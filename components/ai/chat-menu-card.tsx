"use client";

import { useCartStore } from "@/lib/store/cart-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "@/components/ui/motion";
import { Plus, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

export interface ChatMenuItem {
  menuItemId: string;
  name: string;
  price: number;
  discountedPrice?: number;
  category: string;
  available: boolean;
  reasons?: string[];
}

export function ChatMenuCard({ item }: { item: ChatMenuItem }) {
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const inCart = cartItems.some((c) => c.menuItemId === item.menuItemId);
  const displayPrice = item.discountedPrice ?? item.price;
  const hasDiscount =
    item.discountedPrice != null && item.discountedPrice < item.price;
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/80 p-3 backdrop-blur"
    >
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold leading-tight">
            {item.name}
          </span>
          {hasDiscount && (
            <Badge variant="vibrant" className="shrink-0 text-[9px] px-1.5 py-0">
              Sale
            </Badge>
          )}
        </div>

        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-[13px] font-bold text-primary">
            ₹{displayPrice}
          </span>
          {hasDiscount && (
            <span className="text-[11px] text-muted-foreground line-through">
              ₹{item.price}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            · {item.category}
          </span>
        </div>

        {item.reasons && item.reasons.length > 0 && (
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2">
            {item.reasons.join(" · ")}
          </p>
        )}
      </div>

      {/* Action */}
      <Button
        size="sm"
        variant={inCart ? "outline" : "default"}
        disabled={!item.available}
        className={cn(
          "shrink-0 gap-1 rounded-xl text-[12px]",
          !item.available && "opacity-50",
        )}
        onClick={() => {
          if (!item.available) return;
          if (inCart) {
            router.push("/cart");
          } else {
            addItem({
              menuItemId: item.menuItemId,
              name: item.name,
              price: item.price,
              discountedPrice: item.discountedPrice,
            });
          }
        }}
      >
        {!item.available ? (
          "Unavailable"
        ) : inCart ? (
          <>
            <ShoppingCart className="h-3 w-3" />
            View Cart
          </>
        ) : (
          <>
            <Plus className="h-3 w-3" />
            Add
          </>
        )}
      </Button>
    </motion.div>
  );
}

/** Render a group of menu cards from the chat */
export function ChatMenuCardList({ items }: { items: ChatMenuItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {items.map((item) => (
        <ChatMenuCard key={item.menuItemId} item={item} />
      ))}
    </div>
  );
}
