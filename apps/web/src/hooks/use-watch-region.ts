"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "canto:watch-region";
const DEFAULT_REGION = "US";

/* -------------------------------------------------------------------------- */
/*  Simple external store so every consumer stays in sync                     */
/* -------------------------------------------------------------------------- */

type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string {
  if (typeof window === "undefined") return DEFAULT_REGION;
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_REGION;
}

function getServerSnapshot(): string {
  return DEFAULT_REGION;
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                      */
/* -------------------------------------------------------------------------- */

export function useWatchRegion(): {
  region: string;
  setRegion: (region: string) => void;
} {
  const region = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setRegion = useCallback((newRegion: string) => {
    localStorage.setItem(STORAGE_KEY, newRegion);
    emitChange();
  }, []);

  return { region, setRegion };
}
