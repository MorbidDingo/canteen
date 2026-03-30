"use client";

import { useEffect, useState } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { Button } from "@/components/ui/button";
import { motion } from "@/components/ui/motion";
import { Sparkles, Plus, ShoppingCart, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface Recommendation {
  menuItemId: string;
  name: string;
  category: string;
  price: number;
  score: number;
  reasons: string[];
  canteenId?: string;
  canteenName?: string;
}

export function MenuRecommendations() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/recommendations/daily")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.recommendations) {
          setRecs(data.recommendations.slice(0, 4));
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
    <div>

        <span className="text-[13px] font-semibold">Suggested for you</span>
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
        {recs.map((rec) => (
          <RecCard key={rec.menuItemId} rec={rec} />
        ))}
      </div>
    </div>
  );
}

function RecCard({ rec }: { rec: Recommendation }) {
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const inCart = cartItems.some((c) => c.menuItemId === rec.menuItemId);
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex shrink-0 w-[160px] flex-col rounded-2xl border border-border/60 bg-background/80 p-3 backdrop-blur"
    >
      <span className="text-[13px] font-semibold leading-tight truncate">
        {rec.name}
      </span>
      <span className="mt-0.5 text-[11px] text-muted-foreground">
        {rec.category} · ₹{rec.price}
      </span>
      {rec.canteenName && (
        <span className="text-[10px] text-muted-foreground/80 truncate">
          {rec.canteenName}
        </span>
      )}
      {rec.reasons.length > 0 && (
        <span className="mt-1 text-[10px] text-muted-foreground/80 line-clamp-1">
          {rec.reasons[0]}
        </span>
      )}
      <Button
        size="xs"
        variant={inCart ? "outline" : "default"}
        className="mt-2 gap-1 rounded-lg text-[11px] w-full"
        onClick={() => {
          if (inCart) {
            router.push("/cart");
          } else {
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
      </Button>
    </motion.div>
  );
}
