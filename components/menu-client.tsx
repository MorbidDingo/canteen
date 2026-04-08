"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Input } from "@/components/ui/input";
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
  X,
  Package,
  Tag,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Heart,
  Flame,
  TrendingUp,
  Leaf,
  Star,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCertePlusStore } from "@/lib/store/certe-plus-store";
import { MenuRecommendations } from "./recommendations/menu-recs";
import { AiQuickBar } from "@/components/ai/ai-quick-bar";
import { BottomSheet } from "@/components/ui/motion";

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
    setCurrentIndex(
      (prev) => (prev - 1 + mediaImages.length) % mediaImages.length,
    );
  };

  const nextImage = () => {
    setPlayingVideo(false);
    setCurrentIndex((prev) => (prev + 1) % mediaImages.length);
  };

  const handleSwipeEnd = (endX: number) => {
    if (dragStartX == null || dragStartTs == null || mediaImages.length < 2)
      return;

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
            {playingVideo ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-white" />
            )}
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
                style={{
                  transform: `translate3d(-${currentIndex * 100}%, 0, 0)`,
                }}
              >
                {mediaImages.map((imageSrc, imageIndex) => (
                  <div
                    key={`${item.id}-img-${imageIndex}`}
                    className="relative h-full w-full shrink-0"
                  >
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
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  prevImage();
                }}
                className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 md:h-7 md:w-7"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  nextImage();
                }}
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
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setPlayingVideo((prev) => !prev);
          }}
          className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition-transform hover:scale-110 hover:bg-black/75"
          aria-label={playingVideo ? "Show images" : "Play video"}
        >
          {playingVideo ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-white" />
          )}
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

type CategoryFilter = "ALL" | "FAVOURITES" | MenuCategory;

/* ── Local favourites (localStorage) ── */
const FAVS_KEY = "menu-favourites";
function getStoredFavourites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}
function persistFavourites(ids: Set<string>) {
  localStorage.setItem(FAVS_KEY, JSON.stringify([...ids]));
}

/* ── ML insight labels — driven by recommendation engine reasons ── */
type InsightLabel = { label: string; icon: React.ElementType; color: string };

const REASON_TO_INSIGHT: Record<string, InsightLabel> = {
  "Trending in your school": {
    label: "Trending",
    icon: TrendingUp,
    color: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30",
  },
  "Popular at this time": {
    label: "Popular Now",
    icon: Flame,
    color:
      "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/30",
  },
  "Popular with classmates": {
    label: "Popular",
    icon: Flame,
    color:
      "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/30",
  },
  "Highly rated": {
    label: "Top Rated",
    icon: Star,
    color:
      "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30",
  },
  "Well reviewed": {
    label: "Well Reviewed",
    icon: Star,
    color:
      "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30",
  },
  "Matches your preferences": {
    label: "For You",
    icon: Zap,
    color:
      "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/30",
  },
  "Often ordered with your favorites": {
    label: "Goes Well",
    icon: Leaf,
    color:
      "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/30",
  },
};

