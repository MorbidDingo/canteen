"use client";

import { useEffect, useState, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
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

      // Auto-select first library if none selected and showAll is off
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

  if (loading || libraries.length === 0) {
    return (
      <Badge variant="outline" className={`gap-1.5 font-normal text-muted-foreground ${className ?? ""}`}>
        <Library className="h-3 w-3 text-muted-foreground" />
        {loading ? "Loading…" : "No library"}
      </Badge>
    );
  }

  // Single library without showAll — show as a static badge
  if (libraries.length === 1 && !showAll) {
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

  // Multiple libraries or showAll — show dropdown
  const selectedLabel = value
    ? libraries.find((l) => l.id === value)?.name
    : showAll ? "All libraries" : undefined;

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
          <Library className="h-3.5 w-3.5 shrink-0 text-[#d4891a]" />
          <span className="truncate">{selectedLabel ?? "Select library"}</span>
        </div>
      </SelectTrigger>
      <SelectContent className="rounded-xl">
        {showAll && (
          <SelectItem value="__all__" className="rounded-lg">
            <div className="flex items-center gap-2">
              <span className="font-medium">All libraries</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {libraries.length}
              </Badge>
            </div>
          </SelectItem>
        )}
        {libraries.map((l) => (
          <SelectItem key={l.id} value={l.id} className="rounded-lg">
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
