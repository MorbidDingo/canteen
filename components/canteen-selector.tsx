"use client";

import { useEffect, useState, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Store, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Canteen = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  status: string;
};

interface CanteenSelectorProps {
  value?: string | null;
  onChange: (canteenId: string | null) => void;
  showAll?: boolean;
  className?: string;
  compact?: boolean;
  includeInactive?: boolean;
  iconOnly?: boolean;
}

export function CanteenSelector({ value, onChange, showAll = false, className, compact = false, includeInactive = false, iconOnly = false }: CanteenSelectorProps) {
  const [canteens, setCanteens] = useState<Canteen[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/org/canteens", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { canteens: Canteen[] };
      const allCanteens = data.canteens || [];
      const visibleCanteens = includeInactive
        ? allCanteens
        : allCanteens.filter((c) => c.status === "ACTIVE");
      setCanteens(visibleCanteens);

      // Reset stale value that doesn't match any loaded canteen
      if (value && !visibleCanteens.some((c) => c.id === value)) {
        onChange(null);
      }
      // Auto-select first canteen if none selected and showAll is off
      else if (!value && visibleCanteens.length >= 1 && !showAll) {
        onChange(visibleCanteens[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [includeInactive, onChange, value, showAll]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || canteens.length === 0) {
    return (
      <Badge variant="outline" className={`gap-1.5 font-normal text-muted-foreground ${className ?? ""}`}>
        <Store className="h-3 w-3 text-muted-foreground" />
        {loading ? "Loading…" : "No canteen"}
      </Badge>
    );
  }

  // Single canteen without showAll — show as a static badge
  if (canteens.length === 1 && !showAll) {
    const c = canteens[0];
    return (
      <Badge variant="outline" className={`gap-1.5 font-normal ${className ?? ""}`}>
        <Store className="h-3 w-3 text-muted-foreground" />
        {c.name}
        {c.location && (
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <MapPin className="h-2.5 w-2.5" />
            {c.location}
          </span>
        )}
      </Badge>
    );
  }

  // Multiple canteens or showAll — show dropdown
  const selectedLabel = value
    ? canteens.find((c) => c.id === value)?.name
    : showAll ? "All canteens" : undefined;

  // Icon-only trigger (mobile compact variant)
  if (iconOnly) {
    return (
      <Select
        value={value ?? (showAll ? "__all__" : "")}
        onValueChange={(v) => onChange(v === "__all__" ? null : v)}
      >
        <SelectTrigger
          className={`h-9 w-9 shrink-0 rounded-full border-border/60 bg-background/80 p-0 shadow-sm backdrop-blur-sm [&>svg:last-child]:hidden ${className ?? ""}`}
        >
          <Store className="mx-auto h-4 w-4 text-[#d4891a]" />
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="rounded-xl max-w-[calc(100vw-2rem)]">
          {showAll && (
            <SelectItem value="__all__" className="rounded-lg">
              <div className="flex items-center gap-2">
                <span className="font-medium">All canteens</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {canteens.length}
                </Badge>
              </div>
            </SelectItem>
          )}
          {canteens.map((c) => (
            <SelectItem key={c.id} value={c.id} className="rounded-lg">
              <div className="flex items-center gap-1.5">
                <span>{c.name}</span>
                {includeInactive && c.status !== "ACTIVE" && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Closed
                  </Badge>
                )}
                {c.location && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {c.location}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select
      value={value ?? (showAll ? "__all__" : "")}
      onValueChange={(v) => onChange(v === "__all__" ? null : v)}
    >
      <SelectTrigger
        className={
          compact
            ? `h-8 w-auto min-w-[140px] max-w-[220px] text-xs gap-1.5 rounded-full border-border/60 bg-background/80 backdrop-blur-sm shadow-sm transition-colors hover:bg-accent/50 ${className ?? ""}`
            : `h-9 w-auto min-w-[160px] max-w-[260px] gap-1.5 rounded-full border-border/60 bg-background/80 backdrop-blur-sm shadow-sm transition-colors hover:bg-accent/50 ${className ?? ""}`
        }
      >
        <div className="flex items-center gap-1.5 truncate">
          <Store className="h-3.5 w-3.5 shrink-0 text-[#d4891a]" />
          <span className="truncate">{selectedLabel ?? "Select canteen"}</span>
        </div>
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="rounded-xl max-w-[calc(100vw-2rem)]">
        {showAll && (
          <SelectItem value="__all__" className="rounded-lg">
            <div className="flex items-center gap-2">
              <span className="font-medium">All canteens</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {canteens.length}
              </Badge>
            </div>
          </SelectItem>
        )}
        {canteens.map((c) => (
          <SelectItem key={c.id} value={c.id} className="rounded-lg">
            <div className="flex items-center gap-1.5">
              <span>{c.name}</span>
              {includeInactive && c.status !== "ACTIVE" && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Closed
                </Badge>
              )}
              {c.location && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {c.location}
                </span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
