"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Card,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { AddToCartButton } from "@/components/add-to-cart-button";
import {
  MENU_CATEGORIES,
  MENU_CATEGORY_LABELS,
  type MenuCategory,
} from "@/lib/constants";
import {
  UtensilsCrossed,
  Coffee,
  Cookie,
  Search,
  SlidersHorizontal,
  X,
  ArrowUpDown,
  Package,
  Percent,
  Tag,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { MenuRecommendations } from "./recommendations/menu-recs";
import { AiQuickBar } from "./ai/ai-quick-bar";
import { CanteenSelector } from "@/components/canteen-selector";

const categoryIcons: Record<MenuCategory, React.ElementType> = {
  SNACKS: Cookie,
  MEALS: UtensilsCrossed,
  DRINKS: Coffee,
  PACKED_FOOD: Package,
};

/* ── Image component with loading skeleton & error fallback ── */
function MenuItemImage({
  src,
  alt,
  category,
}: {
  src: string | null;
  alt: string;
  category: MenuCategory;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    src ? "loading" : "error",
  );

  // Reset status when src changes
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setStatus(src ? "loading" : "error");
  }

  if (!src || status === "error") {
    const Icon = categoryIcons[category] ?? UtensilsCrossed;
    return (
      <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted/30 to-muted/60">
        <Icon className="h-10 w-10 text-muted-foreground/30" />
      </div>
    );
  }

    
  return (
    <>
      {status === "loading" && (
        <div className="absolute inset-0 animate-pulse bg-muted/60" />
      )}
      <Image
        src={src}
        alt={alt}
        fill
        className={cn(
          "object-cover transition-all duration-500 group-hover:scale-105",
          status === "loading" ? "opacity-0" : "opacity-100",
        )}
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("error")}
      />
    </>
  );
}

function MenuItemMedia({
  item,
  expanded = false,
}: {
  item: MenuItem;
  expanded?: boolean;
}) {
  const mediaImages = [item.imageUrl, ...(item.additionalImages ?? [])].filter(
    (value): value is string => Boolean(value),
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playingVideo, setPlayingVideo] = useState(false);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragStartTs, setDragStartTs] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const showCarouselControls = mediaImages.length > 1;
  const currentImage = mediaImages[currentIndex] ?? null;

  const prevImage = () => {
    setPlayingVideo(false);
    setCurrentIndex((prev) => (prev - 1 + mediaImages.length) % mediaImages.length);
  };

  const nextImage = () => {
    setPlayingVideo(false);
    setCurrentIndex((prev) => (prev + 1) % mediaImages.length);
  };

  const handleSwipeEnd = (endX: number) => {
    if (dragStartX == null || dragStartTs == null || mediaImages.length < 2) return;

    const deltaX = endX - dragStartX;
    const elapsedMs = Math.max(1, Date.now() - dragStartTs);
    const velocity = Math.abs(deltaX) / elapsedMs;

    setDragStartX(null);
    setDragStartTs(null);
    setIsDragging(false);

    const crossedDistance = Math.abs(deltaX) > 40;
    const crossedVelocity = velocity > 0.6;
    if (!crossedDistance && !crossedVelocity) return;

    if (deltaX > 0) prevImage();
    else nextImage();
  };

  // Collapsed: just the main photo + video button
  if (!expanded) {
    return (
      <>
        {playingVideo && item.videoUrl ? (
          <video
            src={item.videoUrl}
            autoPlay
            playsInline
            controls
            className="h-full w-full object-cover"
          />
        ) : (
          <MenuItemImage
            src={item.imageUrl}
            alt={item.name}
            category={item.category as MenuCategory}
          />
        )}
        {item.videoUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setPlayingVideo((prev) => !prev);
            }}
            className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition-transform hover:scale-110 hover:bg-black/75"
            aria-label={playingVideo ? "Show images" : "Play video"}
          >
            {playingVideo ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-white" />}
          </button>
        )}
        {mediaImages.length > 1 && (
          <span className="absolute bottom-2 left-2 z-10 flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
            1/{mediaImages.length}
          </span>
        )}
      </>
    );
  }

  // Expanded: full carousel with nav controls
  return (
    <>
      {playingVideo && item.videoUrl ? (
        <video
          src={item.videoUrl}
          autoPlay
          playsInline
          controls
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className={cn(
            "relative h-full w-full select-none",
            showCarouselControls && "cursor-grab active:cursor-grabbing",
            isDragging && "cursor-grabbing",
          )}
          onPointerDown={(e) => {
            if (!showCarouselControls) return;
            setDragStartX(e.clientX);
            setDragStartTs(Date.now());
            setIsDragging(true);
          }}
          onPointerUp={(e) => handleSwipeEnd(e.clientX)}
          onPointerCancel={() => {
            setDragStartX(null);
            setDragStartTs(null);
            setIsDragging(false);
          }}
          onPointerLeave={(e) => {
            if (!isDragging) return;
            handleSwipeEnd(e.clientX);
          }}
        >
          {mediaImages.length > 0 ? (
            <div className="absolute inset-0 overflow-hidden">
              <div
                className="flex h-full w-full transition-transform duration-300 ease-out"
                style={{ transform: `translate3d(-${currentIndex * 100}%, 0, 0)` }}
              >
                {mediaImages.map((imageSrc, imageIndex) => (
                  <div key={`${item.id}-img-${imageIndex}`} className="relative h-full w-full shrink-0">
                    <MenuItemImage
                      src={imageSrc}
                      alt={`${item.name} ${imageIndex + 1}`}
                      category={item.category as MenuCategory}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <MenuItemImage
              src={currentImage}
              alt={item.name}
              category={item.category as MenuCategory}
            />
          )}
          {showCarouselControls && (
            <>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); prevImage(); }}
                className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 md:h-7 md:w-7"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); nextImage(); }}
                className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 md:h-7 md:w-7"
                aria-label="Next image"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}

      {item.videoUrl && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPlayingVideo((prev) => !prev); }}
          className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition-transform hover:scale-110 hover:bg-black/75"
          aria-label={playingVideo ? "Show images" : "Play video"}
        >
          {playingVideo ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-white" />}
        </button>
      )}

      {showCarouselControls && (
        <span className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
          {currentIndex + 1}/{mediaImages.length}
        </span>
      )}
    </>
  );
}

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

