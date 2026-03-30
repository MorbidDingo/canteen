"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
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
  Sparkles,
  Tag,
  Store,
  MapPin,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { MenuRecommendations } from "./recommendations/menu-recs";
import { AiQuickBar } from "./ai/ai-quick-bar";

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

/* ── Video player overlay — fullscreen with mute toggle ── */
function VideoPlayerOverlay({
  videoUrl,
  onClose,
}: {
  videoUrl: string;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (videoRef.current) videoRef.current.muted = !m;
      return !m;
    });
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
        aria-label="Close video"
      >
        <X className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={toggleMute}
        className="absolute bottom-6 right-6 z-10 flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 transition-colors"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇 Muted" : "🔊 Sound On"}
      </button>
      <video
        ref={videoRef}
        src={videoUrl}
        autoPlay
        playsInline
        muted={muted}
        controls={false}
        className="max-h-[80vh] max-w-[90vw] rounded-2xl"
        onClick={onClose}
      />
    </div>
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

export default function MenuClient({ items }: { items: MenuItem[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [discountsOnly, setDiscountsOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [dismissDiscountBanner, setDismissDiscountBanner] = useState(false);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
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
      {/* ── Search — clean, prominent, always visible ── */}
      <div className="mb-4 animate-fade-in">
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
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className="relative shrink-0 h-10 w-10 rounded-xl border-border/60"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />
            )}
          </Button>
        </div>
      </div>

      {/* ── AI Quick Bar — compact horizontal chip strip for certe+ ── */}
      {certePlusActive && (
        <div className="mb-4 animate-fade-in">
          <AiQuickBar />
          <MenuRecommendations />
        </div>
      )}

      {/* ── Category filter chips — horizontal scroll ── */}
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
      </div>

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
        <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item, index) => (
            <Card
              key={item.id}
              className={cn(
                "flex flex-col card-interactive animate-fade-in-up p-0 overflow-hidden group",
                !item.available && "opacity-60",
              )}
              style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
            >
              {/* Image area with consistent aspect ratio */}
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/40">
                <MenuItemImage
                  src={item.imageUrl}
                  alt={item.name}
                  category={item.category as MenuCategory}
                />
                {/* Video play button — top right */}
                {item.videoUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPlayingVideoUrl(item.videoUrl!);
                    }}
                    className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition-transform hover:scale-110 hover:bg-black/75"
                    aria-label="Play video"
                  >
                    <Play className="h-3.5 w-3.5 fill-white" />
                  </button>
                )}
                {/* Category badge on image */}
                <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] backdrop-blur-sm bg-background/80 shadow-sm">
                  {MENU_CATEGORY_LABELS[item.category as MenuCategory]}
                </Badge>
                {/* Discount badge on image — shifts if video button present */}
                {item.discountedPrice != null && (
                  <Badge className={cn(
                    "absolute bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] gap-0.5 shadow-sm",
                    item.videoUrl ? "top-10 right-2" : "top-2 right-2",
                  )}>
                    <Percent className="h-2.5 w-2.5" />
                    {item.discountInfo?.type === "PERCENTAGE"
                      ? `${item.discountInfo.value}%`
                      : `₹${item.discountInfo?.value}`}
                  </Badge>
                )}
                {/* Multi-image indicator */}
                {item.additionalImages && item.additionalImages.length > 0 && (
                  <span className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
                    +{item.additionalImages.length}
                  </span>
                )}
                {/* Sold out overlay */}
                {item.availableUnits === 0 && item.available && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                    <Badge variant="destructive" className="text-xs font-semibold px-3 py-1">
                      Sold Out
                    </Badge>
                  </div>
                )}
                {/* Unavailable overlay */}
                {!item.available && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                    <Badge variant="outline" className="text-xs font-semibold px-3 py-1 border-muted-foreground/40 text-muted-foreground">
                      Unavailable
                    </Badge>
                  </div>
                )}
              </div>

              {/* Content */}
              <CardHeader className="px-3 pt-2.5 pb-1">
                <CardTitle className="text-sm sm:text-base leading-snug line-clamp-1">{item.name}</CardTitle>
                {item.description && (
                  <CardDescription className="text-xs line-clamp-2 leading-relaxed min-h-[2lh]">
                    {item.description}
                  </CardDescription>
                )}
                {item.canteenName && (
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Store className="h-3 w-3" />
                    <span className="truncate">{item.canteenName}</span>
                    {item.canteenLocation ? (
                      <span className="inline-flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3" />
                        {item.canteenLocation}
                      </span>
                    ) : null}
                  </div>
                )}
              </CardHeader>

              <CardContent className="flex-1 px-3 pb-1">
                <div className="flex items-center gap-2">
                  {item.discountedPrice != null ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base sm:text-lg font-bold text-emerald-700 dark:text-emerald-400">₹{item.discountedPrice}</span>
                      <span className="text-xs text-muted-foreground line-through">₹{item.price}</span>
                    </div>
                  ) : (
                    <span className="text-base sm:text-lg font-bold">₹{item.price}</span>
                  )}
                  {item.availableUnits != null && item.availableUnits > 0 && (
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      {item.availableUnits} left
                    </Badge>
                  )}
                </div>
              </CardContent>

              <CardFooter className="px-3 pb-3 pt-1 mt-auto">
                <AddToCartButton
                  menuItemId={item.id}
                  name={item.name}
                  price={item.price}
                  discountedPrice={item.discountedPrice}
                  availableUnits={item.availableUnits}
                  available={item.available}
                  canteenId={item.canteenId ?? ""}
                  canteenName={item.canteenName ?? "Unknown"}
                />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Video player overlay */}
      {playingVideoUrl && (
        <VideoPlayerOverlay
          videoUrl={playingVideoUrl}
          onClose={() => setPlayingVideoUrl(null)}
        />
      )}
    </>
  );
}
