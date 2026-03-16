"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { UtensilsCrossed, Loader2, Lock, Sparkles } from "lucide-react";
import MenuClient from "../../../components/menu-client";
import { useRealtimeData } from "@/lib/events";
import { Button } from "@/components/ui/button";

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
  const [certePlusActive, setCertePlusActive] = useState<boolean | null>(null);

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
    fetchMenu();
    fetch("/api/certe-plus")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCertePlusActive(data.active === true);
      })
      .catch(() => {});
  }, [fetchMenu]);

  // Instant refresh via SSE when admin updates menu
  useRealtimeData(fetchMenu, "menu-updated");

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Menu</h1>
        <p className="text-muted-foreground">
          Browse our menu and add items to your cart
        </p>
      </div>

      <div className="md:hidden mb-4 rounded-lg border p-1 inline-flex gap-1">
        <Link href="/menu">
          <Button type="button" variant="secondary" size="sm">
            Menu
          </Button>
        </Link>
        <Link href="/pre-orders">
          {certePlusActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="bg-gradient-to-r from-gray-900 to-black text-transparent bg-clip-text font-semibold border-0"
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
    </div>
  );
}
