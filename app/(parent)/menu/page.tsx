"use client";

import { useEffect, useState, useCallback } from "react";
import { UtensilsCrossed, Loader2, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import MenuClient from "../../../components/menu-client";
import { useRealtimeData } from "@/lib/events";
import { useCartStore } from "@/lib/store/cart-store";
import { AnimatePresence, motion } from "framer-motion";
import { usePersistedSelection } from "@/lib/use-persisted-selection";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  discountedPrice?: number | null;
  discountInfo?: { type: string; value: number; mode: string } | null;
  category: string;
  imageUrl: string | null;
  videoUrl?: string | null;
  additionalImages?: string[];
  available: boolean;
  availableUnits?: number | null;
  canteenId: string | null;
  canteenName?: string | null;
  canteenLocation?: string | null;
}

type MenuApiResponse = {
  items: MenuItem[];
  selectedCanteenClosed?: boolean;
  selectedCanteenName?: string | null;
  hasActiveCanteens?: boolean;
  activeCanteenCount?: number;
  totalCanteenCount?: number;
};

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [menuMeta, setMenuMeta] = useState<{
    selectedCanteenClosed: boolean;
    selectedCanteenName: string | null;
    hasActiveCanteens: boolean;
    activeCanteenCount: number;
    totalCanteenCount: number;
  }>({
    selectedCanteenClosed: false,
    selectedCanteenName: null,
    hasActiveCanteens: true,
    activeCanteenCount: 0,
    totalCanteenCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const {
    value: selectedCanteen,
    setValue: setSelectedCanteen,
    hydrated: canteenScopeHydrated,
  } = usePersistedSelection("certe:selected-canteen-id");
  const cartCount = useCartStore((s) => s.getItemCount());
  const cartTotal = useCartStore((s) => s.getTotal());
  const router = useRouter();

  const fetchMenu = useCallback(async () => {
    try {
      const url = selectedCanteen
        ? `/api/menu?canteenId=${encodeURIComponent(selectedCanteen)}`
        : "/api/menu";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = (await res.json()) as MenuApiResponse;
      setItems(data.items);
      setMenuMeta({
        selectedCanteenClosed: data.selectedCanteenClosed === true,
        selectedCanteenName: data.selectedCanteenName ?? null,
        hasActiveCanteens: data.hasActiveCanteens !== false,
        activeCanteenCount: data.activeCanteenCount ?? 0,
        totalCanteenCount: data.totalCanteenCount ?? 0,
      });
    } catch {
      // silently fail — items stay as-is
    } finally {
      setLoading(false);
    }
  }, [selectedCanteen]);

  useEffect(() => {
    if (!canteenScopeHydrated) return;
    setLoading(true);
    void fetchMenu();
  }, [fetchMenu, canteenScopeHydrated]);

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
      {menuMeta.selectedCanteenClosed ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <UtensilsCrossed className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <h2 className="text-xl font-semibold tracking-tight">Canteen closed</h2>
          <p className="text-[13px] text-muted-foreground mt-1 max-w-[260px]">
            {menuMeta.selectedCanteenName
              ? `${menuMeta.selectedCanteenName} is not serving right now.`
              : "Please select another active canteen."}
          </p>
        </div>
      ) : !menuMeta.hasActiveCanteens ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <UtensilsCrossed className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <h2 className="text-xl font-semibold tracking-tight">All canteens closed</h2>
          <p className="text-[13px] text-muted-foreground mt-1">
            No canteens are serving at the moment.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <UtensilsCrossed className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <h2 className="text-xl font-semibold tracking-tight">No items available</h2>
          <p className="text-[13px] text-muted-foreground mt-1">
            The menu is currently empty. Check back later!
          </p>
        </div>
      ) : (
        <MenuClient
          items={items}
          selectedCanteen={selectedCanteen}
          onCanteenChange={setSelectedCanteen}
        />
      )}

      {/* Floating cart bar */}
      <AnimatePresence>
        {cartCount > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-5 right-5 z-40 md:hidden pointer-events-auto"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push("/cart");
              }}
              className="flex w-full items-center justify-between rounded-2xl bg-primary px-5 h-14 text-primary-foreground shadow-xl active:scale-[0.98] transition-transform"
            >
              <span className="text-[14px] font-semibold">
                {cartCount} {cartCount === 1 ? "item" : "items"}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-bold tabular-nums">₹{cartTotal.toFixed(0)}</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
