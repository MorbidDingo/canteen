"use client";

import { useEffect, useState, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

      // Auto-select first canteen if none selected
      if (!value && active.length >= 1) {
        onChange(active[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [onChange, value]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || canteens.length === 0) return null;

  // Single canteen — show as a static badge (always visible)
  if (canteens.length === 1) {
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

  // Multiple canteens — show dropdown
  return (
    <Select
      value={value ?? (showAll ? "__all__" : "")}
      onValueChange={(v) => onChange(v === "__all__" ? null : v)}
    >
      <SelectTrigger className={compact ? `h-8 w-[180px] text-xs ${className ?? ""}` : `h-9 w-[220px] ${className ?? ""}`}>
        <div className="flex items-center gap-1.5">
          <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Select canteen" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {showAll && (
          <SelectItem value="__all__">
            <span className="font-medium">All canteens</span>
          </SelectItem>
        )}
        {canteens.map((c) => (
          <SelectItem key={c.id} value={c.id}>
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
