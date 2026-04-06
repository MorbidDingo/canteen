"use client";

import { useEffect, useState } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { motion } from "@/components/ui/motion";
import { Plus, ShoppingCart, Loader2 } from "lucide-react";
import Image from "next/image";

interface Recommendation {
  menuItemId: string;
  name: string;
  category: string;
  price: number;
  score: number;
  reasons: string[];
  canteenId?: string;
  canteenName?: string;
  imageUrl?: string | null;
}

export function MenuRecommendations({
  onItemClick,
}: {
  onItemClick?: (menuItemId: string) => void;
}) {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/recommendations/daily")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.recommendations) {
          setRecs(data.recommendations.slice(0, 6));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-[12px] text-muted-foreground">Loading suggestions…</span>
      </div>
    );
  }

  if (recs.length === 0) return null;

  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
      {recs.map((rec) => (
        <RecCard key={rec.menuItemId} rec={rec} onItemClick={onItemClick} />
      ))}
    </div>
  );
}

function RecCard({
  rec,
  onItemClick,
}: {
  rec: Recommendation;
  onItemClick?: (menuItemId: string) => void;
}) {
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const inCart = cartItems.some((c) => c.menuItemId === rec.menuItemId);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex shrink-0 w-[140px] flex-col overflow-hidden rounded-xl border border-border/60 bg-card"
    >
      {/* Tappable photo / placeholder */}
      <button
        type="button"
        onClick={() => onItemClick?.(rec.menuItemId)}
        className="relative h-[100px] w-full bg-muted/30 overflow-hidden"
      >
        {rec.imageUrl ? (
          <Image
            src={rec.imageUrl}
            alt={rec.name}
            fill
            className="object-cover"
            sizes="140px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/25 text-2xl font-bold">
            {rec.name.charAt(0)}
          </div>
        )}
        {/* Price badge */}
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur-sm">
          ₹{rec.price}
        </span>
      </button>

      {/* Info + add */}
      <div className="flex flex-col gap-1 p-2">
        <button
          type="button"
          onClick={() => onItemClick?.(rec.menuItemId)}
          className="text-left"
        >
          <p className="text-[13px] font-semibold leading-tight line-clamp-1">{rec.name}</p>
          {rec.reasons.length > 0 && (
            <p className="text-[10px] text-muted-foreground/70 line-clamp-1 mt-0.5">{rec.reasons[0]}</p>
          )}
        </button>

        <button
          type="button"
          className={
            inCart
              ? "mt-0.5 flex h-7 items-center justify-center gap-1 rounded-lg border border-border text-[11px] font-medium text-muted-foreground"
              : "mt-0.5 flex h-7 items-center justify-center gap-1 rounded-lg bg-primary text-[11px] font-medium text-primary-foreground"
          }
          onClick={(e) => {
            e.stopPropagation();
            if (!inCart) {
              addItem({
                menuItemId: rec.menuItemId,
                name: rec.name,
                price: rec.price,
                canteenId: rec.canteenId ?? "",
                canteenName: rec.canteenName ?? "Unknown",
              });
            }
          }}
        >
          {inCart ? (
            <>
              <ShoppingCart className="h-3 w-3" />
              In Cart
            </>
          ) : (
            <>
              <Plus className="h-3 w-3" />
              Add
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
