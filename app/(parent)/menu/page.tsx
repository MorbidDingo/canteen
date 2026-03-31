"use client";

import { useEffect, useState, useCallback } from "react";
import { UtensilsCrossed, Loader2, Lock, Sparkles, ShoppingCart, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import MenuClient from "../../../components/menu-client";
import PreOrdersPage from "../pre-orders/page";
import { useRealtimeData } from "@/lib/events";
import { Button } from "@/components/ui/button";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { useCartStore } from "@/lib/store/cart-store";
import { CanteenSelector } from "@/components/canteen-selector";
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
  const [activeView, setActiveView] = useState<"menu" | "pre-orders">("menu");
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
  const certePlusStatus = useCertePlusStore((s) => s.status);
  const certePlusActive = certePlusStatus?.active === true;
  const certePlusResolved = certePlusStatus !== null;
  const ensureCertePlusFresh = useCertePlusStore((s) => s.ensureFresh);
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
    void ensureCertePlusFresh(45_000);
  }, [fetchMenu, ensureCertePlusFresh, canteenScopeHydrated]);

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
      {/* Top row: Menu/Pre-order tabs + Canteen selector */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="inline-flex w-fit gap-1 rounded-xl border border-border/60 p-1 shadow-sm">
          <Button
            type="button"
            variant={activeView === "menu" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveView("menu")}
          >
            Menu
          </Button>
          {!certePlusResolved ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground"
              disabled
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Pre-Orders
            </Button>
          ) : certePlusActive ? (
            <Button
              type="button"
              variant={activeView === "pre-orders" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveView("pre-orders")}
            >
              <span className="bg-gradient-to-r from-[#f5c862] via-[#e8a230] to-[#d4891a] bg-clip-text text-transparent font-semibold flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-[#e8a230]" />
                Pre-Orders
              </span>
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="gap-1" disabled>
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              Pre-Orders
            </Button>
          )}
        </div>

        {/* Canteen selector — only for menu view */}
        {activeView === "menu" && (
          <CanteenSelector
            value={selectedCanteen}
            onChange={setSelectedCanteen}
            showAll
            compact
            includeInactive
          />
        )}
      </div>

      {activeView === "pre-orders" ? (
        <PreOrdersPage embedded />
      ) : menuMeta.selectedCanteenClosed ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <UtensilsCrossed className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h2 className="text-lg font-semibold">This canteen is currently closed</h2>
          <p className="text-sm text-muted-foreground">
            {menuMeta.selectedCanteenName
              ? `${menuMeta.selectedCanteenName} is not serving right now. Please select another canteen.`
              : "Please select another active canteen."}
          </p>
        </div>
      ) : !menuMeta.hasActiveCanteens ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <UtensilsCrossed className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h2 className="text-lg font-semibold">All canteens are closed</h2>
          <p className="text-sm text-muted-foreground">
            No active canteens are serving at the moment. Please check again later.
          </p>
        </div>
      ) : items.length === 0 ? (
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