type SortOption =
  | "default"
  | "price-asc"
  | "price-desc"
  | "name-asc"
  | "name-desc";

type CategoryFilter = "ALL" | MenuCategory;

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "price-asc", label: "Price: Low -> High" },
  { value: "price-desc", label: "Price: High -> Low" },
  { value: "name-asc", label: "Name: A -> Z" },
  { value: "name-desc", label: "Name: Z -> A" },
];

export default function MenuClient({
  items,
  selectedCanteen,
  onCanteenChange,
}: {
  items: MenuItem[];
  selectedCanteen?: string | null;
  onCanteenChange?: (v: string | null) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [discountsOnly, setDiscountsOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [dismissDiscountBanner, setDismissDiscountBanner] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<MenuItem | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const certePlusStatus = useCertePlusStore((s) => s.status);
  const certePlusActive = certePlusStatus?.active === true;


  const discountedItems = useMemo(
    () => items.filter((i) => i.discountedPrice != null),
    [items],
  );

  const bestDiscount = useMemo(() => {
    if (discountedItems.length === 0) return null;
    return discountedItems.reduce((best, item) => {
      const saving = item.price - (item.discountedPrice ?? item.price);
      const bestSaving = best.price - (best.discountedPrice ?? best.price);
      return saving > bestSaving ? item : best;
    }, discountedItems[0]);
  }, [discountedItems]);

  const priceRange = useMemo(() => {
    if (items.length === 0) return { min: 0, max: 100 };
    const prices = items.map((i) => i.price);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [items]);

  const categoryCounts = useMemo(() => {
    return Object.values(MENU_CATEGORIES).reduce(
      (acc, category) => {
        acc[category] = items.filter((item) => item.category === category).length;
        return acc;
      },
      {} as Record<MenuCategory, number>,
    );
  }, [items]);

  const searchSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];

    for (const item of items) {
      const label = item.name.trim();
      const key = label.toLowerCase();
      if (!label || seen.has(key)) continue;
      seen.add(key);
      names.push(label);
      if (names.length >= 12) break;
    }

    return names;
  }, [items]);

  useEffect(() => {
    if (searchQuery.trim() || searchFocused || searchSuggestions.length <= 1) return;

    const timer = setInterval(() => {
      setSuggestionIndex((prev) => (prev + 1) % searchSuggestions.length);
    }, 2200);

    return () => clearInterval(timer);
  }, [searchFocused, searchQuery, searchSuggestions.length]);

  const filteredItems = useMemo(() => {
    let result = [...items];

    if (discountsOnly) {
      result = result.filter((item) => item.discountedPrice != null);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q)),
      );
    }

    const maxP = parseFloat(maxPrice);
    if (!isNaN(maxP) && maxP > 0) {
      result = result.filter((item) => item.price <= maxP);
    }

    if (categoryFilter !== "ALL") {
      result = result.filter((item) => item.category === categoryFilter);
    }

    switch (sortBy) {
      case "price-asc":
        result.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        result.sort((a, b) => b.price - a.price);
        break;
      case "name-asc":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      default:
        break;
    }

    // Sort unavailable items to the end
    result.sort((a, b) => {
      if (a.available === b.available) return 0;
      return a.available ? -1 : 1;
    });

    return result;
  }, [items, discountsOnly, searchQuery, maxPrice, categoryFilter, sortBy]);

  const hasActiveFilters =
    searchQuery.trim() ||
    maxPrice ||
    sortBy !== "default" ||
    discountsOnly ||
    categoryFilter !== "ALL";

  const clearFilters = () => {
    setSearchQuery("");
    setMaxPrice("");
    setSortBy("default");
    setDiscountsOnly(false);
    setCategoryFilter("ALL");
  };

  const activeSuggestion =
    searchSuggestions.length > 0
      ? searchSuggestions[suggestionIndex % searchSuggestions.length]
      : "menu item";

  return (
    <>
      {/* ── Search + Canteen selector row — sticky below header+tabs ── */}
      <div
        className="sticky z-30 mb-0 bg-background pt-3 pb-2 animate-fade-in"
        style={{ top: 'calc(var(--header-h, 56px) + var(--tabs-h, 56px))' } as React.CSSProperties}
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={
                searchQuery.trim()
                  ? "Search menu..."
                  : `Try "${activeSuggestion}"`
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="rounded-xl border-border/60 bg-muted/40 pl-9 pr-9 h-10 focus:bg-background transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {/* Canteen selector: icon-only on mobile, full on sm+ */}
          {onCanteenChange != null && (
            <>
              <div className="flex sm:hidden">
                <CanteenSelector
                  value={selectedCanteen}
                  onChange={onCanteenChange}
                  iconOnly
                  includeInactive
                />
              </div>
              <div className="hidden sm:flex">
                <CanteenSelector
                  value={selectedCanteen}
                  onChange={onCanteenChange}
                  compact
                  includeInactive
                  className="w-[180px]"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Category filter chips + filter icon ── */}
      <div className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none animate-fade-in">
        <button
          type="button"
          onClick={() => setCategoryFilter("ALL")}
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
            categoryFilter === "ALL"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted/60 text-muted-foreground hover:bg-muted",
          )}
        >
          All ({items.length})
        </button>
        {Object.values(MENU_CATEGORIES).map((value) => {
          const count = categoryCounts[value] ?? 0;
          if (count === 0) return null;
          const CatIcon = categoryIcons[value];
          return (
            <button
              key={value}
              type="button"
              onClick={() => setCategoryFilter(value)}
              className={cn(
                "shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                categoryFilter === value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted",
              )}
            >
              <CatIcon className="h-3 w-3" />
              {MENU_CATEGORY_LABELS[value]} ({count})
            </button>
          );
        })}
        {/* Filter button — always at end of chip row */}
        <Button
          variant={showFilters ? "secondary" : "outline"}
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          className="relative shrink-0 h-7 w-7 rounded-full border-border/60 ml-auto"
        >
          <SlidersHorizontal className="h-3 w-3" />
          {hasActiveFilters && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary" />
          )}
        </Button>
      </div>

      {/* ── Suggested for you — expandable */}
      {certePlusActive && (
        <div className="mb-4 animate-fade-in">
          <button
            type="button"
            onClick={() => setShowSuggestions((prev) => !prev)}
            className="group relative flex w-full items-center justify-between overflow-hidden rounded-2xl border border-amber-300/45 bg-gradient-to-r from-amber-50 via-white to-orange-50 px-4 py-3 text-left shadow-sm transition-all hover:border-amber-400/60 dark:border-amber-500/20 dark:from-amber-950/25 dark:via-card dark:to-orange-950/20"
          >
            <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-80 animate-shine-sweep dark:via-white/20" />
            <div className="relative z-10 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-sm font-semibold tracking-tight">Suggested for you</p>
                <p className="text-xs text-muted-foreground">
                  Personalized picks, AI shortcuts, and smarter ordering.
                </p>
              </div>
            </div>
            <ChevronDown
              className={cn(
                "relative z-10 h-4 w-4 shrink-0 text-amber-700 transition-transform duration-200 dark:text-amber-300",
                showSuggestions && "rotate-180",
              )}
            />
          </button>

          {showSuggestions && (
            <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <AiQuickBar />
              <MenuRecommendations />
            </div>
          )}
        </div>
      )}

      {/* ── Discount banner — slim, elegant ── */}
      {discountedItems.length > 0 && !discountsOnly && !dismissDiscountBanner && (
        <div className="relative mb-4 overflow-hidden rounded-xl border border-amber-200/50 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 dark:border-amber-300/15 animate-fade-in">
          <button
            onClick={() => setDiscountsOnly(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <Tag className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {discountedItems.length} item{discountedItems.length > 1 ? "s" : ""} on discount
              </p>
              {bestDiscount && (
                <p className="text-xs text-amber-700/80 dark:text-amber-400/70 truncate">
                  Save up to ₹{(bestDiscount.price - (bestDiscount.discountedPrice ?? bestDiscount.price)).toFixed(0)} on {bestDiscount.name}
                </p>
              )}
            </div>
            <Badge variant="secondary" className="shrink-0 text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0">
              View
            </Badge>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 z-20 h-6 w-6 rounded-full text-amber-600 hover:text-amber-800 hover:bg-amber-100/60"
            onClick={(e) => {
              e.stopPropagation();
              setDismissDiscountBanner(true);
            }}
            aria-label="Dismiss discount banner"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {discountsOnly && (
        <div className="flex items-center gap-2 mb-4 animate-fade-in justify-between w-full">
          <Badge className="border border-amber-200/70 bg-amber-100 text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/15 dark:text-amber-200 gap-1 py-1 px-3">
            <Tag className="h-3 w-3" />
            Showing discounted items only
          </Badge>
          <Button variant="ghost" onClick={() => setDiscountsOnly(false)}>
            <X className="bg-none" />
          </Button>
        </div>
      )}

      {/* ── Expanded filters panel ── */}
      {showFilters && (
        <div className="mb-4 flex flex-col sm:flex-row gap-3 rounded-xl border border-border/50 bg-muted/30 p-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Max Price (₹)</Label>
            <Input
              type="number"
              placeholder={`Up to ₹${priceRange.max}`}
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              min={0}
              className="h-9 rounded-lg border-border/60"
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Sort By</Label>
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as SortOption)}
            >
              <SelectTrigger className="h-9 rounded-lg border-border/60">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters && (
            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-xs gap-1 h-9"
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            </div>
          )}
        </div>
      )}

      {hasActiveFilters && (
        <p className="text-xs text-muted-foreground mb-3 animate-fade-in">
          Showing {filteredItems.length} of {items.length} items
          {searchQuery.trim() && (
            <>
              {" "}
              matching &quot;
              <span className="font-medium text-foreground">
                {searchQuery.trim()}
              </span>
              &quot;
            </>
          )}
          {categoryFilter !== "ALL" && (
            <> in {MENU_CATEGORY_LABELS[categoryFilter]}</>
          )}
          {maxPrice && !isNaN(parseFloat(maxPrice)) && (
            <> under ₹{parseFloat(maxPrice)}</>
          )}
        </p>
      )}

      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
          <Search className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-semibold">No items found</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Try adjusting your search or filters
          </p>
          <Button variant="link" className="mt-2" onClick={clearFilters}>
            Clear all filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item, index) => (
            <Card
              key={item.id}
              className={cn(
                "flex min-h-[7.4rem] flex-row card-interactive animate-fade-in-up overflow-hidden p-0 group h-auto",
                !item.available && "opacity-60",
              )}
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              {/* Content — left side */}
              <div className="flex min-w-0 flex-1 flex-col justify-between py-3.5 pl-3 pr-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm leading-snug line-clamp-1">{item.name}</CardTitle>
                  <div className="flex items-center gap-1.5">
                    {item.discountedPrice != null ? (
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">₹{item.discountedPrice}</span>
                        <span className="text-[10px] text-muted-foreground line-through">₹{item.price}</span>
                      </div>
                    ) : (
                      <span className="text-sm font-bold">₹{item.price}</span>
                    )}
                    {item.discountedPrice != null && item.discountInfo && (
                      <Badge className="h-4 bg-emerald-600 hover:bg-emerald-600 text-white text-[8px] px-1 py-0 gap-0.5">
                        <Percent className="h-2 w-2" />
                        {item.discountInfo.type === "PERCENTAGE"
                          ? `${item.discountInfo.value}%`
                          : `₹${item.discountInfo.value}`}
                      </Badge>
                    )}
                    {item.availableUnits != null && item.availableUnits > 0 && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-auto">
                        {item.availableUnits} left
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-1.5">
                  <AddToCartButton
                    menuItemId={item.id}
                    name={item.name}
                    price={item.price}
                    discountedPrice={item.discountedPrice}
                    availableUnits={item.availableUnits}
                    available={item.available}
                    canteenId={item.canteenId ?? ""}
                    canteenName={item.canteenName ?? "Unknown"}
                    compact
                  />
                </div>
              </div>

              {/* Image — right side, small square; click to open lightbox */}
              <div
                role="button"
                tabIndex={0}
                aria-label="View photos"
                onClick={() => setLightboxItem(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setLightboxItem(item);
                  }
                }}
                className="relative aspect-square w-28 shrink-0 overflow-hidden bg-muted/40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:w-32"
              >
                <MenuItemMedia item={item} />
                {/* Sold out overlay */}
                {item.availableUnits === 0 && item.available && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                    <Badge variant="destructive" className="text-[9px] font-semibold px-1.5 py-0.5">
                      Sold Out
                    </Badge>
                  </div>
                )}
                {/* Unavailable overlay */}
                {!item.available && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                    <Badge variant="outline" className="text-[9px] font-semibold px-1.5 py-0.5 border-muted-foreground/40 text-muted-foreground">
                      N/A
                    </Badge>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Photo lightbox */}
      {lightboxItem && (
        <Dialog open={!!lightboxItem} onOpenChange={(open) => { if (!open) setLightboxItem(null); }}>
          <DialogContent className="max-w-[360px] gap-0 overflow-hidden rounded-2xl p-0">
            <div className="relative aspect-square w-full overflow-hidden bg-muted">
              <MenuItemMedia item={lightboxItem} expanded />
            </div>
            <div className="px-4 py-3">
              <h3 className="font-semibold text-sm leading-snug">{lightboxItem.name}</h3>
              {lightboxItem.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{lightboxItem.description}</p>
              )}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                {lightboxItem.discountedPrice != null ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">₹{lightboxItem.discountedPrice}</span>
                    <span className="text-[10px] text-muted-foreground line-through">₹{lightboxItem.price}</span>
                  </div>
                ) : (
                  <span className="text-sm font-bold">₹{lightboxItem.price}</span>
                )}
                <AddToCartButton
                  menuItemId={lightboxItem.id}
                  name={lightboxItem.name}
                  price={lightboxItem.price}
                  discountedPrice={lightboxItem.discountedPrice}
                  availableUnits={lightboxItem.availableUnits}
                  available={lightboxItem.available}
                  canteenId={lightboxItem.canteenId ?? ""}
                  canteenName={lightboxItem.canteenName ?? "Unknown"}
                  compact
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

    </>
  );
}
