"use client";

import { useEffect, useState, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Library, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type LibraryItem = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  status: string;
};

interface LibrarySelectorProps {
  value?: string | null;
  onChange: (libraryId: string | null) => void;
  showAll?: boolean;
  className?: string;
  compact?: boolean;
}

export function LibrarySelector({ value, onChange, showAll = false, className, compact = false }: LibrarySelectorProps) {
  const [libraries, setLibraries] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/org/libraries", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { libraries: LibraryItem[] };
      const active = (data.libraries || []).filter((l) => l.status === "ACTIVE");
      setLibraries(active);

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

  if (loading || libraries.length === 0) return null;

  // Single library — show as a static badge (always visible)
  if (libraries.length === 1) {
    const l = libraries[0];
    return (
      <Badge variant="outline" className={`gap-1.5 font-normal ${className ?? ""}`}>
        <Library className="h-3 w-3 text-muted-foreground" />
        {l.name}
        {l.location && (
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <MapPin className="h-2.5 w-2.5" />
            {l.location}
          </span>
        )}
      </Badge>
    );
  }

  // Multiple libraries — show dropdown
  return (
    <Select
      value={value ?? (showAll ? "__all__" : "")}
      onValueChange={(v) => onChange(v === "__all__" ? null : v)}
    >
      <SelectTrigger className={compact ? `h-8 w-[180px] text-xs ${className ?? ""}` : `h-9 w-[220px] ${className ?? ""}`}>
        <div className="flex items-center gap-1.5">
          <Library className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Select library" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {showAll && (
          <SelectItem value="__all__">
            <span className="font-medium">All libraries</span>
          </SelectItem>
        )}
        {libraries.map((l) => (
          <SelectItem key={l.id} value={l.id}>
            <div className="flex items-center gap-1.5">
              <span>{l.name}</span>
              {l.location && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {l.location}
                </span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
