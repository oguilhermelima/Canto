"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { ReactNode as ReactNodeType } from "react";

interface DedupItem {
  provider: string;
  externalId: number | string;
}

/** Show unfiltered items if cross-section dedup would leave the section sparser than this. */
const MIN_ITEMS_AFTER_DEDUP = 8;

interface DedupContextType {
  /**
   * Filter items against other sections' claims and register this section's
   * items in one step. Must be called during render. Replaces any prior
   * registration for `sectionId` (so re-renders do not accumulate state).
   * Falls back to unfiltered items when cross-section dedup would shrink the
   * section below `MIN_ITEMS_AFTER_DEDUP`; in that case the section does not
   * claim items so other sections stay unaffected.
   */
  syncSection: (sectionId: string, items: DedupItem[]) => DedupItem[];
  clearSection: (sectionId: string) => void;
}

const DedupContext = createContext<DedupContextType | undefined>(undefined);

function itemKey(item: DedupItem): string {
  return `${item.provider}-${item.externalId}`;
}

export function DedupProvider({ children }: { children: ReactNodeType }): React.JSX.Element {
  const sectionsRef = useRef<Map<string, Set<string>>>(new Map());

  const value = useMemo<DedupContextType>(
    () => ({
      syncSection: (sectionId, items) => {
        const claimed = new Set<string>();
        for (const [id, keys] of sectionsRef.current) {
          if (id === sectionId) continue;
          for (const k of keys) claimed.add(k);
        }
        const filtered = items.filter((item) => !claimed.has(itemKey(item)));

        if (items.length > MIN_ITEMS_AFTER_DEDUP && filtered.length < MIN_ITEMS_AFTER_DEDUP) {
          sectionsRef.current.set(sectionId, new Set());
          return items;
        }

        const mySet = new Set<string>();
        for (const item of filtered) mySet.add(itemKey(item));
        sectionsRef.current.set(sectionId, mySet);
        return filtered;
      },
      clearSection: (sectionId) => {
        sectionsRef.current.delete(sectionId);
      },
    }),
    [],
  );

  return <DedupContext.Provider value={value}>{children}</DedupContext.Provider>;
}

export function useDedup(): DedupContextType {
  const ctx = useContext(DedupContext);
  if (!ctx) throw new Error("useDedup must be used within DedupProvider");
  return ctx;
}

export function useSectionDedup<T extends DedupItem>(
  sectionId: string,
  items: T[],
  options?: { enabled?: boolean },
): T[] {
  const dedup = useDedup();
  const enabled = options?.enabled ?? true;

  const filtered = useMemo(
    () => (enabled ? (dedup.syncSection(sectionId, items) as T[]) : items),
    [dedup, sectionId, items, enabled],
  );

  useEffect(() => {
    return () => dedup.clearSection(sectionId);
  }, [dedup, sectionId]);

  return filtered;
}
