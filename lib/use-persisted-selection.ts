"use client";

import { useCallback, useState } from "react";

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

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
    },
    [storageKey],
  );

  return {
    value,
    setValue: updateValue,
    hydrated: true,
  } as const;
}
