"use client";

import { useMemo, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [discountsOnly, setDiscountsOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [dismissDiscountBanner, setDismissDiscountBanner] = useState(false);

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

  return (
    <>
      {discountedItems.length > 0 && !discountsOnly && !dismissDiscountBanner && (
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-amber-200/70 bg-linear-to-r from-amber-400 via-yellow-300 to-amber-500 p-px shadow-[0_10px_24px_rgba(180,115,0,0.25)] animate-fade-in">
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_15%_30%,rgba(255,255,255,0.35),transparent_40%),radial-gradient(circle_at_85%_70%,rgba(255,255,255,0.25),transparent_45%)]" />
          <div className="pointer-events-none absolute -left-1/3 top-0 h-full w-1/2 rotate-12 bg-linear-to-r from-transparent via-white/80 to-transparent animate-banner-glitter" />
          <button
            onClick={() => setDiscountsOnly(true)}
            className="relative z-10 w-full rounded-[15px] bg-linear-to-r from-[#c9911c] via-[#e0ae2a] to-[#b97f14] px-4 py-3 pr-12 sm:px-6 sm:py-4 sm:pr-14 flex items-center justify-between gap-3 text-white text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 rounded-full bg-white/20 p-2 ring-1 ring-white/35">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 text-left">
                <p className="font-bold text-sm sm:text-base truncate">
                  {discountedItems.length} item{discountedItems.length > 1 ? "s" : ""} on discount!
                </p>
                {bestDiscount && (
                  <p className="text-xs sm:text-sm text-white/80 truncate">
                    Save up to ₹
                    {(bestDiscount.price - (bestDiscount.discountedPrice ?? bestDiscount.price)).toFixed(0)} on {bestDiscount.name}
                  </p>
                )}
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5 text-xs sm:text-sm font-semibold ring-1 ring-white/30">
              <Tag className="h-3.5 w-3.5" />
              View Deals
            </div>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-20 h-8 w-8 rounded-full text-white hover:text-white hover:bg-black/20"
            onClick={(e) => {
              e.stopPropagation();
              setDismissDiscountBanner(true);
            }}
            aria-label="Dismiss discount banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {discountsOnly && (
        <div className="flex items-center gap-2 mb-4 animate-fade-in justify-between w-full">
          <Badge className="bg-gold-600 hover:bg-gold-700 text-gold gap-1 py-1 px-3">
            <Tag className="h-3 w-3" />
            Showing discounted items only
          </Badge>
          <Button variant='ghost' onClick={() => setDiscountsOnly(false)} className="">
            <X className="bg-none" />
          </Button>
        </div>
      )}

      <div className="space-y-3 mb-6 animate-fade-in">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
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
            className="shrink-0 relative"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />
            )}
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Items ({items.length})</SelectItem>
              {Object.values(MENU_CATEGORIES).map((value) => (
                <SelectItem key={value} value={value}>
                  {MENU_CATEGORY_LABELS[value]} ({categoryCounts[value] ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showFilters && (
          <div className="flex flex-col sm:flex-row gap-3 p-3 rounded-lg border bg-muted/30 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Max Price (₹)</Label>
              <Input
                type="number"
                placeholder={`Up to ₹${priceRange.max}`}
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                min={0}
                className="h-9"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sort By</Label>
              <Select
                value={sortBy}
                onValueChange={(v) => setSortBy(v as SortOption)}
              >
                <SelectTrigger className="h-9">
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
          <p className="text-xs text-muted-foreground animate-fade-in">
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
      </div>

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
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filteredItems.map((item, index) => (
            <Card
              key={item.id}
              className="flex flex-col card-interactive animate-fade-in-up p-0 overflow-hidden group"
              style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
            >
              {/* Image area with consistent aspect ratio */}
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/40">
                <MenuItemImage
                  src={item.imageUrl}
                  alt={item.name}
                  category={item.category as MenuCategory}
                />
                {/* Category badge on image */}
                <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] backdrop-blur-sm bg-background/80 shadow-sm">
                  {MENU_CATEGORY_LABELS[item.category as MenuCategory]}
                </Badge>
                {/* Discount badge on image */}
                {item.discountedPrice != null && (
                  <Badge className="absolute top-2 right-2 bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] gap-0.5 shadow-sm">
                    <Percent className="h-2.5 w-2.5" />
                    {item.discountInfo?.type === "PERCENTAGE"
                      ? `${item.discountInfo.value}%`
                      : `₹${item.discountInfo?.value}`}
                  </Badge>
                )}
                {/* Sold out overlay */}
                {item.availableUnits === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                    <Badge variant="destructive" className="text-xs font-semibold px-3 py-1">
                      Sold Out
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
                />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
