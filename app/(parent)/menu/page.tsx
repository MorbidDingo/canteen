"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { UtensilsCrossed, Loader2, Lock, Sparkles, ShoppingCart, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import MenuClient from "../../../components/menu-client";
import { useRealtimeData } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { AiQuickBar } from "@/components/ai/ai-quick-bar";
import { MenuRecommendations } from "@/components/recommendations/menu-recs";
import { useCartStore } from "@/lib/store/cart-store";
import { AnimatePresence, motion } from "framer-motion";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  discountedPrice?: number | null;
  discountInfo?: { type: string; value: number; mode: string } | null;
  category: string;
  imageUrl: string | null;
  available: boolean;
  availableUnits?: number | null;
}

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const certePlusStatus = useCertePlusStore((s) => s.status);
  const certePlusActive = certePlusStatus?.active === true;
  const certePlusResolved = certePlusStatus !== null;
  const ensureCertePlusFresh = useCertePlusStore((s) => s.ensureFresh);
  const cartCount = useCartStore((s) => s.getItemCount());
  const cartTotal = useCartStore((s) => s.getTotal());
  const router = useRouter();

  const fetchMenu = useCallback(async () => {
    try {
      const res = await fetch("/api/menu");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setItems(data.items);
    } catch {
      // silently fail — items stay as-is
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMenu();
    void ensureCertePlusFresh(45_000);
  }, [fetchMenu, ensureCertePlusFresh]);

  // Instant refresh via SSE when admin updates menu
  useRealtimeData(fetchMenu, "menu-updated");

  if (loading) {
    return (
      <div className="app-shell">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="mb-5 inline-flex w-fit gap-1 rounded-xl border border-border/60 bg-card/60 p-1 shadow-sm">
        <Link href="/menu">
          <Button type="button" variant="secondary" size="sm">
            Menu
          </Button>
        </Link>
        <Link href="/pre-orders">
          {!certePlusResolved ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              disabled
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Pre-Order
            </Button>
          ) : certePlusActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
            >
              <span className="bg-gradient-to-r from-[#f5c862] via-[#e8a230] to-[#d4891a] bg-clip-text text-transparent font-semibold flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-[#e8a230]" />
                Pre-Order
              </span>
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="gap-1">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              Pre-Order
            </Button>
          )}
        </Link>
      </div>

      {/* AI Quick Bar + ML Recommendations — Certe+ only */}
      {certePlusActive && (
        <div className="mb-6 space-y-4">
          <AiQuickBar />
          <MenuRecommendations />
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <UtensilsCrossed className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h2 className="text-lg font-semibold">No items available</h2>
          <p className="text-sm text-muted-foreground">
            The menu is currently empty. Check back later!
          </p>
        </div>
      ) : (
        <MenuClient items={items} />
      )}

      {/* Floating View Cart bar — appears when cart has items */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-[calc(5.4rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 md:hidden pointer-events-auto"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push("/cart");
              }}
              className="flex w-full items-center justify-between rounded-2xl bg-primary px-5 py-3.5 text-primary-foreground shadow-lg"
            >
              <div className="flex items-center gap-2.5">
                <ShoppingCart className="h-5 w-5" />
                <span className="text-sm font-semibold">
                  {cartCount} {cartCount === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">₹{cartTotal.toFixed(0)}</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
