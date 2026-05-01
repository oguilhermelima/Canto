"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { ViewMode } from "@/components/layout/browse-layout.types";

const STORAGE_EVENT = "canto:view-mode-change";

/**
 * SSR-safe view mode state that persists to localStorage.
 * Renders with `defaultMode` on server + first client paint to avoid hydration mismatch,
 * then hydrates from localStorage after mount via useSyncExternalStore.
 */
export function useViewMode(
  key: string,
  defaultMode: ViewMode = "grid",
): [ViewMode, (mode: ViewMode) => void] {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof window === "undefined") return () => undefined;
      const onChange = (e: Event): void => {
        if (e instanceof StorageEvent && e.key !== null && e.key !== key) return;
        cb();
      };
      window.addEventListener("storage", onChange);
      window.addEventListener(STORAGE_EVENT, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(STORAGE_EVENT, onChange);
      };
    },
    [key],
  );

  const getSnapshot = useCallback((): ViewMode => {
    if (typeof window === "undefined") return defaultMode;
    const stored = localStorage.getItem(key) as ViewMode | null;
    return stored ?? defaultMode;
  }, [key, defaultMode]);

  const getServerSnapshot = useCallback((): ViewMode => defaultMode, [defaultMode]);

  const viewMode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const handleChange = useCallback(
    (mode: ViewMode) => {
      localStorage.setItem(key, mode);
      // Notify subscribers in the same tab; native "storage" only fires cross-tab.
      window.dispatchEvent(new Event(STORAGE_EVENT));
    },
    [key],
  );

  return [viewMode, handleChange];
}