function pickInsightFromReasons(reasons: string[]): InsightLabel | null {
  for (const r of reasons) {
    const match = REASON_TO_INSIGHT[r];
    if (match) return match;
  }
  return null;
}

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
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [favourites, setFavourites] = useState<Set<string>>(() =>
    getStoredFavourites(),
  );
  const [mlInsights, setMlInsights] = useState<Map<string, InsightLabel>>(
    new Map(),
  );
  const certePlusStatus = useCertePlusStore((s) => s.status);
  const certePlusActive = certePlusStatus?.active === true;

  // Fetch ML insights from recommendation engine
  useEffect(() => {
    fetch("/api/recommendations/daily")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.recommendations) return;
        const map = new Map<string, InsightLabel>();
        for (const rec of data.recommendations as {
          menuItemId: string;
          reasons: string[];
        }[]) {
          const insight = pickInsightFromReasons(rec.reasons);
          if (insight) map.set(rec.menuItemId, insight);
        }
        setMlInsights(map);
      })
      .catch(() => {});
  }, []);

  const toggleFavourite = (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      persistFavourites(next);
      return next;
    });
  };

  const categoryCounts = useMemo(() => {
    return Object.values(MENU_CATEGORIES).reduce(
      (acc, category) => {
        acc[category] = items.filter(
          (item) => item.category === category,
        ).length;
        return acc;
      },
      {} as Record<MenuCategory, number>,
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = [...items];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q)),
      );
    }

    if (categoryFilter === "FAVOURITES") {
      result = result.filter((item) => favourites.has(item.id));
    } else if (categoryFilter !== "ALL") {
      result = result.filter((item) => item.category === categoryFilter);
    }

    // Sort unavailable items to the end
    result.sort((a, b) => {
      if (a.available === b.available) return 0;
      return a.available ? -1 : 1;
    });

    return result;
  }, [items, searchQuery, categoryFilter, favourites]);

  return (
    <>
      {/* ── Search bar ── */}
      <div
        className="sticky z-30 bg-background pb-2 -mt-1"
        style={
          { top: "calc(var(--header-h, 56px) - 4px)" } as React.CSSProperties
        }
      >
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted-foreground" />
          <Input
            placeholder="Search food..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 rounded-full bg-muted/40 border-0 pl-10 pr-10 text-[15px] placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-primary/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ── Category pills ── */}
        <div className="mt-2.5 flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          <button
            type="button"
            onClick={() => setCategoryFilter("ALL")}
            className={cn(
              "shrink-0 rounded-full px-4 h-9 text-[13px] font-medium transition-all",
              categoryFilter === "ALL"
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            All
          </button>
          {favourites.size > 0 && (
            <button
              type="button"
              onClick={() => setCategoryFilter("FAVOURITES")}
              className={cn(
                "shrink-0 rounded-full px-4 h-9 text-[13px] font-medium transition-all flex items-center gap-1.5",
                categoryFilter === "FAVOURITES"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
            >
              <Heart
                className={cn(
                  "h-3.5 w-3.5",
                  categoryFilter === "FAVOURITES"
                    ? "fill-primary-foreground"
                    : "fill-red-400 text-red-400",
                )}
              />
              Favourites
            </button>
          )}
          {Object.values(MENU_CATEGORIES).map((value) => {
            const count = categoryCounts[value] ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setCategoryFilter(value)}
                className={cn(
                  "shrink-0 rounded-full px-4 h-9 text-[13px] font-medium transition-all",
                  categoryFilter === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                {MENU_CATEGORY_LABELS[value]}
              </button>
            );
          })}
          {/* Pre-order shortcut pill */}
          <Link
            href="/pre-orders"
            className="shrink-0 rounded-full px-3.5 h-9 text-[13px] font-medium bg-muted/50 text-muted-foreground hover:bg-muted transition-all flex items-center gap-1.5 border border-border/40"
          >
            Pre-order
          </Link>
          <Link
            href="/orders"
            className="shrink-0 rounded-full px-3.5 h-9 text-[13px] font-medium bg-muted/50 text-muted-foreground hover:bg-muted transition-all flex items-center gap-1.5 border border-border/40"
          >
            Orders
          </Link>
        </div>
      </div>

      {/* ── AI "For You" rail ── */}
      {!searchQuery.trim() && categoryFilter === "ALL" && (
        <div className="mt-4 mb-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-primary mb-3">
            For You
          </p>
          <div className="overflow-x-auto scrollbar-none -mx-4 px-4">
            <div className="flex gap-3">
              <MenuRecommendations
                onItemClick={(id) => {
                  const match = items.find((i) => i.id === id);
                  if (match) setDetailItem(match);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── AI Quick Actions ── */}
      {!searchQuery.trim() && categoryFilter === "ALL" && (
        <div className="mt-2 mb-1">
          <AiQuickBar />
        </div>
      )}

      {/* ── Results count when searching ── */}
      {searchQuery.trim() && (
        <p className="text-[12px] text-muted-foreground mt-3 mb-1">
          {filteredItems.length} result{filteredItems.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* ── Menu list ── */}
      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Search className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <h2 className="text-xl font-semibold tracking-tight">
            No items found
          </h2>
          <p className="text-[13px] text-muted-foreground mt-1">
            Try adjusting your search or filters
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setCategoryFilter("ALL");
            }}
            className="mt-3 text-[13px] font-medium text-primary"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-4">
          {filteredItems.map((item, index) => {
            const insight = mlInsights.get(item.id) ?? null;
            const isFav = favourites.has(item.id);
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailItem(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailItem(item);
                  }
                }}
                className={cn(
                  "group relative flex overflow-hidden rounded-xl bg-card text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all active:scale-[0.99] animate-fade-in-up cursor-pointer",
                  !item.available && "opacity-60",
                )}
                style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
              >
                {/* Left — text content */}
                <div className="flex flex-1 flex-col justify-between p-3 pr-0 min-w-0">
                  <div className="space-y-1 min-w-0">
                    <p className="text-[15px] font-bold leading-snug line-clamp-2 pr-2">
                      {item.name}
                    </p>
                    {item.canteenName && (
                      <p className="text-[12px] text-muted-foreground truncate pr-2">
                        {item.canteenName}
                      </p>
                    )}
                    {/* Price */}
                    <div className="pt-0.5">
                      {item.discountedPrice != null ? (
                        <div className="flex items-baseline gap-1">
                          <span className="text-[15px] font-bold tabular-nums">
                            ₹{item.discountedPrice}
                          </span>
                          <span className="text-[11px] text-muted-foreground line-through tabular-nums">
                            ₹{item.price}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[15px] font-bold tabular-nums">
                          ₹{item.price}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bottom row — favourite + ML insight */}
                  <div className="flex items-center gap-2 mt-2">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => toggleFavourite(item.id, e)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFavourite(
                            item.id,
                            e as unknown as React.MouseEvent,
                          );
                        }
                      }}
                      className="shrink-0 flex items-center"
                    >
                      <Heart
                        className={cn(
                          "h-4 w-4 transition-colors",
                          isFav
                            ? "fill-red-500 text-red-500"
                            : "text-muted-foreground/40 hover:text-muted-foreground",
                        )}
                      />
                    </div>
                    {insight && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-px text-[10px] font-medium leading-tight",
                          insight.color,
                        )}
                      >
                        <insight.icon className="h-2.5 w-2.5" />
                        {insight.label}
                      </span>
                    )}
                    {item.discountedPrice != null && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 text-primary px-2 py-px text-[10px] font-bold leading-tight">
                        <Tag className="h-2.5 w-2.5" />
                        {item.discountInfo?.type === "PERCENTAGE"
                          ? `${item.discountInfo.value}% off`
                          : `₹${item.discountInfo?.value} off`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right — square image + add button */}
                <div className="relative w-[120px] shrink-0 self-stretch">
                  <div className="absolute inset-0 overflow-hidden bg-muted/40">
                    <MenuItemMedia item={item} />
                    {/* Sold out / unavailable overlay */}
                    {(item.availableUnits === 0 || !item.available) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {!item.available ? "Unavailable" : "Sold Out"}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Add button — anchored at bottom of image */}
                  <div
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AddToCartButton
                      menuItemId={item.id}
                      name={item.name}
                      price={item.price}
                      discountedPrice={item.discountedPrice}
                      availableUnits={item.availableUnits}
                      available={item.available}
                      category={item.category}
                      canteenId={item.canteenId ?? ""}
                      canteenName={item.canteenName ?? "Unknown"}
                      showLabel
                      compact
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Item detail bottom sheet ── */}
      {detailItem && (
        <BottomSheet
          open={!!detailItem}
          onClose={() => setDetailItem(null)}
          snapPoints={[65]}
        >
          <div className="space-y-4">
            {/* Large image carousel with video */}
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted">
              <MenuItemMedia item={detailItem} expanded />
            </div>

            {/* Title row with favourite */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-[22px] font-bold tracking-tight">
                  {detailItem.name}
                </h3>
                {detailItem.canteenName && (
                  <p className="text-[13px] text-muted-foreground mt-0.5">
                    {detailItem.canteenName}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => toggleFavourite(detailItem.id, e)}
                className="shrink-0 mt-1"
              >
                <Heart
                  className={cn(
                    "h-6 w-6 transition-colors",
                    favourites.has(detailItem.id)
                      ? "fill-red-500 text-red-500"
                      : "text-muted-foreground/40",
                  )}
                />
              </button>
            </div>

            {/* Description */}
            {detailItem.description && (
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                {detailItem.description}
              </p>
            )}

            {/* Price + add button */}
            <div className="flex items-center justify-between gap-3">
              <div>
                {detailItem.discountedPrice != null ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[24px] font-bold tabular-nums">
                      ₹{detailItem.discountedPrice}
                    </span>
                    <span className="text-[14px] text-muted-foreground line-through tabular-nums">
                      ₹{detailItem.price}
                    </span>
                  </div>
                ) : (
                  <span className="text-[24px] font-bold tabular-nums">
                    ₹{detailItem.price}
                  </span>
                )}
              </div>
              <AddToCartButton
                menuItemId={detailItem.id}
                name={detailItem.name}
                price={detailItem.price}
                discountedPrice={detailItem.discountedPrice}
                availableUnits={detailItem.availableUnits}
                available={detailItem.available}
                canteenId={detailItem.canteenId ?? ""}
                canteenName={detailItem.canteenName ?? "Unknown"}
              />
            </div>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
