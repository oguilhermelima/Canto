"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode as ReactNodeType } from "react";

interface DedupContextType {
  isItemRendered: (provider: string, externalId: number | string) => boolean;
  markItemRendered: (provider: string, externalId: number | string) => void;
}

const DedupContext = createContext<DedupContextType | undefined>(undefined);

export function DedupProvider({ children }: { children: ReactNodeType }): React.JSX.Element {
  // Global set of already-rendered items across all sections
  const [renderedItems] = useState(() => new Set<string>());

  const value: DedupContextType = useMemo(
    () => ({
      isItemRendered: (provider, externalId) => {
        const key = `${provider}-${externalId}`;
        return renderedItems.has(key);
      },
      markItemRendered: (provider, externalId) => {
        const key = `${provider}-${externalId}`;
        renderedItems.add(key);
      },
    }),
    [renderedItems],
  );

  return (
    <DedupContext.Provider value={value}>
      {children}
    </DedupContext.Provider>
  );
}

export function useDedup(): DedupContextType {
  const context = useContext(DedupContext);
  if (!context) {
    throw new Error("useDedup must be used within DedupProvider");
  }
  return context;
}
