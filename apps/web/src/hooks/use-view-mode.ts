"use client";

import { useState, useCallback, useEffect } from "react";
import type { ViewMode } from "@/components/layout/browse-layout.types";

/**
 * SSR-safe view mode state that persists to localStorage.
 * Renders with `defaultMode` on server + first client paint to avoid hydration mismatch,
 * then hydrates from localStorage after mount.
 */
export function useViewMode(
  key: string,
  defaultMode: ViewMode = "grid",
): [ViewMode, (mode: ViewMode) => void] {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultMode);

  useEffect(() => {
    const stored = localStorage.getItem(key) as ViewMode | null;
    if (stored && stored !== defaultMode) {
      setViewMode(stored);
    }
  }, [key, defaultMode]);

  const handleChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      localStorage.setItem(key, mode);
    },
    [key],
  );

  return [viewMode, handleChange];
}
