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
}

export function CanteenSelector({ value, onChange, showAll = false, className, compact = false }: CanteenSelectorProps) {
  const [canteens, setCanteens] = useState<Canteen[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/org/canteens", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { canteens: Canteen[] };
      const active = (data.canteens || []).filter((c) => c.status === "ACTIVE");
      setCanteens(active);

      // Auto-select first canteen if none selected and showAll is off
      if (!value && active.length >= 1 && !showAll) {
        onChange(active[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [onChange, value, showAll]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || canteens.length === 0) return null;

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
      <SelectContent className="rounded-xl">
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
