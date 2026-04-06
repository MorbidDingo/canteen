"use client";

import { useCallback, useEffect, useState } from "react";

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

// Custom event name for same-tab cross-component sync
const SYNC_EVENT = "persisted-selection-sync";

export function usePersistedSelection(storageKey: string) {
  const [value, setValue] = useState<string | null>(() => readStorage(storageKey));

  const updateValue = useCallback(
    (nextValue: string | null) => {
      setValue(nextValue);
      if (typeof window === "undefined") return;
      try {
        if (!nextValue) {
          window.localStorage.removeItem(storageKey);
        } else {
          window.localStorage.setItem(storageKey, nextValue);
        }
      } catch {
        // Ignore storage write errors and keep in-memory state.
      }
      // Notify other hook instances in the same tab
      window.dispatchEvent(
        new CustomEvent(SYNC_EVENT, { detail: { key: storageKey, value: nextValue } }),
      );
    },
    [storageKey],
  );

  // Listen for sync events from other components in the same tab
  useEffect(() => {
    const handler = (e: Event) => {
      const { key, value: newVal } = (e as CustomEvent<{ key: string; value: string | null }>).detail;
      if (key === storageKey) setValue(newVal);
    };
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
  }, [storageKey]);

  return {
    value,
    setValue: updateValue,
    hydrated: true,
  } as const;
}
