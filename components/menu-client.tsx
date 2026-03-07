"use client";

import { useState, useMemo } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";

const categoryIcons: Record<MenuCategory, React.ElementType> = {
  SNACKS: Cookie,
  MEALS: UtensilsCrossed,
  DRINKS: Coffee,
  PACKED_FOOD: Package,
};

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  imageUrl: string | null;
  available: boolean;
}

type SortOption =
  | "default"
  | "price-asc"
  | "price-desc"
  | "name-asc"
  | "name-desc";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "price-asc", label: "Price: Low → High" },
  { value: "price-desc", label: "Price: High → Low" },
  { value: "name-asc", label: "Name: A → Z" },
  { value: "name-desc", label: "Name: Z → A" },
];

export function MenuClient({ items }: { items: MenuItem[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Compute price range from data
  const priceRange = useMemo(() => {
    if (items.length === 0) return { min: 0, max: 100 };
    const prices = items.map((i) => i.price);
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [items]);

  // Filter + search + sort
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Search by name & description
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q)),
      );
    }

    // Price filter
    const maxP = parseFloat(maxPrice);
    if (!isNaN(maxP) && maxP > 0) {
      result = result.filter((item) => item.price <= maxP);
    }

    // Sort
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
    }

    return result;
  }, [items, searchQuery, sortBy, maxPrice]);

  // Group by category
  const grouped = Object.values(MENU_CATEGORIES).reduce(
    (acc, cat) => {
      acc[cat] = filteredItems.filter((item) => item.category === cat);
      return acc;
    },
    {} as Record<MenuCategory, MenuItem[]>,
  );

  const firstNonEmptyCategory =
    Object.entries(grouped).find(([, items]) => items.length > 0)?.[0] ||
    "SNACKS";

  const hasActiveFilters =
    searchQuery.trim() || maxPrice || sortBy !== "default";
  const totalFiltered = filteredItems.length;

  const clearFilters = () => {
    setSearchQuery("");
    setMaxPrice("");
    setSortBy("default");
  };

  return (
    <>
      {/* Search & Filter Bar */}
      <div className="space-y-3 mb-6 animate-fade-in">
        {/* Search row */}
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

        {/* Expandable filter panel */}
        {showFilters && (
          <div className="flex flex-col sm:flex-row gap-3 p-3 rounded-lg border bg-muted/30 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Max Price (₹)
              </Label>
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

        {/* Results count */}
        {hasActiveFilters && (
          <p className="text-xs text-muted-foreground animate-fade-in">
            Showing {totalFiltered} of {items.length} items
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
            {maxPrice && !isNaN(parseFloat(maxPrice)) && (
              <> under ₹{parseFloat(maxPrice)}</>
            )}
          </p>
        )}
      </div>

      {/* Menu Items */}
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
        <Tabs defaultValue={firstNonEmptyCategory} className="w-full">
          <TabsList className="w-full justify-start mb-4 overflow-x-auto overflow-y-hidden">
            {Object.entries(MENU_CATEGORIES).map(([key, value]) => {
              const Icon = categoryIcons[value];
              const count = grouped[value]?.length || 0;
              return (
                <TabsTrigger
                  key={key}
                  value={value}
                  className="gap-2"
                  disabled={count === 0}
                >
                  <Icon className="h-4 w-4" />
                  <span>{MENU_CATEGORY_LABELS[value]}</span>
                  {count > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {count}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {Object.entries(MENU_CATEGORIES).map(([key, value]) => (
            <TabsContent key={key} value={value}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {grouped[value]?.map((item, index) => (
                  <Card
                    key={item.id}
                    className="flex flex-col card-interactive animate-fade-in-up"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <div className="relative h-32 sm:h-36 rounded-t-lg overflow-hidden bg-gradient-to-br from-muted/30 to-muted/80">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          {(() => {
                            const Icon =
                              categoryIcons[item.category as MenuCategory];
                            return (
                              <Icon className="h-10 w-10 text-muted-foreground/40" />
                            );
                          })()}
                        </div>
                      )}
                    </div>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{item.name}</CardTitle>
                        <Badge
                          variant="outline"
                          className="shrink-0 font-bold text-sm"
                        >
                          ₹{item.price}
                        </Badge>
                      </div>
                      {item.description && (
                        <CardDescription className="text-sm line-clamp-2">
                          {item.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="flex-1" />
                    <CardFooter>
                      <AddToCartButton
                        menuItemId={item.id}
                        name={item.name}
                        price={item.price}
                      />
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </>
  );
}
